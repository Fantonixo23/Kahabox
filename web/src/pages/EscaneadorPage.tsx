import { useEffect, useState, type FormEvent } from 'react'

import {
  Check,
  Package,
  PackagePlus,
  Plus,
  ScanBarcode,
  Send,
  Wifi,
  WifiOff,
} from 'lucide-react'

import BarcodeScanner from '@/components/BarcodeScanner'
import {
  ProductoFormFields,
  productoFormInicial,
  type ProductoFormValues,
} from '@/components/ProductoFormFields'
import { Badge } from '@/components/ui/badge'
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
  guardarSala,
  leerSala,
  limpiarSala,
  useEscaneadorSala,
  type PayloadNuevoProducto,
  type PayloadReponer,
} from '@/lib/escaneoRemoto'
import { crearProductoMock, getMockStock, reponerStockMock } from '@/lib/mock'
import { useKeyboardScanner } from '@/lib/useKeyboardScanner'
import { cn } from 'cn'

type EnvioRegistro =
  | { codigo: string; hora: string; tipo: 'codigo' }
  | { codigo: string; hora: string; tipo: 'producto' | 'reponer' }

function NuevoProductoRemotoDialog({
  open,
  onOpenChange,
  codigoInicial,
  onGuardar,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  codigoInicial: string
  onGuardar: (producto: PayloadNuevoProducto) => void
}) {
  const [form, setForm] = useState<ProductoFormValues>(productoFormInicial)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm({ ...productoFormInicial, codigo_barras: codigoInicial })
    setError(null)
  }, [open, codigoInicial])

  function set<K extends keyof ProductoFormValues>(
    key: K,
    value: ProductoFormValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nombre = form.nombre.trim()
    const precio = Number(form.precio)
    const cantidad = Number(form.cantidad)

    if (!nombre || !Number.isFinite(precio) || precio < 0) {
      setError('Falta el nombre o el precio no es válido.')
      return
    }

    onGuardar({
      nombre,
      codigo_barras: form.codigo_barras.trim() || null,
      marca: form.marca.trim() || null,
      categoria: form.categoria.trim() || null,
      variante: form.variante.trim() || null,
      sku: form.sku.trim() || null,
      precio,
      costo: form.costo ? Number(form.costo) : null,
      moneda: form.moneda === 'USD' ? 'USD' : 'PYG',
      cantidad: Number.isFinite(cantidad) ? Math.max(0, Math.floor(cantidad)) : 0,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar producto</DialogTitle>
          <DialogDescription>
            Escaneá el código o tipealo, completá los datos y quedará en tu stock.
            Si estás conectado a una Caja, además se lo envía.
          </DialogDescription>
        </DialogHeader>

        <form id="nuevo-producto-remoto" onSubmit={handleSubmit}>
          <ProductoFormFields
            form={form}
            set={set}
            onCodigoEscaneado={(code) => set('codigo_barras', code.trim())}
          />
          {error && (
            <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="nuevo-producto-remoto">
            Guardar producto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReponerStockRemotoDialog({
  open,
  onOpenChange,
  codigoInicial,
  onGuardar,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  codigoInicial: string
  onGuardar: (reponer: PayloadReponer) => void
}) {
  const [codigo, setCodigo] = useState('')
  const [cantidad, setCantidad] = useState('')

  useEffect(() => {
    if (!open) return
    setCodigo(codigoInicial)
    setCantidad('')
  }, [open, codigoInicial])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const code = codigo.trim()
    const n = Number(cantidad)
    if (!code || !Number.isFinite(n) || n <= 0) return
    onGuardar({ codigo_barras: code, cantidad: Math.floor(n) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reponer stock</DialogTitle>
          <DialogDescription>
            Suma unidades a un producto que ya está en tu stock.
          </DialogDescription>
        </DialogHeader>

        <form id="reponer-stock-remoto" onSubmit={handleSubmit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rep-codigo">Código de barras</Label>
            <div className="flex gap-2">
              <Input
                id="rep-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Código escaneado"
                className="flex-1"
                autoCapitalize="off"
                autoCorrect="off"
              />
              <BarcodeScanner
                onDetected={(code) => setCodigo(code.trim())}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Escanear código"
                  >
                    <ScanBarcode />
                  </Button>
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-cantidad">Unidades a sumar</Label>
            <Input
              id="rep-cantidad"
              type="number"
              min={1}
              step={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="Ej. 10"
              required
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="reponer-stock-remoto">
            Sumar unidades
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function EscaneadorPage() {
  const [sala, setSala] = useState(() => leerSala())
  const [inputSala, setInputSala] = useState(() => leerSala())
  const [manual, setManual] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [enviados, setEnviados] = useState<EnvioRegistro[]>([])
  const [agregarOpen, setAgregarOpen] = useState(false)
  const [reponerOpen, setReponerOpen] = useState(false)
  const [codigoNuevo, setCodigoNuevo] = useState('')
  const [codigoConocido, setCodigoConocido] = useState('')
  const [codigoDesconocido, setCodigoDesconocido] = useState<string | null>(null)

  const { estado, enviar, enviarProducto, reponerStock } = useEscaneadorSala(sala, {
    onProducto: recibirProductoRemoto,
    onSnapshot: recibirSnapshot,
  })

  function recibirProductoRemoto(producto: PayloadNuevoProducto) {
    if (
      producto.codigo_barras &&
      getMockStock().some((r) => r.producto?.codigo_barras === producto.codigo_barras)
    ) {
      return
    }
    crearProductoMock(producto)
  }

  function recibirSnapshot(items: PayloadNuevoProducto[]) {
    const codigosLocales = new Set(
      getMockStock()
        .map((l) => l.producto?.codigo_barras)
        .filter((c): c is string => Boolean(c)),
    )
    let nuevos = 0
    for (const it of items) {
      if (it.codigo_barras && codigosLocales.has(it.codigo_barras)) continue
      if (
        !it.codigo_barras &&
        getMockStock().some((l) => l.producto?.nombre === it.nombre && l.precio === it.precio)
      ) {
        continue
      }
      crearProductoMock({ ...it })
      if (it.codigo_barras) codigosLocales.add(it.codigo_barras)
      nuevos += 1
    }

    const codigosRemotos = new Set(
      items.map((i) => i.codigo_barras).filter((c): c is string => Boolean(c)),
    )
    let enviados = 0
    for (const linea of getMockStock()) {
      const c = linea.producto?.codigo_barras
      if (!c || codigosRemotos.has(c)) continue
      if (
        enviarProducto({
          nombre: linea.producto?.nombre || linea.sku || 'Producto',
          codigo_barras: c,
          marca: linea.producto?.marca ?? null,
          categoria: linea.producto?.categoria ?? null,
          variante: linea.variante,
          sku: linea.sku,
          precio: linea.precio,
          costo: linea.costo,
          moneda: linea.moneda === 'USD' ? 'USD' : 'PYG',
          cantidad: linea.cantidad,
        })
      ) {
        enviados += 1
      }
    }

    if (nuevos > 0 || enviados > 0) {
      setNota(
        `Stock sincronizado con la Caja: ${nuevos} producto${nuevos === 1 ? '' : 's'} recibido${nuevos === 1 ? '' : 's'}, ${enviados} subido${enviados === 1 ? '' : 's'}.`,
      )
    }
  }

  function entrarSala(event: FormEvent) {
    event.preventDefault()
    const codigo = inputSala.trim().toUpperCase()
    if (codigo.length < 4) {
      setAviso('El código de sala se ve así: K-XXXXXX (lo muestra la Caja en la compu).')
      return
    }
    guardarSala(codigo)
    setSala(codigo)
    setAviso(null)
  }

  function salirDeSala() {
    limpiarSala()
    setSala('')
    setInputSala('')
    setEnviados([])
  }

  function pushEnviado(codigo: string, tipo: EnvioRegistro['tipo']) {
    setEnviados((prev) =>
      [
        { codigo, hora: new Date().toLocaleTimeString('es-PY'), tipo },
        ...prev,
      ].slice(0, 6),
    )
  }

  function marcar(code: string) {
    if (!sala) return
    const ok = enviar(code)
    if (ok) {
      pushEnviado(code, 'codigo')
      setAviso(null)
    } else {
      setAviso('Sin conexión con la sala. Esperá y volvé a escanear.')
    }
  }

  function manejarCodigo(code: string) {
    const c = code.trim()
    if (!c) return
    const conocido = getMockStock().some((r) => r.producto?.codigo_barras === c)
    if (conocido) {
      setCodigoConocido(c)
      marcar(c)
    } else {
      setCodigoDesconocido(c)
    }
  }

  function guardarProducto(producto: PayloadNuevoProducto) {
    crearProductoMock(producto)
    const etiqueta = producto.nombre || producto.codigo_barras || 'Producto'
    pushEnviado(etiqueta, 'producto')
    if (sala && enviarProducto(producto)) {
      setNota(`${etiqueta} fue creado y enviado a la Caja.`)
    } else if (sala) {
      setAviso('Quedó guardado en tu stock, pero la Caja no estaba conectada.')
    } else {
      setNota(`${etiqueta} quedó guardado en tu stock.`)
    }
    setAgregarOpen(false)
  }

  function guardarReponer(reponer: PayloadReponer) {
    const nombre = reponerStockMock(reponer.codigo_barras, reponer.cantidad)
    if (!nombre) {
      setAviso('Ese código no está en tu stock todavía: primero dale de alta como producto nuevo.')
      setReponerOpen(false)
      return
    }
    const etiqueta = `${nombre} +${reponer.cantidad}`
    const ok = sala && reponerStock(reponer)
    pushEnviado(etiqueta, 'reponer')
    if (ok) {
      setNota(`Se sumaron ${reponer.cantidad} unidades de ${nombre} (enviado a la Caja).`)
    } else if (sala) {
      setAviso('Quedó sumado en tu stock, pero la Caja no estaba conectada.')
    } else {
      setNota(`Se sumaron ${reponer.cantidad} unidades de ${nombre}.`)
    }
    setReponerOpen(false)
  }

  useKeyboardScanner((code) => manejarCodigo(code))

  const conectado = sala !== '' && estado === 'conectado'

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <Package className="size-5" />
        <span className="text-sm font-semibold">Escáner</span>
        <Badge
          variant="outline"
          className="ml-auto font-mono text-xs tabular-nums"
        >
          {sala || 'Sin Caja conectada'}
        </Badge>
        {sala ? (
          conectado ? (
            <Wifi className="size-4 text-emerald-600" />
          ) : (
            <WifiOff className="size-4 text-amber-600" />
          )
        ) : (
          <WifiOff className="size-4 text-muted-foreground" />
        )}
      </header>

      <main className="flex-1 space-y-4 p-4">
        {!sala ? (
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Conectar a la Caja (opcional)</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Sin conectar podés escanear para <b>crear productos</b> y reponer
              stock: quedan guardados en este teléfono. Conectate a la Caja de la
              compu para que los productos que ya existen caigan al carrito.
            </p>
            <form onSubmit={entrarSala} className="mt-3 flex gap-2">
              <Input
                value={inputSala}
                onChange={(e) => setInputSala(e.target.value)}
                placeholder="K-ABC123"
                className="h-11 flex-1 font-mono uppercase tracking-widest"
                autoCapitalize="characters"
                autoCorrect="off"
              />
              <Button type="submit" size="lg" className="h-11">
                Conectar
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {conectado
                ? 'Conectado a la Caja. Escaneá productos: los que ya existen caen al carrito.'
                : estado === 'error'
                  ? 'No se pudo conectar. ¿Estás en la misma red (Wi-Fi) que la compu?'
                  : 'Conectando…'}
            </span>
            <Button variant="ghost" size="sm" onClick={salirDeSala}>
              Cambiar sala
            </Button>
          </div>
        )}

        {nota && (
          <p className="rounded-md border border-emerald-300/50 bg-emerald-50 p-3 text-sm text-emerald-700">
            {nota}
          </p>
        )}
        {aviso && (
          <p className="rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-700">
            {aviso}
          </p>
        )}

        {codigoDesconocido && (
          <div className="rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-700">
            <p>
              El código{' '}
              <span className="font-mono font-semibold">{codigoDesconocido}</span>{' '}
              no está en tu stock {sala ? 'ni en la Caja' : ''}.
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setCodigoNuevo(codigoDesconocido)
                  setCodigoDesconocido(null)
                  setAgregarOpen(true)
                }}
              >
                Crear este producto
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setCodigoDesconocido(null)}
              >
                Descartar
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex h-auto flex-col gap-1 py-3"
            onClick={() => {
              setCodigoNuevo('')
              setAgregarOpen(true)
            }}
          >
            <Plus />
            Agregar producto
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex h-auto flex-col gap-1 py-3"
            onClick={() => setReponerOpen(true)}
          >
            <PackagePlus />
            Reponer stock
          </Button>
        </div>

        <BarcodeScanner
          onDetected={(code) => manejarCodigo(code)}
          trigger={
            <button
              type="button"
              className={cn(
                'flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors',
                conectado
                  ? 'border-emerald-300/60 bg-emerald-50/50 text-emerald-700'
                  : 'border-muted-foreground/40 text-muted-foreground',
              )}
            >
              <ScanBarcode className="size-10" />
              <span className="text-base font-semibold">Escanear con la cámara</span>
              <span className="text-sm">
                {conectado
                  ? 'Solo productos existentes caen al carrito'
                  : 'Creá productos escaneando (sin Caja) o conectate'}
              </span>
            </button>
          }
        />

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (manual.trim()) {
              manejarCodigo(manual.trim())
              setManual('')
            }
          }}
          className="flex gap-2"
        >
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="O escribí el código a mano…"
            className="h-11 flex-1"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <Button type="submit" size="lg" className="h-11">
            <Send />
            {sala ? 'Enviar' : 'Revisar'}
          </Button>
        </form>

        {enviados.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Últimos envíos
            </p>
            <ul className="space-y-1.5">
              {enviados.map((e, i) => (
                <li
                  key={`${e.codigo}-${e.hora}-${i}`}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <Check className="size-4 text-emerald-600" />
                  <span className="font-mono tabular-nums">{e.codigo}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {e.tipo === 'codigo'
                      ? 'Código'
                      : e.tipo === 'producto'
                        ? 'Producto creado'
                        : 'Reposición'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{e.hora}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <NuevoProductoRemotoDialog
        open={agregarOpen}
        onOpenChange={setAgregarOpen}
        codigoInicial={codigoNuevo}
        onGuardar={guardarProducto}
      />
      <ReponerStockRemotoDialog
        open={reponerOpen}
        onOpenChange={setReponerOpen}
        codigoInicial={codigoConocido}
        onGuardar={guardarReponer}
      />
    </div>
  )
}