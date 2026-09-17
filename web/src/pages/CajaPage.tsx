import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'

import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  CreditCard,
  HandCoins,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  Printer,
  QrCode as QrCodeIcon,
  RefreshCw,
  ScanBarcode,
  Settings2,
  ShoppingCart,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import BarcodeScanner from '@/components/BarcodeScanner'
import MoneyInput from '@/components/MoneyInput'
import { useAuth } from '@/components/auth/AuthContext'
import ImpresoraDialog from '@/components/ImpresoraDialog'
import QrCode from '@/components/QrCode'
import ResultadoImpresionDialog from '@/components/ResultadoImpresionDialog'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Database } from '@/lib/database'
import {
  aGs,
  convertir,
  desdeGs,
  obtenerCotizaciones,
  tasasBase,
  type Tasas,
} from '@/lib/cotizaciones'
import {
  useSalaEscaneo,
  salaDeCaja,
  type PayloadNuevoProducto,
  type PayloadReponer,
} from '@/lib/escaneoRemoto'
import { MONEDAS, formatFecha, formatMoney, type Moneda } from '@/lib/format'
import {
  cobrarQrPos,
  cobrarTarjetaPos,
  probarConexionPos,
  type ResultadoPos,
} from '@/lib/bancard'
import { guardarCacheStock, leerCacheStock } from '@/lib/cache'
import type {
  MetodoPagoVenta,
} from '@/lib/cola'
import { monedaPrincipal, nombreNegocio, useConfig } from '@/lib/config'
import {
  ejecutarEscritura,
} from '@/lib/ejecutar'
import {
  copiarTicket,
  imprimirTicket,
  imprimirTicketPC,
  type ResultadoImpresion,
} from '@/lib/impresion/imprimir'
import { armarTextoPlano, type TicketVenta } from '@/lib/impresion/ticket'
import {
  crearProductoMock,
  getMockStock,
  guardarTicketVentaMock,
  registrarVentaCaja,
  reponerStockMock,
} from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { esErrorDeRed } from '@/lib/red'
import { vistaStock } from '@/lib/vistaStock'
import { useKeyboardScanner } from '@/lib/useKeyboardScanner'
import { cn } from 'cn'

type StockRow = Database['public']['Views']['stock_tienda_dueno']['Row'] & {
  producto: Database['public']['Tables']['productos_maestro']['Row'] | null
}

type CarritoItem = { linea: StockRow; cantidad: number }

type MetodoPago = 'efectivo' | 'pos' | 'transferencia' | 'fiado'

const METODOS: Record<MetodoPago, { nombre: string; Icono: LucideIcon }> = {
  efectivo: { nombre: 'Efectivo', Icono: Banknote },
  pos: { nombre: 'POS Bancard', Icono: CreditCard },
  transferencia: { nombre: 'Transferencia', Icono: HandCoins },
  fiado: { nombre: 'Crédito / Fiado', Icono: Wallet },
}

const METODOS_ACTIVOS: MetodoPago[] = [
  'efectivo',
  'pos',
  'transferencia',
  'fiado',
]

type Pago = {
  id: string
  metodo: MetodoPago
  monto: string
  moneda: Moneda
  detalle?: string
  fijo?: boolean
}

type EstadoCobroPos = 'idle' | 'eco' | 'esperando' | 'ok' | 'error'

type MedioPosCaja = 'qr' | 'debito' | 'contado'

type Aviso = { tipo: 'ok' | 'error'; texto: string }

const CLAVE_ULTIMO_TICKET = 'kahabox:ultimo-ticket'
const FRESCURA_ULTIMO_TICKET_MS = 5 * 60 * 1000
const CLAVE_CARRITO = 'kahabox:caja:carrito'

function parseMonto(valor: string): number {
  const limpio = valor.replace(/[^\d.,-]/g, '').replace(/,/g, '.')
  const n = Number(limpio)
  return Number.isFinite(n) ? n : 0
}

function buscarPorCodigo(lista: StockRow[], codigo: string): StockRow | null {
  const c = codigo.trim()
  if (!c) return null
  return lista.find((s) => s.producto?.codigo_barras === c) ?? null
}

function buscarPorQuery(lista: StockRow[], texto: string): StockRow[] {
  const t = texto.trim().toLowerCase()
  if (!t) return []
  return lista.filter((s) =>
    [
      s.producto?.nombre,
      s.producto?.marca,
      s.producto?.codigo_barras,
      s.variante,
      s.sku,
    ].some((f) => f?.toLowerCase().includes(t)),
  )
}

function lineaLocalDesdeProducto(
  producto: PayloadNuevoProducto,
  maestroId: string,
  lineaId: string,
): StockRow {
  const ahora = new Date().toISOString()
  return {
    id: lineaId,
    tenant_id: '',
    sucursal_id: null,
    producto_id: maestroId,
    sku: producto.sku ?? null,
    variante: producto.variante ?? null,
    precio: producto.precio,
    costo: producto.costo,
    moneda: producto.moneda,
    cantidad: producto.cantidad,
    updated_at: ahora,
    producto: {
      id: maestroId,
      codigo_barras: producto.codigo_barras?.trim() || null,
      nombre: producto.nombre,
      marca: producto.marca ?? null,
      categoria: producto.categoria ?? null,
      foto_url: null,
      creado_por_tenant_id: null,
      created_at: ahora,
    },
  }
}

function leerCarritoPersistido(): { id: string; cantidad: number }[] {
  try {
    const raw = localStorage.getItem(CLAVE_CARRITO)
    if (!raw) return []
    const lista = JSON.parse(raw) as { id?: string; cantidad?: number }[]
    if (!Array.isArray(lista)) return []
    return lista
      .filter(
        (c) =>
          typeof c.id === 'string' &&
          typeof c.cantidad === 'number' &&
          Number.isFinite(c.cantidad),
      )
      .map((c) => ({ id: c.id as string, cantidad: Math.max(1, c.cantidad as number) }))
  } catch {
    return []
  }
}

function guardarCarritoPersistido(items: CarritoItem[]) {
  try {
    localStorage.setItem(
      CLAVE_CARRITO,
      JSON.stringify(items.map((c) => ({ id: c.linea.id, cantidad: c.cantidad }))),
    )
  } catch {
    // Sin storage: no se conserva entre visitas.
  }
}

function limpiarCarritoPersistido() {
  try {
    localStorage.removeItem(CLAVE_CARRITO)
  } catch {
    // Sin storage.
  }
}

function nombreLocalPropio(): string {
  return nombreNegocio()
}

function leerUltimoTicket(): TicketVenta | null {
  try {
    const raw = localStorage.getItem(CLAVE_ULTIMO_TICKET)
    if (!raw) return null
    const dato = JSON.parse(raw) as { ticket: TicketVenta; guardado: number }
    if (Date.now() - dato.guardado > FRESCURA_ULTIMO_TICKET_MS) return null
    if (!Array.isArray(dato.ticket?.items)) return null
    return dato.ticket
  } catch {
    return null
  }
}

function guardarUltimoTicket(ticket: TicketVenta) {
  try {
    localStorage.setItem(
      CLAVE_ULTIMO_TICKET,
      JSON.stringify({ ticket, guardado: Date.now() }),
    )
  } catch {
    // Sin storage: solo sirve para reimprimir dentro de la sesión.
  }
}

function NuevoProductoCajaDialog({
  open,
  onOpenChange,
  codigoInicial,
  onGuardar,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  codigoInicial: string
  onGuardar: (producto: PayloadNuevoProducto) => Promise<void>
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
    const nombre = form.nombre.trim()
    const precio = Number(form.precio)
    const cantidad = Number(form.cantidad)

    if (!nombre || !Number.isFinite(precio) || precio < 0) {
      setError('Falta el nombre o el precio no es válido.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await onGuardar({
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
    } catch (e) {
      setSubmitting(false)
      const msg = e instanceof Error ? e.message : 'Ocurrió un error al cargar el producto.'
      setError(
        msg.includes('unique')
          ? 'Ese producto + variante ya existe en tu stock.'
          : msg,
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar producto</DialogTitle>
          <DialogDescription>
            Escaneá el código o tipealo, completá los datos y quedará en el stock
            de esta Caja.
          </DialogDescription>
        </DialogHeader>

        <form id="nuevo-producto-caja" onSubmit={handleSubmit}>
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
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="nuevo-producto-caja" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReponerStockCajaDialog({
  open,
  onOpenChange,
  codigoInicial,
  onGuardar,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  codigoInicial: string
  onGuardar: (reponer: PayloadReponer) => Promise<boolean>
}) {
  const [codigo, setCodigo] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [tipo, setTipo] = useState<PayloadReponer['tipo']>('entrada')
  const [motivo, setMotivo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCodigo(codigoInicial)
    setCantidad('')
    setTipo('entrada')
    setMotivo('')
    setSubmitting(false)
    setError(null)
  }, [open, codigoInicial])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const code = codigo.trim()
    const n = Number(cantidad)
    if (!code || !Number.isFinite(n) || n <= 0) {
      setError('Ingresá un código y una cantidad de unidades.')
      return
    }
    setError(null)
    setSubmitting(true)
    const ok = await onGuardar({
      codigo_barras: code,
      cantidad: Math.floor(n),
      tipo,
      motivo: motivo.trim() || null,
    })
    setSubmitting(false)
    if (!ok) {
      setError(`El código ${code} no está en el stock de esta Caja.`)
    }
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

        <form id="reponer-stock-caja" onSubmit={handleSubmit} className="grid gap-3">
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
                    size="icon"
                    aria-label="Escanear código"
                    className="size-11"
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
            />
          </div>
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="reponer-stock-caja" disabled={submitting}>
            {submitting ? 'Aplicando…' : 'Aplicar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function CajaPage() {
  const config = useConfig()
  const { user } = useAuth()
  const vista = vistaStock(user)
  const monedasDisponibles =
    config.monedasActivas.length > 0
      ? MONEDAS.filter((m) => config.monedasActivas.includes(m.codigo))
      : MONEDAS
  const enlaceEscaneo = useMemo(
    () => `${location.protocol}//${location.host}/escaneo?caja=${config.cajaNumero}`,
    [config.cajaNumero],
  )
  const [stock, setStock] = useState<StockRow[] | null>(null)
  const [carrito, setCarrito] = useState<CarritoItem[]>([])
  const [query, setQuery] = useState('')
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [tasas, setTasas] = useState<Tasas>(tasasBase())
  const [actualizado, setActualizado] = useState<string | null>(null)
  const [monedaCobro, setMonedaCobro] = useState<Moneda>(() => monedaPrincipal())
  const [pagos, setPagos] = useState<Pago[]>([])
  const [multiples, setMultiples] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const [posAbierto, setPosAbierto] = useState(false)
  const [posEstado, setPosEstado] = useState<EstadoCobroPos>('idle')
  const [posCargando, setPosCargando] = useState(false)
  const [posMensaje, setPosMensaje] = useState('')
  const [posResultado, setPosResultado] = useState<ResultadoPos | null>(null)
  const [posMedio, setPosMedio] = useState<MedioPosCaja | null>(null)
  const [posMontoGs, setPosMontoGs] = useState(0)

  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoCodigo, setNuevoCodigo] = useState('')
  const [reponerOpen, setReponerOpen] = useState(false)
  const [reponerCodigo, setReponerCodigo] = useState('')
  const [impresoraOpen, setImpresoraOpen] = useState(false)

  const [flashId, setFlashId] = useState<string | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)

  const [ultimoTicket, setUltimoTicket] = useState<TicketVenta | null>(() =>
    leerUltimoTicket(),
  )
  const [resultadoImpresion, setResultadoImpresion] =
    useState<ResultadoImpresion | null>(null)
  const [reimprimiendo, setReimprimiendo] = useState(false)
  const [concluirOpen, setConcluirOpen] = useState(false)

  const remoto = useSalaEscaneo(salaDeCaja(config.cajaNumero), {
    onCodigo: (code) => {
      void agregarCodigo(code)
    },
    onProducto: recibirProductoRemoto,
    onReponer: recibirReponerRemoto,
    onPedirSnapshot: () =>
      (stock ?? getMockStock()).map((s) => ({
        nombre: s.producto?.nombre || s.sku || 'Producto',
        codigo_barras: s.producto?.codigo_barras ?? null,
        marca: s.producto?.marca ?? null,
        categoria: s.producto?.categoria ?? null,
        variante: s.variante,
        sku: s.sku,
        precio: s.precio,
        costo: s.costo,
        moneda: s.moneda === 'USD' ? 'USD' : 'PYG',
        cantidad: s.cantidad,
      })),
  })

  useKeyboardScanner((code) => {
    void agregarCodigo(code)
  })

  const recargarStock = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setStock(getMockStock())
      return
    }
    try {
      const { data, error } = await supabase
        .from(vista)
        .select('*, producto:productos_maestro(*)')
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) throw error
      const filas = (data as StockRow[] | null) ?? []
      setStock(filas)
      guardarCacheStock(vista, filas)
    } catch (e) {
      if (!esErrorDeRed(e)) throw e
      // Sin conexión: no pisamos la lista en memoria y usamos la última
      // carga exitosa si no hay nada aún (el SyncBar avisa el estado).
      const cache = leerCacheStock<StockRow>(vista)
      setStock((prev) => (prev !== null ? prev : (cache ?? [])))
    }
  }, [vista])

  useEffect(() => {
    let activo = true
    async function cargar() {
      const cotiz = await obtenerCotizaciones()
      if (!activo) return
      setTasas(cotiz)
      setActualizado(cotiz.actualizado_a)
    }
    void cargar()
    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    void recargarStock()
  }, [recargarStock])

  useEffect(() => {
    guardarCarritoPersistido(carrito)
  }, [carrito])

  useEffect(() => {
    if (stock === null || carrito.length > 0) return
    const previo = leerCarritoPersistido()
    if (previo.length === 0) return
    const restaurados: CarritoItem[] = []
    for (const p of previo) {
      const linea = stock.find((s) => s.id === p.id)
      if (linea && linea.cantidad > 0) {
        restaurados.push({ linea, cantidad: Math.min(p.cantidad, linea.cantidad) })
      }
    }
    if (restaurados.length > 0) {
      setCarrito(restaurados)
      setAviso({ tipo: 'ok', texto: 'Se restauró la venta en curso.' })
      limpiarCarritoPersistido()
    }
  }, [stock, carrito])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  useEffect(() => {
    return () => {
      if (flashTimer.current !== undefined) clearTimeout(flashTimer.current)
    }
  }, [])

  const totalGs = useMemo(
    () =>
      carrito.reduce(
        (acc, c) =>
          acc + convertir(c.linea.precio, c.linea.moneda, 'PYG', tasas) * c.cantidad,
        0,
      ),
    [carrito, tasas],
  )

  const totalEnCobro = desdeGs(totalGs, monedaCobro, tasas)

  const pagoGs = useCallback(
    (p: Pago) => aGs(parseMonto(p.monto), p.moneda, tasas),
    [tasas],
  )

  const pagoTotalGs = pagos.reduce((acc, p) => acc + pagoGs(p), 0)
  const cambioGs = pagoTotalGs - totalGs
  const puedeCobrar =
    stock !== null && carrito.length > 0 && pagoTotalGs >= totalGs - 1

  function avisar(texto: string, tipo: Aviso['tipo'] = 'error') {
    setAviso({ tipo, texto })
  }

  function marcarAgregado(lineaId: string) {
    if (navigator.vibrate) navigator.vibrate(15)
    setFlashId(lineaId)
    if (flashTimer.current !== undefined) clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashId(null), 800)
  }

  function agregarCarrito(linea: StockRow) {
    if (linea.cantidad <= 0) {
      avisar(`${linea.producto?.nombre ?? 'El producto'} está agotado.`)
      return
    }
    setCarrito((prev) => {
      const idx = prev.findIndex((c) => c.linea.id === linea.id)
      if (idx >= 0) {
        const it = prev[idx]
        if (it.cantidad >= linea.cantidad) {
          avisar(`Solo hay ${linea.cantidad} unidades de ${linea.producto?.nombre}.`)
          return prev
        }
        const copia = [...prev]
        copia[idx] = { ...it, cantidad: it.cantidad + 1 }
        return copia
      }
      return [...prev, { linea, cantidad: 1 }]
    })
    setQuery('')
    marcarAgregado(linea.id)
  }

  function setCantidad(id: string, cantidad: number) {
    if (cantidad <= 0) {
      setCarrito((prev) => prev.filter((c) => c.linea.id !== id))
      return
    }
    setCarrito((prev) =>
      prev.map((c) => {
        if (c.linea.id !== id) return c
        const max = c.linea.cantidad
        return { ...c, cantidad: Math.min(cantidad, max) }
      }),
    )
  }

  function remover(id: string) {
    setCarrito((prev) => prev.filter((c) => c.linea.id !== id))
  }

  function aplicarAjusteStockLocal(lineaId: string, delta: number) {
    setStock((prev) => {
      if (!prev) return prev
      const lista = prev.map((s) =>
        s.id === lineaId
          ? { ...s, cantidad: Math.max(0, s.cantidad + delta) }
          : s,
      )
      guardarCacheStock(vista, lista)
      return lista
    })
  }

  async function agregarCodigo(code: string) {
    const lista = stock ?? []
    const linea = buscarPorCodigo(lista, code)
    if (!linea) {
      setNuevoCodigo(code.trim())
      setNuevoOpen(true)
      return
    }
    agregarCarrito(linea)
  }

  async function guardarProductoEnCaja(producto: PayloadNuevoProducto) {
    if (!isSupabaseConfigured) {
      crearProductoMock(producto)
      const lista = getMockStock()
      setStock(lista)
      if (producto.cantidad > 0 && producto.codigo_barras) {
        const linea = buscarPorCodigo(lista, producto.codigo_barras)
        if (linea && linea.cantidad > 0) agregarCarrito(linea)
      }
      avisar(`Producto cargado a la Caja: ${producto.nombre}.`, 'ok')
      setNuevoOpen(false)
      return
    }

    const codigoBarras = producto.codigo_barras?.trim() || null
    const ahora = new Date().toISOString()
    const maestroId = crypto.randomUUID()
    const lineaId = crypto.randomUUID()

    const resultado = await ejecutarEscritura<{ lineaId: string }>({
      operacion: {
        tipo: 'producto',
        maestroId,
        lineaId,
        codigo: codigoBarras,
        nombre: producto.nombre,
        marca: producto.marca,
        categoria: producto.categoria,
        sucursalId: null,
        sku: producto.sku,
        variante: producto.variante,
        precio: producto.precio,
        costo: producto.costo,
        moneda: producto.moneda,
        cantidad: producto.cantidad,
        creadoEn: ahora,
      },
      ejecutarRemoto: async () => {
        const { data, error } = await supabase.rpc('registrar_producto', {
          p_maestro_id: maestroId,
          p_codigo: codigoBarras,
          p_nombre: producto.nombre,
          p_marca: producto.marca,
          p_categoria: producto.categoria,
          p_linea_id: lineaId,
          p_sucursal_id: null,
          p_sku: producto.sku,
          p_variante: producto.variante,
          p_precio: producto.precio,
          p_costo: producto.costo,
          p_moneda: producto.moneda,
          p_cantidad: producto.cantidad,
          p_created_at: ahora,
        })
        if (error) throw error
        if (!data) throw new Error('No se pudo registrar el producto')
        return { lineaId: data }
      },
    })

    const lineaIdEfectiva = resultado.remoto
      ? resultado.resultado.lineaId
      : lineaId
    const existente = stock?.find((s) => s.id === lineaIdEfectiva)

    if (existente) {
      if (existente.cantidad > 0) agregarCarrito(existente)
    } else {
      const fila = lineaLocalDesdeProducto(producto, maestroId, lineaIdEfectiva)
      setStock((prev) => {
        const lista = prev
          ? [fila, ...prev.filter((s) => s.id !== fila.id)]
          : [fila]
        guardarCacheStock(vista, lista)
        return lista
      })
      if (fila.cantidad > 0) agregarCarrito(fila)
    }

    avisar(
      `Producto cargado a la Caja${resultado.remoto ? '' : ' (sin conexión: quedó pendiente de sincronizar)'}: ${producto.nombre}.`,
      'ok',
    )
    setNuevoOpen(false)
  }

  async function reponerProductoEnCaja(reponer: PayloadReponer) {
    const cantidad = Math.max(1, Math.floor(reponer.cantidad))
    if (!isSupabaseConfigured) {
      const nombre = reponerStockMock(
        reponer.codigo_barras,
        cantidad,
        reponer.tipo,
        reponer.motivo,
      )
      if (!nombre) return false
      setStock(getMockStock())
      avisar(
        `Se ${reponer.tipo === 'entrada' ? 'sumaron' : 'descontaron'} ${cantidad} unidades de ${nombre}.`,
        'ok',
      )
      setReponerOpen(false)
      return true
    }

    const lista = stock ?? []
    const linea = buscarPorCodigo(lista, reponer.codigo_barras.trim())
    if (!linea) {
      avisar(`El código ${reponer.codigo_barras} no está en el stock de esta Caja.`)
      setReponerOpen(false)
      return false
    }

    const movimientoId = crypto.randomUUID()
    const ahora = new Date().toISOString()

    const resultado = await ejecutarEscritura<{ movimientoId: string }>({
      operacion: {
        tipo: 'ajuste',
        movimientoId,
        lineaId: linea.id,
        sucursalId: linea.sucursal_id,
        sentido: reponer.tipo,
        cantidad,
        motivo: reponer.motivo?.trim() || null,
        productoNombre: linea.producto?.nombre ?? 'Producto',
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
          p_producto_nombre: linea.producto?.nombre ?? 'Producto',
          p_codigo_barras: linea.producto?.codigo_barras ?? null,
          p_sku: linea.sku,
          p_created_at: ahora,
        })
        if (error) throw error
        return { movimientoId }
      },
      aplicarLocal: () =>
        aplicarAjusteStockLocal(
          linea.id,
          reponer.tipo === 'entrada' ? cantidad : -cantidad,
        ),
    })

    if (resultado.remoto) await recargarStock()
    avisar(
      `Se ${reponer.tipo === 'entrada' ? 'sumaron' : 'descontaron'} ${cantidad} unidades de ${linea.producto?.nombre ?? 'el producto'}${resultado.remoto ? '' : ' (sin conexión: quedó pendiente de sincronizar)'}.`,
      'ok',
    )
    setReponerOpen(false)
    return true
  }

  function recibirProductoRemoto(producto: PayloadNuevoProducto) {
    const lista = stock ?? getMockStock()
    if (
      producto.codigo_barras &&
      buscarPorCodigo(lista, producto.codigo_barras)
    ) {
      avisar(
        `"${producto.nombre}" ya estaba en el stock de esta Caja (no se duplicó).`,
      )
      return
    }
    crearProductoMock(producto)
    setStock(getMockStock())
    avisar(`Nuevo producto recibido desde tu celular: ${producto.nombre}.`, 'ok')
  }

  function recibirReponerRemoto(reponer: PayloadReponer) {
    const lista = stock ?? getMockStock()
    const nombre = reponerStockMock(
      reponer.codigo_barras,
      reponer.cantidad,
      reponer.tipo,
      reponer.motivo,
    )
    if (
      !nombre ||
      !buscarPorCodigo(lista, reponer.codigo_barras)
    ) {
      avisar(`El código ${reponer.codigo_barras} no está en el stock de esta Caja.`)
      return
    }
    setStock(getMockStock())
    avisar(
      `Se ${reponer.tipo === 'entrada' ? 'sumaron' : 'descontaron'} ${reponer.cantidad} unidades de ${nombre} desde tu celular.`,
      'ok',
    )
  }

  function handleQuerySubmit(event: FormEvent) {
    event.preventDefault()
    const q = query.trim()
    if (!q || !stock) return
    const exacto = buscarPorCodigo(stock, q)
    if (exacto) {
      agregarCarrito(exacto)
      return
    }
    const resultados = buscarPorQuery(stock, q).filter((s) => s.cantidad > 0)
    if (resultados.length === 1) {
      agregarCarrito(resultados[0])
      return
    }
    if (resultados.length === 0) avisar('No se encontró ningún producto.')
  }

  const resultadosBusqueda = query.trim()
    ? buscarPorQuery(stock ?? [], query)
        .filter((s) => s.cantidad > 0)
        .slice(0, 6)
    : []

  function toggleMetodo(metodo: MetodoPago) {
    const yaExiste = pagos.some((p) => p.metodo === metodo)
    if (yaExiste) {
      setPagos((prev) => prev.filter((p) => p.metodo !== metodo))
      return
    }
    if (metodo === 'pos') {
      abrirCobroPos()
      return
    }

    const pendienteGs = Math.max(0, totalGs - pagoTotalGs)
    const monto = desdectar(pendienteGs)

    const nuevo: Pago = {
      id: crypto.randomUUID(),
      metodo,
      monto: cantidadString(monto),
      moneda: monedaCobro,
    }

    if (multiples) {
      setPagos((prev) => [...prev, nuevo])
    } else {
      setPagos([nuevo])
    }
  }

  function abrirCobroPos() {
    if (!config.bancardActivo) {
      avisar('Activá POS Bancard en Configuración antes de cobrar.')
      return
    }
    if (!config.bancardIp.trim()) {
      avisar('Configurá la IP del POS Bancard en Configuración.')
      return
    }
    const pendiente = Math.max(0, totalGs - pagoTotalGs)
    if (pendiente < 1) {
      avisar('El total ya está cubierto.')
      return
    }
    setPosMontoGs(Math.max(1, Math.round(pendiente)))
    setPosMedio(null)
    setPosResultado(null)
    setPosEstado('idle')
    setPosCargando(false)
    setPosMensaje('')
    setPosAbierto(true)
  }

  async function iniciarCobroPos(medio: MedioPosCaja) {
    if (posCargando) return
    setPosMedio(medio)
    setPosCargando(true)
    setPosEstado('eco')
    setPosMensaje('Verificando conexión con el POS Bancard…')
    try {
      await probarConexionPos(config.bancardIp, config.bancardPuerto)
      setPosEstado('esperando')
      setPosMensaje(
        'Esperando el pago… completá la operación en el terminal (tarjeta o QR).',
      )
      const factura = Date.now()
      const resultado =
        medio === 'qr'
          ? await cobrarQrPos(
              config.bancardIp,
              config.bancardPuerto,
              posMontoGs,
              factura,
              0,
            )
          : await cobrarTarjetaPos(
              config.bancardIp,
              config.bancardPuerto,
              medio === 'debito' ? 'debito' : 'contado',
              posMontoGs,
              factura,
            )
      setPosResultado(resultado)
      setPosCargando(false)
      setPosEstado('ok')
      setPagos((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          metodo: 'pos',
          monto: cantidadString(desdectar(posMontoGs)),
          moneda: monedaCobro,
          detalle: detalleDeResultadoPos(resultado),
          fijo: true,
        },
      ])
    } catch (e) {
      setPosCargando(false)
      setPosEstado('error')
      setPosMensaje(
        `El POS rechazó el pago: ${
          e instanceof Error ? e.message : 'intentá nuevamente'
        }. No se registró el pago ni se cierra la venta.`,
      )
    }
  }

  function detalleDeResultadoPos(res: ResultadoPos): string {
    const partes: string[] = []
    if (res.nombreTarjeta) partes.push(res.nombreTarjeta)
    if (res.nroBoleta) partes.push(`N° ${res.nroBoleta}`)
    if (res.codigoAutorizacion) partes.push(`Auth ${res.codigoAutorizacion}`)
    return partes.join(' · ')
  }

  function actualizarPago(id: string, cambios: Partial<Omit<Pago, 'id'>>) {
    setPagos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)),
    )
  }

  function desdectar(gs: number): number {
    return desdeGs(gs, monedaCobro, tasas)
  }

  function cantidadString(n: number): string {
    return n.toFixed(monedaCobro === 'PYG' ? 0 : 2)
  }

  async function refrescarTasas() {
    const cotiz = await obtenerCotizaciones()
    setTasas(cotiz)
    setActualizado(cotiz.actualizado_a)
    avisar('Cotizaciones actualizadas.', 'ok')
  }

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(enlaceEscaneo)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permisos de portapapeles: el enlace se ve igual en pantalla.
    }
  }

  function armarTicket(ventaId: string, resumen: string): TicketVenta {
    const fecha = new Date().toLocaleString('es-PY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    return {
      nombreLocal: nombreLocalPropio(),
      fecha,
      numeroVenta: `VTA-${ventaId.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      items: carrito.map((c) => ({
        nombre: c.linea.producto?.nombre ?? c.linea.sku ?? 'Producto',
        detalle: c.linea.variante ?? undefined,
        cantidad: c.cantidad,
        precio: formatMoney(
          convertir(c.linea.precio, c.linea.moneda, monedaCobro, tasas),
          monedaCobro,
        ),
        total: formatMoney(
          convertir(c.linea.precio, c.linea.moneda, monedaCobro, tasas) * c.cantidad,
          monedaCobro,
        ),
      })),
      total: formatMoney(totalEnCobro, monedaCobro),
      metodosPago: resumen || (esFiado ? 'Crédito' : '—'),
      ...(!esFiado
        ? {
            recibido: formatMoney(
              desdeGs(pagoTotalGs, monedaCobro, tasas),
              monedaCobro,
            ),
            cambio:
              cambioGs > 0
                ? formatMoney(
                    desdeGs(Math.max(0, cambioGs), monedaCobro, tasas),
                    monedaCobro,
                  )
                : undefined,
          }
        : {}),
      esCredito: esFiado,
    }
  }

  async function imprimirUltimo() {
    if (!ultimoTicket) return
    setReimprimiendo(true)
    try {
      const res = await imprimirTicket(ultimoTicket)
      setResultadoImpresion(res)
    } finally {
      setReimprimiendo(false)
    }
  }

  async function imprimirUltimoPC() {
    if (!ultimoTicket) return
    setReimprimiendo(true)
    try {
      const res = await imprimirTicketPC(ultimoTicket, config.anchoTicketPc)
      setResultadoImpresion(res)
    } finally {
      setReimprimiendo(false)
    }
  }

  async function copiarUltimo() {
    if (!ultimoTicket) return
    const ok = await copiarTicket(armarTextoPlano(ultimoTicket))
    avisar(
      ok ? 'Ticket copiado al portapapeles.' : 'No se pudo copiar el ticket.',
      ok ? 'ok' : 'error',
    )
  }

  function cerrarResultado() {
    setResultadoImpresion(null)
    setConcluirOpen(true)
  }

  function concluirVenta() {
    setCarrito([])
    setPagos([])
    setQuery('')
    limpiarCarritoPersistido()
    setConcluirOpen(false)
  }

  async function cobrar() {
    if (!puedeCobrar) return

    // estado solo significa sincronización/confirmación del servidor. El
    // crédito (venta fiado) NO pisa este campo: se identifica exclusivamente
    // por un venta_pagos con metodo = 'fiado', y así suma a los reportes de
    // ventas del día.
    const estado: 'pendiente_sync' | 'confirmada' = 'confirmada'

    const resumen = pagos
      .filter((p) => pagoGs(p) > 0)
      .map((p) => {
        const base = METODOS[p.metodo].nombre
        return p.metodo === 'pos' && p.detalle ? `${base} (${p.detalle})` : base
      })
      .join(' + ')

    let ventaId: string | null = null
    let sinConexion = false

    try {
      if (!isSupabaseConfigured) {
        const venta = registrarVentaCaja({
          items: carrito.map((c) => ({
            stockLineaId: c.linea.id,
            cantidad: c.cantidad,
            precioUnitario: c.linea.precio,
            moneda: c.linea.moneda,
          })),
          totalGs,
          estado,
        })
        ventaId = venta.id
        setStock(getMockStock())
      } else {
        const ahora = new Date().toISOString()
        const ventaIdUUID = crypto.randomUUID()
        const resultado = await ejecutarEscritura<{ ventaId: string }>({
          operacion: {
            tipo: 'venta',
            ventaId: ventaIdUUID,
            sucursalId: carrito[0].linea.sucursal_id,
            total: Math.round(totalGs),
            estado,
            creadoEn: ahora,
            items: carrito.map((c) => ({
              id: crypto.randomUUID(),
              stockId: c.linea.id,
              cantidad: c.cantidad,
              precioUnitario: c.linea.precio,
              precioUnitarioGs: convertir(c.linea.precio, c.linea.moneda, 'PYG', tasas),
            })),
            pagos: pagos
              .filter((p) => pagoGs(p) > 0)
              .map((p) => ({
                id: p.id,
                metodo: p.metodo as MetodoPagoVenta,
                moneda: p.moneda,
                monto: Math.round(parseMonto(p.monto) * 100) / 100,
                detalle: p.detalle ?? undefined,
              })),
          },
          ejecutarRemoto: async () => {
            const { error } = await supabase.rpc('registrar_venta', {
              p_venta_id: ventaIdUUID,
              p_sucursal_id: carrito[0].linea.sucursal_id,
              p_total: Math.round(totalGs),
              p_items: carrito.map((c) => ({
                id: crypto.randomUUID(),
                stock_id: c.linea.id,
                cantidad: c.cantidad,
                precio_unitario: c.linea.precio,
                precio_unitario_gs: convertir(c.linea.precio, c.linea.moneda, 'PYG', tasas),
              })),
              p_pagos: pagos
                .filter((p) => pagoGs(p) > 0)
                .map((p) => ({
                  id: p.id,
                  metodo: p.metodo,
                  moneda: p.moneda,
                  monto: Math.round(parseMonto(p.monto) * 100) / 100,
                  detalle: p.detalle ?? null,
                })),
              p_estado: estado,
              p_created_at: ahora,
            })
            if (error) throw error
            return { ventaId: ventaIdUUID }
          },
          aplicarLocal: () => {
            setStock((prev) => {
              if (!prev) return prev
              const lista = prev.map((s) => {
                const item = carrito.find((c) => c.linea.id === s.id)
                return item
                  ? { ...s, cantidad: Math.max(0, s.cantidad - item.cantidad) }
                  : s
              })
              guardarCacheStock(vista, lista)
              return lista
            })
          },
        })
        ventaId = resultado.remoto
          ? resultado.resultado.ventaId
          : ventaIdUUID
        sinConexion = !resultado.remoto
      }

      setPagos([])
      setQuery('')
      avisar(
        `Venta ${sinConexion ? 'guardada sin conexión, se sincronizará' : 'confirmada'} (${resumen || '…'})`,
        'ok',
      )

      if (ventaId) {
        const ticket = armarTicket(ventaId, resumen)
        guardarTicketVentaMock(ventaId, ticket)
        guardarUltimoTicket(ticket)
        setUltimoTicket(ticket)
        setResultadoImpresion({
          texto: armarTextoPlano(ticket),
          nativo: false,
          compartido: false,
        })
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Ocurrió un error al cobrar.')
    }
  }

  const esFiado = pagos.some((p) => p.metodo === 'fiado')

  return (
    <>
      <div className="grid gap-4 pb-36 md:pb-28 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0">
        <section className="space-y-3">
          <div>
            <h1 className="text-lg font-semibold">Caja</h1>
            <p className="text-sm text-muted-foreground">
              Escaneá productos y cobrá con el método que prefieras.
            </p>
          </div>

          <form onSubmit={handleQuerySubmit} className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escaneá o buscá por nombre / código…"
              className="h-12 pr-14 text-base"
            />
            <BarcodeScanner
              onDetected={(code) => void agregarCodigo(code)}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-11 -translate-y-1/2"
                  aria-label="Escanear con la cámara"
                >
                  <ScanBarcode />
                </Button>
              }
            />
          </form>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                setNuevoCodigo('')
                setNuevoOpen(true)
              }}
            >
              <PackagePlus className="size-5" />
              Agregar producto
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                setReponerCodigo('')
                setReponerOpen(true)
              }}
            >
              <Plus className="size-5" />
              Reponer stock
            </Button>
          </div>

          {query.trim() && resultadosBusqueda.length > 0 && (
            <div className="-mt-2 overflow-hidden rounded-md border bg-card">
              {resultadosBusqueda.map((linea) => (
                <button
                  key={linea.id}
                  type="button"
                  onClick={() => agregarCarrito(linea)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span>
                    <span className="font-medium">{linea.producto?.nombre}</span>
                    {linea.variante ? ` (${linea.variante})` : ''}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <Badge variant="outline">{linea.cantidad} unid.</Badge>
                    <span className="tabular-nums">
                      {formatMoney(linea.precio, linea.moneda)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {aviso && (
            <p
              className={cn(
                'flex items-center gap-2 rounded-md border p-3 text-sm',
                aviso.tipo === 'ok'
                  ? 'border-emerald-300/50 bg-emerald-50 text-emerald-700'
                  : 'border-destructive/30 bg-destructive/10 text-destructive',
              )}
            >
              {aviso.tipo === 'ok' ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <AlertTriangle className="size-4 shrink-0" />
              )}
              {aviso.texto}
            </p>
          )}

          {carrito.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-10 text-center">
              <ShoppingCart className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">El carrito está vacío</p>
              <p className="text-sm text-muted-foreground">
                Escaneá un producto o buscá por nombre para agregarlo.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <div className="divide-y">
                {carrito.map((c) => {
                  const etiqueta =
                    (c.linea.producto?.nombre ?? '') +
                    (c.linea.variante ? ` (${c.linea.variante})` : '')
                  return (
                    <div
                      key={c.linea.id}
                      className={cn(
                        'flex items-center gap-1.5 p-2',
                        flashId === c.linea.id && 'caja-flash-row',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'truncate font-medium',
                            etiqueta.length > 22 ? 'text-xs' : 'text-sm',
                          )}
                        >
                          {etiqueta}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(c.linea.precio, c.linea.moneda)} c/u
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center rounded-md border">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-11"
                          onClick={() => setCantidad(c.linea.id, c.cantidad - 1)}
                          aria-label="Quitar uno"
                        >
                          <Minus />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold tabular-nums">
                          {c.cantidad}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="size-11"
                          onClick={() => setCantidad(c.linea.id, c.cantidad + 1)}
                          aria-label="Sumar uno"
                        >
                          <Plus />
                        </Button>
                      </div>

                      <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums">
                        {formatMoney(
                          c.linea.precio * c.cantidad,
                          c.linea.moneda,
                        )}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="size-11 shrink-0 text-muted-foreground"
                        onClick={() => remover(c.linea.id)}
                        aria-label="Quitar del carrito"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Cobro</h2>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-10 text-muted-foreground"
                  onClick={() => setImpresoraOpen(true)}
                  aria-label="Impresora térmica"
                >
                  <Printer />
                </Button>
                <button
                  type="button"
                  onClick={() => setMultiples((m) => !m)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                    multiples
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Settings2 className="size-3.5" />
                  Pagos múltiples
                  {multiples && <span className="sr-only">activado</span>}
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-end justify-between">
              <div className="space-y-1">
                <Label htmlFor="caja-moneda">Cobrar en</Label>
                <Select value={monedaCobro} onValueChange={(m) => setMonedaCobro(m as Moneda)}>
                  <SelectTrigger id="caja-moneda" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monedasDisponibles.map((m) => (
                      <SelectItem key={m.codigo} value={m.codigo}>
                        {m.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold tabular-nums">
                  {carrito.length > 0
                    ? formatMoney(totalEnCobro, monedaCobro)
                    : '—'}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {METODOS_ACTIVOS.map((metodo) => {
                const activo = pagos.some((p) => p.metodo === metodo)
                const meta = METODOS[metodo]
                return (
                  <Button
                    key={metodo}
                    type="button"
                    variant={activo ? 'default' : 'outline'}
                    className="h-13 justify-start gap-2"
                    onClick={() =>
                      metodo === 'pos'
                        ? activo
                          ? toggleMetodo('pos')
                          : abrirCobroPos()
                        : toggleMetodo(metodo)
                    }
                  >
                    <meta.Icono className="size-5 shrink-0" />
                    {meta.nombre}
                  </Button>
                );
              })}
            </div>

            {pagos.length > 0 && (
              <div className="mt-3 space-y-2">
                {pagos.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-md border p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-medium">
                        {(() => {
                          const I = METODOS[p.metodo].Icono
                          return <I className="size-4 text-muted-foreground" />
                        })()}
                        {METODOS[p.metodo].nombre}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="ml-auto size-9 text-muted-foreground"
                        onClick={() => toggleMetodo(p.metodo)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {p.metodo === 'pos' && p.fijo ? (
                      <div className="mt-1.5 space-y-1">
                        <div className="flex h-11 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold tabular-nums">
                          {formatMoney(parseMonto(p.monto), p.moneda)}
                        </div>
                        {p.detalle && (
                          <p className="text-xs font-medium text-muted-foreground">
                            {p.detalle}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-1.5 flex items-center gap-2">
                        <MoneyInput
                          value={p.monto}
                          onChange={(v) => actualizarPago(p.id, { monto: v })}
                          placeholder="0"
                          className="h-11 flex-1 tabular-nums"
                        />
                        <Select
                          value={p.moneda}
                          onValueChange={(m) => actualizarPago(p.id, { moneda: m as Moneda })}
                        >
                          <SelectTrigger className="h-11 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {monedasDisponibles.map((m) => (
                              <SelectItem key={m.codigo} value={m.codigo}>
                                {m.codigo}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pagos.length > 0 && (
              <div className="mt-3 space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(totalEnCobro, monedaCobro)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recibido</span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(desdeGs(pagoTotalGs, monedaCobro, tasas), monedaCobro)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cambio</span>
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      cambioGs > 0 ? 'text-emerald-600' : 'text-muted-foreground',
                    )}
                  >
                    {formatMoney(desdeGs(Math.max(0, cambioGs), monedaCobro, tasas), monedaCobro)}
                  </span>
                </div>
                {esFiado && (
                  <p className="rounded-md border border-amber-300/50 bg-amber-50 p-2 text-xs text-amber-700">
                    Venta a crédito: queda pendiente de pago al cliente.
                  </p>
                )}
              </div>
            )}

            <Button
              type="button"
              className="mt-4 h-14 w-full text-base"
              disabled={!puedeCobrar}
              onClick={() => void cobrar()}
            >
              {puedeCobrar
                ? `Cobrar ${formatMoney(totalEnCobro, monedaCobro)}`
                : carrito.length === 0
                  ? 'Agregá productos para cobrar'
                  : 'Falta cubrir el total'}
            </Button>

            <div className="mt-4 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Cotizaciones
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void refrescarTasas()}
                  aria-label="Actualizar cotizaciones"
                  className="size-9 text-muted-foreground"
                >
                  <RefreshCw />
                </Button>
              </div>
              <ul className="mt-2 space-y-1 text-xs tabular-nums">
                <li className="flex justify-between">
                  <span className="text-muted-foreground">1 US$</span>
                  <span>{formatMoney(tasas.USD, 'PYG')}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">1 $ ARS</span>
                  <span>{formatMoney(tasas.ARS, 'PYG')}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">1 R$</span>
                  <span>{formatMoney(tasas.BRL, 'PYG')}</span>
                </li>
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {actualizado ? `Actualizado ${formatFecha(actualizado)}` : 'Cargando…'}
              </p>
            </div>
          </div>

          <div className="hidden rounded-xl border bg-card p-4 lg:block">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Escáner remoto</h2>
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  remoto.estado === 'conectado'
                    ? 'bg-emerald-500'
                    : remoto.estado === 'error'
                      ? 'bg-destructive'
                      : 'animate-pulse bg-amber-500',
                )}
                aria-hidden
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {remoto.estado === 'conectado'
                ? 'Escaneá desde tu celular y cada lectura cae acá al carrito.'
                : remoto.estado === 'error'
                  ? 'Sin conexión: compu y celular tienen que estar en la misma red.'
                  : 'Conectando…'}
            </p>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-background p-3">
              <span className="text-sm font-semibold">Caja {config.cajaNumero}</span>
              <a
                href="/app/configuracion"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="size-3.5" />
                Configurar
              </a>
            </div>

            <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <QrCode value={enlaceEscaneo} size={180} />
              <p className="text-center text-xs text-muted-foreground">
                Escanealo con la cámara del celular para conectar este teléfono
                a la Caja {config.cajaNumero}.
              </p>
              <button
                type="button"
                onClick={() => void copiarEnlace()}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {copiado ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copiado ? 'Enlace copiado' : 'Copiar enlace'}
              </button>
            </div>

            <p className="mt-2 border-t pt-2 text-xs font-medium text-muted-foreground">
              {remoto.escaneadoresConectados > 0
                ? `${remoto.escaneadoresConectados} celular${
                    remoto.escaneadoresConectados === 1 ? '' : 'es'
                  } conectado${remoto.escaneadoresConectados === 1 ? '' : 's'}`
                : 'Ningún celular conectado todavía'}
            </p>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-background/95 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur md:bottom-0 md:pb-3 lg:hidden">
        <BarcodeScanner
          onDetected={(code) => void agregarCodigo(code)}
          trigger={
            <Button type="button" className="h-14 w-full text-base">
              <ScanBarcode className="size-6" />
              Escanear
            </Button>
          }
        />
      </div>

      <NuevoProductoCajaDialog
        open={nuevoOpen}
        onOpenChange={setNuevoOpen}
        codigoInicial={nuevoCodigo}
        onGuardar={guardarProductoEnCaja}
      />

      <ReponerStockCajaDialog
        open={reponerOpen}
        onOpenChange={setReponerOpen}
        codigoInicial={reponerCodigo}
        onGuardar={reponerProductoEnCaja}
      />

      <ImpresoraDialog open={impresoraOpen} onOpenChange={setImpresoraOpen} />

      <Dialog open={concluirOpen} onOpenChange={setConcluirOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Concluir venta</DialogTitle>
            <DialogDescription>
              ¿Terminaste esta venta? Al aceptar se vacía el carrito y podés
              empezar la siguiente venta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConcluirOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={concluirVenta}>
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={posAbierto}
        onOpenChange={(v) => {
          if (!v && !posCargando) setPosAbierto(false)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar con POS Bancard</DialogTitle>
            <DialogDescription>
              Monto a cobrar:{' '}
              <span className="font-semibold text-foreground">
                {formatMoney(posMontoGs, 'PYG')}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {(posEstado === 'idle' || posEstado === 'error') && (
              <div className="space-y-3">
                {posEstado === 'error' && (
                  <p className="rounded-md border border-red-300/60 bg-red-50 p-2 text-xs font-medium text-red-700">
                    {posMensaje}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Elegí el medio de pago: el terminal recibe el monto y se
                  completa la operación físicamente en el POS.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={posMedio === 'qr' ? 'default' : 'outline'}
                    className="h-20 flex-col gap-1"
                    disabled={posCargando}
                    onClick={() => void iniciarCobroPos('qr')}
                  >
                    <QrCodeIcon className="size-6" />
                    QR
                  </Button>
                  <Button
                    type="button"
                    variant={posMedio === 'debito' ? 'default' : 'outline'}
                    className="h-20 flex-col gap-1"
                    disabled={posCargando}
                    onClick={() => void iniciarCobroPos('debito')}
                  >
                    <CreditCard className="size-6" />
                    Débito
                  </Button>
                  <Button
                    type="button"
                    variant={posMedio === 'contado' ? 'default' : 'outline'}
                    className="h-20 flex-col gap-1"
                    disabled={posCargando}
                    onClick={() => void iniciarCobroPos('contado')}
                  >
                    <Coins className="size-6" />
                    Contado
                  </Button>
                </div>
              </div>
            )}

            {(posEstado === 'eco' || posEstado === 'esperando') && (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm">{posMensaje}</p>
              </div>
            )}

            {posEstado === 'ok' && posResultado && (
              <div className="space-y-2 rounded-md border border-emerald-300/60 bg-emerald-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  Pago aprobado en el POS
                </p>
                <dl className="space-y-1 text-sm">
                  {posResultado.nombreTarjeta && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Tarjeta</dt>
                      <dd className="text-right font-medium">
                        {posResultado.nombreTarjeta}
                      </dd>
                    </div>
                  )}
                  {posResultado.nroBoleta && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Boleta</dt>
                      <dd className="text-right font-medium tabular-nums">
                        {posResultado.nroBoleta}
                      </dd>
                    </div>
                  )}
                  {posResultado.codigoAutorizacion && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Autorización</dt>
                      <dd className="text-right font-medium tabular-nums">
                        {posResultado.codigoAutorizacion}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="text-xs text-emerald-700/80">
                  El importe ya quedó cargado en el cobro. Ahora pulsá «Cobrar»
                  para cerrar la venta e imprimir el ticket.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {posEstado === 'ok' ? (
              <Button type="button" onClick={() => setPosAbierto(false)}>
                Listo
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={posCargando}
                onClick={() => setPosAbierto(false)}
              >
                Cancelar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResultadoImpresionDialog
        resultado={resultadoImpresion}
        puedeImprimir={Boolean(ultimoTicket)}
        reimprimiendo={reimprimiendo}
        onImprimirPC={() => void imprimirUltimoPC()}
        onImprimir={() => void imprimirUltimo()}
        onCopiar={() => void copiarUltimo()}
        onOpenChange={(v) => {
          if (!v) cerrarResultado()
        }}
      />
    </>
  )
}