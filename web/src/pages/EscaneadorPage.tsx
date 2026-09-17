import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { Link } from 'react-router-dom'

import {
  Check,
  LogIn,
  Package,
  PackagePlus,
  QrCode,
  ScanBarcode,
  Send,
  Wifi,
  WifiOff,
} from 'lucide-react'

import AdministrarProductoDialog from '@/components/AdministrarProductoDialog'
import BarcodeScanner from '@/components/BarcodeScanner'
import {
  ProductoFormFields,
  productoFormInicial,
  type ProductoFormValues,
} from '@/components/ProductoFormFields'
import { useAuth } from '@/components/auth/AuthContext'
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
  cajaDeUrl,
  guardarCajaEscaneador,
  leerCajaEscaneador,
  modoDeUrl,
  salaDeCaja,
  salaDeStock,
  sucursalDeUrl,
  useEscaneadorSala,
  type CajaNumero,
  type PayloadNuevoProducto,
  type PayloadReponer,
} from '@/lib/escaneoRemoto'
import { ejecutarEscritura } from '@/lib/ejecutar'
import { crearProductoMock, getMockStock, reponerStockMock } from '@/lib/mock'
import {
  buscarLineaPorCodigo,
  cargarStockRemoto,
  type StockRemotoRow,
} from '@/lib/stockRemoto'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { useKeyboardScanner } from '@/lib/useKeyboardScanner'
import { vistaStock } from '@/lib/vistaStock'
import { cn } from 'cn'

type EnvioRegistro =
  | { codigo: string; hora: string; tipo: 'codigo' }
  | { codigo: string; hora: string; tipo: 'producto' | 'reponer' }

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
  const [tipo, setTipo] = useState<'entrada' | 'salida'>('entrada')
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (!open) return
    setCodigo(codigoInicial)
    setCantidad('')
    setTipo('entrada')
    setMotivo('')
  }, [open, codigoInicial])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const code = codigo.trim()
    const n = Number(cantidad)
    if (!code || !Number.isFinite(n) || n <= 0) return
    onGuardar({
      codigo_barras: code,
      cantidad: Math.floor(n),
      tipo,
      motivo: motivo.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reponer stock</DialogTitle>
          <DialogDescription>
            Sumá o descontá unidades de un producto que ya está en tu stock.
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
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo('entrada')}
              className={cn(
                'h-10 rounded-lg border text-sm font-semibold transition-colors',
                tipo === 'entrada'
                  ? 'border-emerald-400/60 bg-emerald-50 text-emerald-700'
                  : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              Entrada (+)
            </button>
            <button
              type="button"
              onClick={() => setTipo('salida')}
              className={cn(
                'h-10 rounded-lg border text-sm font-semibold transition-colors',
                tipo === 'salida'
                  ? 'border-amber-400/60 bg-amber-50 text-amber-700'
                  : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              Salida (−)
            </button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-cantidad">
              Unidades a {tipo === 'entrada' ? 'sumar' : 'descontar'}
            </Label>
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
          <div className="space-y-1.5">
            <Label htmlFor="rep-motivo">Motivo (opcional)</Label>
            <Input
              id="rep-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. compra a proveedor / merma"
              autoCapitalize="off"
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="reponer-stock-remoto">
            Aplicar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NuevoProductoRemotoDialog({
  open,
  onOpenChange,
  codigoInicial,
  sucursalId,
  onGuardado,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  codigoInicial: string
  sucursalId: string | null
  onGuardado: (producto: PayloadNuevoProducto) => void | Promise<void>
}) {
  const [form, setForm] = useState<ProductoFormValues>(productoFormInicial)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({ ...productoFormInicial, codigo_barras: codigoInicial })
    setError(null)
    setSubmitting(false)
  }, [open, codigoInicial])

  function set<K extends keyof ProductoFormValues>(
    key: K,
    value: ProductoFormValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    const nombre = form.nombre.trim()
    const precio = Number(form.precio)
    if (!nombre || !Number.isFinite(precio) || precio < 0) {
      setError('Falta el nombre o el precio no es válido.')
      return
    }

    const codigoBarras = form.codigo_barras.trim() || null
    const moneda = form.moneda === 'USD' ? 'USD' : 'PYG'
    const cantidad = Number.isFinite(Number(form.cantidad))
      ? Math.max(0, Math.floor(Number(form.cantidad)))
      : 0
    const producto: PayloadNuevoProducto = {
      nombre,
      codigo_barras: codigoBarras,
      marca: form.marca.trim() || null,
      categoria: form.categoria.trim() || null,
      variante: form.variante.trim() || null,
      sku: form.sku.trim() || null,
      precio,
      costo: form.costo ? Number(form.costo) : null,
      moneda,
      cantidad,
    }

    setSubmitting(true)
    try {
      if (!isSupabaseConfigured) {
        crearProductoMock(producto)
        await onGuardado(producto)
        onOpenChange(false)
        return
      }

      if (!sucursalId) {
        throw new Error('El enlace no indica la sucursal de destino.')
      }

      const maestroId = crypto.randomUUID()
      const lineaId = crypto.randomUUID()
      const ahora = new Date().toISOString()

      await ejecutarEscritura<{ lineaId: string }>({
        operacion: {
          tipo: 'producto',
          maestroId,
          lineaId,
          codigo: codigoBarras,
          nombre,
          marca: producto.marca,
          categoria: producto.categoria,
          sucursalId,
          sku: producto.sku,
          variante: producto.variante,
          precio,
          costo: producto.costo,
          moneda,
          cantidad,
          creadoEn: ahora,
        },
        ejecutarRemoto: async () => {
          const { data, error: err } = await supabase.rpc('registrar_producto', {
            p_maestro_id: maestroId,
            p_codigo: codigoBarras,
            p_nombre: nombre,
            p_marca: producto.marca,
            p_categoria: producto.categoria,
            p_linea_id: lineaId,
            p_sucursal_id: sucursalId,
            p_sku: producto.sku,
            p_variante: producto.variante,
            p_precio: precio,
            p_costo: producto.costo,
            p_moneda: moneda,
            p_cantidad: cantidad,
            p_created_at: ahora,
          })
          if (err) throw err
          return { lineaId: data as string }
        },
      })

      await onGuardado(producto)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el producto.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
          <DialogDescription>
            El código no está en tu stock: cargalo para empezar a venderlo.
          </DialogDescription>
        </DialogHeader>

        <form id="nuevo-producto-remoto" onSubmit={handleSubmit}>
          <ProductoFormFields
            form={form}
            set={set}
            onCodigoEscaneado={(c) => set('codigo_barras', c)}
          />

          {error && (
            <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="nuevo-producto-remoto"
            disabled={submitting}
          >
            {submitting ? 'Guardando…' : 'Guardar producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function EscaneadorPage() {
  const { user } = useAuth()
  const vista = vistaStock(user)
  const modo = modoDeUrl() ?? 'caja'
  const modoStock = modo === 'stock'
  const sucursal = sucursalDeUrl()
  const [stockRemoto, setStockRemoto] = useState<StockRemotoRow[] | null>(null)
  const [caja, setCaja] = useState<CajaNumero>(() => leerCajaEscaneador())
  const [manual, setManual] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [nota, setNota] = useState<string | null>(null)
  const [enviados, setEnviados] = useState<EnvioRegistro[]>([])
  const [reponerOpen, setReponerOpen] = useState(false)
  const [codigoConocido, setCodigoConocido] = useState('')
  const [codigoDesconocido, setCodigoDesconocido] = useState<string | null>(null)
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminLinea, setAdminLinea] = useState<StockRemotoRow | null>(null)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoCodigo, setNuevoCodigo] = useState('')

  const sala = modoStock ? salaDeStock() : salaDeCaja(caja)

  const recargarStockRemoto = useCallback(async () => {
    if (!isSupabaseConfigured) return
    try {
      setStockRemoto(await cargarStockRemoto(vista))
    } catch {
      // Sin conexión: se conserva la última lista cargada.
    }
  }, [vista])

  function lineasConocidas(): StockRemotoRow[] {
    return isSupabaseConfigured ? (stockRemoto ?? []) : getMockStock()
  }

  useEffect(() => {
    void recargarStockRemoto()
  }, [recargarStockRemoto])

  useEffect(() => {
    const cajaDelQr = cajaDeUrl()
    if (cajaDelQr && cajaDelQr !== caja) {
      setCaja(cajaDelQr)
      guardarCajaEscaneador(cajaDelQr)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { estado, enviar, enviarProducto, reponerStock, sinSesion } =
    useEscaneadorSala(sala, {
      onProducto: recibirProductoRemoto,
      onSnapshot: recibirSnapshot,
    })

  useEffect(() => {
    if (estado === 'conectado') void recargarStockRemoto()
  }, [estado, recargarStockRemoto])

  function recibirProductoRemoto(producto: PayloadNuevoProducto) {
    if (isSupabaseConfigured) {
      void recargarStockRemoto()
      return
    }
    if (
      producto.codigo_barras &&
      getMockStock().some((r) => r.producto?.codigo_barras === producto.codigo_barras)
    ) {
      return
    }
    crearProductoMock(producto)
  }

  function recibirSnapshot(items: PayloadNuevoProducto[]) {
    if (isSupabaseConfigured) {
      void recargarStockRemoto()
      return
    }
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

  function setCajaYGuardar(n: CajaNumero) {
    setCaja(n)
    guardarCajaEscaneador(n)
    setAviso(null)
  }

  function manejarQr(url: string) {
    try {
      const u = new URL(url.includes('://') ? url : `http://${url}`)
      const n = Number(u.searchParams.get('caja'))
      if (n === 1 || n === 2 || n === 3) {
        setCajaYGuardar(n as CajaNumero)
        setAviso(null)
        setNota(`Conectando a la Caja ${n}…`)
      } else {
        setAviso('Ese QR no es de una caja de Kahabox.')
      }
    } catch {
      setAviso('Quedó guardado, pero no se reconoció el QR.')
    }
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
    const ok = enviar(code)
    if (ok) {
      pushEnviado(code, 'codigo')
      setAviso(null)
    } else {
      setAviso('Sin conexión con la Caja. Esperá y volvé a escanear.')
    }
  }

  function manejarCodigo(code: string) {
    const c = code.trim()
    if (!c) return
    const linea = buscarLineaPorCodigo(lineasConocidas(), c)

    if (modoStock) {
      if (linea) {
        setAdminLinea(linea)
        setAdminOpen(true)
        return
      }
      setNuevoCodigo(c)
      setNuevoOpen(true)
      return
    }

    if (linea) {
      setCodigoConocido(c)
      marcar(c)
      return
    }
    // En producción, si el stock real todavía no cargó, se lo pasamos igual a la
    // Caja (que es la fuente de verdad) en vez de decir que no existe.
    if (isSupabaseConfigured && stockRemoto === null) {
      setCodigoConocido(c)
      marcar(c)
      return
    }
    setCodigoDesconocido(c)
  }

  function avisarProductoStock(producto: PayloadNuevoProducto) {
    if (!enviarProducto(producto)) {
      setAviso('Quedó cargado, pero la compu no estaba conectada.')
      return
    }
    setAviso(null)
  }

  async function guardarProductoStock(producto: PayloadNuevoProducto) {
    const etiqueta = producto.codigo_barras ?? producto.nombre
    pushEnviado(etiqueta, 'producto')
    await recargarStockRemoto()
    avisarProductoStock(producto)
    setNota(`Producto cargado a Stock: ${producto.nombre}.`)
  }

  function administrarHecho() {
    const linea = adminLinea
    if (linea) {
      enviarProducto({
        nombre: linea.producto?.nombre || linea.sku || 'Producto',
        codigo_barras: linea.producto?.codigo_barras ?? null,
        marca: linea.producto?.marca ?? null,
        categoria: linea.producto?.categoria ?? null,
        variante: linea.variante,
        sku: linea.sku,
        precio: linea.precio,
        costo: linea.costo,
        moneda: linea.moneda === 'USD' ? 'USD' : 'PYG',
        cantidad: linea.cantidad,
      })
    }
    return recargarStockRemoto()
  }

  async function guardarReponer(reponer: PayloadReponer) {
    const cantidad = Math.max(1, Math.floor(reponer.cantidad))

    if (!isSupabaseConfigured) {
      const nombre = reponerStockMock(
        reponer.codigo_barras,
        cantidad,
        reponer.tipo,
        reponer.motivo,
      )
      if (!nombre) {
        setAviso('Ese código no está en tu stock todavía. Cargalo desde Stock.')
        setReponerOpen(false)
        return
      }
      const etiqueta = `${nombre} ${reponer.tipo === 'entrada' ? '+' : '−'}${cantidad}`
      pushEnviado(etiqueta, 'reponer')
      if (reponerStock(reponer)) {
        setNota(
          `Se ${reponer.tipo === 'entrada' ? 'sumaron' : 'descontaron'} ${cantidad} unidades de ${nombre} (enviado a la Caja).`,
        )
      } else {
        setAviso('Quedó en tu stock, pero la Caja no estaba conectada.')
      }
      setReponerOpen(false)
      return
    }

    const linea = buscarLineaPorCodigo(lineasConocidas(), reponer.codigo_barras)
    if (!linea) {
      setAviso('Ese código no está en tu stock todavía. Cargalo desde Stock.')
      setReponerOpen(false)
      return
    }

    const movimientoId = crypto.randomUUID()
    const ahora = new Date().toISOString()
    const productoNombre = linea.producto?.nombre ?? 'Producto'

    try {
      const resultado = await ejecutarEscritura<{ movimientoId: string }>({
        operacion: {
          tipo: 'ajuste',
          movimientoId,
          lineaId: linea.id,
          sucursalId: linea.sucursal_id,
          sentido: reponer.tipo,
          cantidad,
          motivo: reponer.motivo?.trim() || null,
          productoNombre,
          codigoBarras: linea.producto?.codigo_barras ?? null,
          sku: linea.sku,
          creadoEn: ahora,
        },
        ejecutarRemoto: async () => {
          const { error } = await supabase.rpc('registrar_ajuste', {
            p_movimiento_id: movimientoId,
            p_linea_id: linea.id,
            p_sucursal_id: linea.sucursal_id,
            p_tipo: reponer.tipo,
            p_cantidad: cantidad,
            p_motivo: reponer.motivo?.trim() || null,
            p_producto_nombre: productoNombre,
            p_codigo_barras: linea.producto?.codigo_barras ?? null,
            p_sku: linea.sku,
            p_created_at: ahora,
          })
          if (error) throw error
          return { movimientoId }
        },
      })

      await recargarStockRemoto()
      const etiqueta = `${productoNombre} ${reponer.tipo === 'entrada' ? '+' : '−'}${cantidad}`
      pushEnviado(etiqueta, 'reponer')
      reponerStock(reponer)
      setNota(
        `Se ${reponer.tipo === 'entrada' ? 'sumaron' : 'descontaron'} ${cantidad} unidades de ${productoNombre}${resultado.remoto ? ' en Stock y se avisó a la Caja.' : ' (quedará sincronizado).'}`,
      )
      setReponerOpen(false)
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo aplicar el ajuste.')
    }
  }

  useKeyboardScanner((code) => manejarCodigo(code))

  const conectado = estado === 'conectado'

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center gap-2 border-b px-4">
        <Package className="size-5" />
        <span className="text-sm font-semibold">Escáner</span>
        <Badge
          variant="outline"
          className="ml-auto font-mono text-xs tabular-nums"
        >
          {modoStock ? 'Stock' : `Caja ${caja}`}
        </Badge>
        {conectado ? (
          <Wifi className="size-4 text-emerald-600" />
        ) : (
          <WifiOff className="size-4 text-amber-600" />
        )}
      </header>

      <main className="flex-1 space-y-4 p-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {modoStock ? 'Conectar a Stock' : 'Conectar a la Caja'}
            </h2>
            <span className="text-xs text-muted-foreground">
              {conectado
                ? 'Conexión activa'
                : estado === 'error'
                  ? 'Sin conexión'
                  : 'Conectando…'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {sinSesion
              ? `Para conectar con ${modoStock ? 'Stock' : 'la Caja'} tenés que iniciar sesión en Kahabox con la misma cuenta que la compu.`
              : conectado
                ? modoStock
                  ? 'Escaneá productos: los que ya existen se administran y los nuevos se cargan.'
                  : 'Escaneá productos: los que ya existen caen al carrito de la Caja.'
                : estado === 'error'
                  ? 'No se pudo conectar con la compu. ¿Estás en la misma red (Wi-Fi)?'
                  : 'Intentando conectar con la compu…'}
          </p>
          {sinSesion && (
            <Link
              to="/login"
              className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 text-sm font-semibold text-primary"
            >
              <LogIn className="size-4" />
              Iniciar sesión
            </Link>
          )}
          {!modoStock && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {([1, 2, 3] as CajaNumero[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCajaYGuardar(n)}
                  className={cn(
                    'flex h-11 items-center justify-center rounded-lg border text-sm font-semibold transition-colors',
                    caja === n
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  Caja {n}
                </button>
              ))}
            </div>
          )}
          {!modoStock && (
            <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                ¿Estás frente a la Caja de la compu? Escaneá su QR y te conectás
                sola.
              </p>
              <BarcodeScanner
                onDetected={manejarQr}
                trigger={
                  <Button type="button" variant="outline" size="sm">
                    <QrCode />
                    Escanear QR
                  </Button>
                }
              />
            </div>
          )}
        </div>

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

        {!modoStock && codigoDesconocido && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-semibold">Producto inexistente.</p>
            <p className="mt-0.5">
              El código{' '}
              <span className="font-mono font-semibold">{codigoDesconocido}</span>{' '}
              no está en tu stock. Cargalo desde Stock.
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 text-destructive"
              onClick={() => setCodigoDesconocido(null)}
            >
              Cerrar
            </Button>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="flex h-auto w-full flex-col gap-1 py-3"
          onClick={() => setReponerOpen(true)}
        >
          <PackagePlus />
          Reponer stock
        </Button>

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
                  ? modoStock
                    ? 'Existentes: administrar · Nuevos: cargar'
                    : 'Solo productos existentes caen al carrito'
                  : `Conectate a ${modoStock ? 'Stock' : 'la Caja'} para escanear`}
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
            {conectado ? 'Enviar' : 'Revisar'}
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

      <ReponerStockRemotoDialog
        open={reponerOpen}
        onOpenChange={setReponerOpen}
        codigoInicial={codigoConocido}
        onGuardar={guardarReponer}
      />

      <AdministrarProductoDialog
        open={adminOpen}
        onOpenChange={setAdminOpen}
        linea={adminLinea}
        onDone={administrarHecho}
      />

      <NuevoProductoRemotoDialog
        open={nuevoOpen}
        onOpenChange={setNuevoOpen}
        codigoInicial={nuevoCodigo}
        sucursalId={sucursal}
        onGuardado={guardarProductoStock}
      />
    </div>
  )
}