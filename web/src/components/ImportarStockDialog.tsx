import { useEffect, useRef, useState } from 'react'

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  TriangleAlert,
  Undo2,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { desformatearMonto } from '@/lib/format'
import {
  anularImportacion,
  CAMPOS_EXCEL,
  construirFilas,
  detectarColumnas,
  importarStockExcel,
  leerExcel,
  mapeoSinAsignar,
  type MapeoColumnas,
  type MonedaImport,
  type ResultadoAnulacion,
  type ResultadoImportacion,
  type TablaExcel,
} from '@/lib/importarExcel'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sucursales: Array<{ id: string; nombre: string }>
  sucursalId: string
  onImportado: () => void
}

type Paso = 'archivo' | 'mapeo' | 'confirmar' | 'importando' | 'resultado'

export default function ImportarStockDialog({
  open,
  onOpenChange,
  sucursales,
  sucursalId,
  onImportado,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [paso, setPaso] = useState<Paso>('archivo')
  const [tabla, setTabla] = useState<TablaExcel | null>(null)
  const [mapeo, setMapeo] = useState<MapeoColumnas>(mapeoSinAsignar())
  const [sucursal, setSucursal] = useState(() =>
    sucursales.some((s) => s.id === sucursalId)
      ? sucursalId
      : (sucursales[0]?.id ?? ''),
  )
  const [precioDefault, setPrecioDefault] = useState('')
  const [monedaDefault, setMonedaDefault] = useState<MonedaImport>('PYG')
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [revertido, setRevertido] = useState<ResultadoAnulacion | null>(null)
  const [revertiendo, setRevertiendo] = useState(false)
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sucursales.some((s) => s.id === sucursal)) {
      setSucursal(sucursales[0]?.id ?? '')
    }
  }, [sucursal, sucursales])

  function reiniciar() {
    setPaso('archivo')
    setTabla(null)
    setMapeo(mapeoSinAsignar())
    setSucursal(
      sucursales.some((s) => s.id === sucursalId)
        ? sucursalId
        : (sucursales[0]?.id ?? ''),
    )
    setPrecioDefault('')
    setMonedaDefault('PYG')
    setResultado(null)
    setRevertido(null)
    setRevertiendo(false)
    setProgreso({ hecho: 0, total: 0 })
    setError(null)
  }

  function cerrar() {
    onOpenChange(false)
    reiniciar()
  }

  async function manejarArchivo(file: File | undefined | null) {
    if (!file) return
    setError(null)
    try {
      const t = await leerExcel(file)
      if (t.headers.length < 2) {
        setError('El archivo no tiene columnas reconocibles.')
        return
      }
      setTabla(t)
      setMapeo(detectarColumnas(t.headers))
      setPaso('mapeo')
    } catch {
      setError('No se pudo leer el archivo. Asegurate de que sea .xlsx o .csv válido.')
    }
  }

  const precioFaltante = mapeo.precio === null
  const monedaFaltante = mapeo.moneda === null

  function armarYPrevisualizar() {
    if (!tabla) return
    const { filas, invalidas } = construirFilas({
      tabla,
      mapeo,
      precioDefault: numeroValido(precioDefault),
      monedaDefault,
    })
    return { filas, invalidas }
  }

  async function ejecutar() {
    const preparado = armarYPrevisualizar()
    if (!tabla || !preparado) return
    if (preparado.filas.length === 0) {
      setError('No hay filas válidas para importar.')
      return
    }
    if (!sucursales.some((s) => s.id === sucursal)) {
      setError('Elegí la sucursal destino antes de importar.')
      return
    }
    setError(null)
    setPaso('importando')
    setProgreso({ hecho: 0, total: preparado.filas.length })
    try {
      const res = await importarStockExcel(preparado.filas, sucursal, (hecho, total) =>
        setProgreso({ hecho, total }),
      )
      setResultado(res)
      setPaso('resultado')
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Ocurrió un error al importar. ¿Estás conectado?',
      )
      setResultado(null)
      setPaso('confirmar')
    }
  }

  async function deshacer() {
    if (!resultado?.loteId) return
    if (!window.confirm('¿Deshacer esta importación? Se restaura el stock como estaba antes de importar.')) {
      return
    }
    setRevertiendo(true)
    setError(null)
    try {
      const r = await anularImportacion(resultado.loteId)
      setRevertido(r)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo deshacer la importación.',
      )
    } finally {
      setRevertiendo(false)
    }
  }

  const headersConIndice = (tabla?.headers ?? []).map((h, i) => ({
    indice: i,
    etiqueta: h.trim() ? h : `Columna ${i + 1}`,
  }))

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next) cerrar()
      else onOpenChange(true)
    }}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Excel</DialogTitle>
          <DialogDescription>
            Carga el stock de una empresa desde un .xlsx o .csv. La cantidad del
            archivo reemplaza a la actual de la sucursal elegida.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            {error}
          </p>
        )}

        {paso === 'archivo' && (
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => void manejarArchivo(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center hover:border-foreground/40"
            >
              <FileUp className="size-8 text-muted-foreground" />
              <div className="text-sm font-semibold">Elegir archivo Excel</div>
              <div className="text-xs text-muted-foreground">
                .xlsx o .csv · hasta 5 MB y 10.000 filas · detecta nombre,
                código, precio, cantidad… y podés corregir el mapeo en el
                próximo paso.
              </div>
            </button>

            <div className="space-y-1.5">
              <Label>Sucursal destino</Label>
              {sucursales.length === 0 ? (
                <p className="rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-700">
                  Todavía no hay sucursales creadas. Creá una en el módulo
                  Sucursales y volvé a importar.
                </p>
              ) : (
                <Select value={sucursal} onValueChange={setSucursal}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sucursales.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}

        {paso === 'mapeo' && tabla && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Detecté {tabla.filas.length} filas de datos en «{tabla.nombreArchivo}».
              Revisá que cada campo apunte a la columna correcta.
            </p>
            <div className="space-y-1.5">
              {CAMPOS_EXCEL.map(({ campo, etiqueta, obligatorio }) => (
                <div key={campo} className="flex items-center gap-2">
                  <span className="w-44 shrink-0 text-sm">
                    {etiqueta}
                    {obligatorio && <span className="text-destructive"> *</span>}
                  </span>
                  <Select
                    value={mapeo[campo]?.toString() ?? 'nada'}
                    onValueChange={(v) =>
                      setMapeo((prev) => ({
                        ...prev,
                        [campo]: v === 'nada' ? null : Number(v),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nada">— No importar —</SelectItem>
                      {headersConIndice.map((h) => (
                        <SelectItem key={h.indice} value={h.indice.toString()}>
                          {h.etiqueta || `Columna ${h.indice + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPaso('archivo')}>
                <ArrowLeft />
                Atrás
              </Button>
              <Button onClick={() => setPaso('confirmar')}>
                Continuar
                <ArrowRight />
              </Button>
            </DialogFooter>
          </div>
        )}

        {paso === 'confirmar' && tabla && (
          <VistaConfirmar
            tabla={tabla}
            mapeo={mapeo}
            precioFaltante={precioFaltante}
            monedaFaltante={monedaFaltante}
            precioDefault={precioDefault}
            setPrecioDefault={setPrecioDefault}
            monedaDefault={monedaDefault}
            setMonedaDefault={setMonedaDefault}
            atras={() => setPaso('mapeo')}
            importar={() => void ejecutar()}
          />
        )}

        {paso === 'importando' && (
          <div className="space-y-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-foreground transition-[width] duration-150"
                style={{ width: `${porciento(progreso)}%` }}
              />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Importando {progreso.hecho.toLocaleString('es-PY')} de{' '}
              {progreso.total.toLocaleString('es-PY')}…
            </p>
          </div>
        )}

        {paso === 'resultado' && resultado && (
          <div className="space-y-3">
            {revertido === null && (
              <div className="grid grid-cols-3 gap-2">
                <ResumenValor valor={resultado.creados} etiqueta="creados" variante="ok" />
                <ResumenValor
                  valor={resultado.actualizados}
                  etiqueta="actualizados"
                  variante="ok"
                />
                <ResumenValor
                  valor={resultado.sinCambios}
                  etiqueta="sin cambios"
                  variante="neutral"
                />
              </div>
            )}
            {revertido !== null && (
              <div className="space-y-2 rounded-lg border border-emerald-300/50 bg-emerald-50 p-3 text-sm text-emerald-700">
                <p className="font-semibold">Importación deshecha</p>
                <p>
                  {revertido.restauradas} restauradas · {revertido.eliminadas} eliminadas
                  {revertido.saltadas > 0 &&
                    ` · ${revertido.saltadas} con ventas, no se tocaron`}
                </p>
              </div>
            )}
            {resultado.errores.length > 0 && revertido === null && (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                <p className="text-sm font-semibold">
                  {resultado.errores.length} fila(s) con error
                </p>
                {resultado.errores.slice(0, 20).map((e, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                    <XCircle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      Fila {e.fila}: {e.motivo}
                    </span>
                  </p>
                ))}
              </div>
            )}
            <DialogFooter className="gap-2">
              {resultado.loteId && revertido === null && (
                <Button variant="outline" disabled={revertiendo} onClick={() => void deshacer()}>
                  <Undo2 />
                  Deshacer importación
                </Button>
              )}
              <Button
                onClick={() => {
                  onImportado()
                  cerrar()
                }}
              >
                Listo
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function porciento({ hecho, total }: { hecho: number; total: number }): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((hecho / total) * 100))
}

function numeroValido(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(desformatearMonto(s))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function ResumenValor({
  valor,
  etiqueta,
  variante,
}: {
  valor: number
  etiqueta: string
  variante: 'ok' | 'warning' | 'neutral'
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-center',
        variante === 'ok' && 'border-emerald-300/50 bg-emerald-50 text-emerald-700',
        variante === 'warning' && 'border-amber-300/50 bg-amber-50 text-amber-700',
        variante === 'neutral' && 'bg-muted/50',
      )}
    >
      <p className="text-xl font-semibold tabular-nums">{valor.toLocaleString('es-PY')}</p>
      <p className="text-xs">{etiqueta}</p>
    </div>
  )
}

function VistaConfirmar({
  tabla,
  mapeo,
  precioFaltante,
  monedaFaltante,
  precioDefault,
  setPrecioDefault,
  monedaDefault,
  setMonedaDefault,
  atras,
  importar,
}: {
  tabla: TablaExcel
  mapeo: MapeoColumnas
  precioFaltante: boolean
  monedaFaltante: boolean
  precioDefault: string
  setPrecioDefault: (v: string) => void
  monedaDefault: MonedaImport
  setMonedaDefault: (v: MonedaImport) => void
  atras: () => void
  importar: () => void
}) {
  const preview = construirFilas({
    tabla,
    mapeo,
    precioDefault: numeroValido(precioDefault),
    monedaDefault,
  })

  return (
    <div className="space-y-3">
      {precioFaltante && (
        <div className="rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-800">
          Este archivo no tiene columna de precio. Se aplicará el precio por
          defecto a todos los productos.{' '}
          {precioDefault === '' && 'Completalo para poder importar.'}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Precio por defecto</Label>
          <Input
            inputMode="decimal"
            placeholder={precioFaltante ? 'Ej: 25000' : 'Opcional'}
            value={precioDefault}
            onChange={(e) => setPrecioDefault(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Moneda de los precios</Label>
          <Select
            value={monedaDefault}
            onValueChange={(v) => setMonedaDefault(v as MonedaImport)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PYG">Guaranies (PYG)</SelectItem>
              <SelectItem value="USD">Dolares (USD)</SelectItem>
              <SelectItem value="BRL">Reales (BRL)</SelectItem>
              <SelectItem value="ARS">Pesos argentinos (ARS)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Solo etiqueta los precios, no convierte los montos.
            {!monedaFaltante && ' La columna Moneda del archivo tiene prioridad.'}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="p-2 font-medium">Nombre</th>
              <th className="p-2 font-medium">Código / SKU</th>
              <th className="p-2 font-medium">Precio</th>
              <th className="p-2 font-medium">Cant.</th>
            </tr>
          </thead>
          <tbody>
            {preview.filas.slice(0, 6).map((f, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-2">{f.nombre}</td>
                <td className="p-2 text-muted-foreground">
                  {[f.codigo, f.sku].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="p-2 tabular-nums">{f.precio.toLocaleString('es-PY')}</td>
                <td className="p-2 tabular-nums">{f.cantidad.toLocaleString('es-PY')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5" />
        {preview.filas.length.toLocaleString('es-PY')} filas válidas
        {preview.invalidas.length > 0 &&
          ` · ${preview.invalidas.length} sin nombre o precio válido (se omiten)`}
      </p>

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={atras}>
          <ArrowLeft />
          Volver al mapeo
        </Button>
        <Button onClick={importar} disabled={preview.filas.length === 0}>
          {preview.filas.length === 0 ? 'Sin filas válidas' : 'Importar'}
        </Button>
      </DialogFooter>
    </div>
  )
}