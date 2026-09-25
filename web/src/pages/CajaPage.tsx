import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Coins,
  CreditCard,
  HandCoins,
  Loader2,
  Minus,
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
import EscanerSelector from '@/components/EscanerSelector'
import MoneyInput from '@/components/MoneyInput'
import { useAuth } from '@/components/auth/AuthContext'
import ImpresoraDialog from '@/components/ImpresoraDialog'
import ResultadoImpresionDialog from '@/components/ResultadoImpresionDialog'
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
import { monedaPrincipal, nombreNegocio, datosEmpresa, useConfig } from '@/lib/config'
import {
  ejecutarEscritura,
} from '@/lib/ejecutar'
import {
  copiarTicket,
  imprimirBluetooth,
  imprimirTicket,
  imprimirTicketPC,
  type ResultadoImpresion,
} from '@/lib/impresion/imprimir'
import { armarTextoPlano, type TicketVenta } from '@/lib/impresion/ticket'
import { impresoraNativaDisponible } from '@/lib/impresion/nativo'
import {
  crearProductoMock,
  getMockStock,
  guardarTicketVentaMock,
  registrarVentaCaja,
  reponerStockMock,
} from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { dispositivoActual } from '@/lib/auditoriaData'
import { esErrorDeRed } from '@/lib/red'
import { sucursalIdDeClaim } from '@/lib/sucursal'
import { vistaStock } from '@/lib/vistaStock'
import { useKeyboardScanner } from '@/lib/useKeyboardScanner'
import { cn } from 'cn'

type StockRow = Database['public']['Views']['stock_tienda_dueno']['Row'] & {
  producto: Database['public']['Tables']['productos_maestro']['Row'] | null
}

type CarritoItem = { linea: StockRow; cantidad: number }

type MetodoPago = 'efectivo' | 'pos' | 'tarjeta' | 'transferencia' | 'fiado'

const METODOS: Record<MetodoPago, { nombre: string; Icono: LucideIcon }> = {
  efectivo: { nombre: 'Efectivo', Icono: Banknote },
  pos: { nombre: 'POS Bancard', Icono: CreditCard },
  tarjeta: { nombre: 'Tarjeta', Icono: CreditCard },
  transferencia: { nombre: 'Transferencia', Icono: HandCoins },
  fiado: { nombre: 'Crédito / Fiado', Icono: Wallet },
}

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
const CLAVE_CARRITO_LEGADO = 'kahabox:caja:carrito'
const CLAVE_CARRITO_PREFIJO = 'kahabox:caja:carrito:v2'
const FRESCURA_CARRITO_PERSISTIDO_MS = 48 * 60 * 60 * 1000

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

/**
 * Carrito guardado en localStorage para que la venta en curso sobreviva a
 * navegar entre módulos y a la falta de conexión. Cada línea guarda un
 * snapshot de la línea (sin depender del stock cargado) para poder restaurar
 * y cobrar offline; cuando el stock vuelve, se refrescan los datos reales.
 */
type CarritoPersistidoV2 = {
  guardadoEn: number
  carrito: CarritoItem[]
  pagos: Pago[]
  monedaCobro: Moneda
  multiples: boolean
}

function claveCarrito(cajaNumero: number, usuarioId: string): string {
  return `${CLAVE_CARRITO_PREFIJO}:${cajaNumero}:${usuarioId}`
}

function leerCarritoLegado(): { id: string; cantidad: number }[] {
  try {
    const raw = localStorage.getItem(CLAVE_CARRITO_LEGADO)
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

function guardarCarritoPersistido(
  cajaNumero: number,
  usuarioId: string,
  dato: CarritoPersistidoV2,
): void {
  try {
    localStorage.setItem(claveCarrito(cajaNumero, usuarioId), JSON.stringify(dato))
    localStorage.removeItem(CLAVE_CARRITO_LEGADO)
  } catch {
    // Sin storage: no se conserva entre visitas.
  }
}

function limpiarCarritoLegado(): void {
  try {
    localStorage.removeItem(CLAVE_CARRITO_LEGADO)
  } catch {
    // Sin storage.
  }
}

function limpiarCarritoPersistido(cajaNumero: number, usuarioId: string): void {
  try {
    localStorage.removeItem(claveCarrito(cajaNumero, usuarioId))
    limpiarCarritoLegado()
  } catch {
    // Sin storage.
  }
}

function leerCarritoPersistido(
  cajaNumero: number,
  usuarioId: string,
): CarritoPersistidoV2 | null {
  try {
    const raw = localStorage.getItem(claveCarrito(cajaNumero, usuarioId))
    if (!raw) return null
    const dato = JSON.parse(raw) as Partial<CarritoPersistidoV2>
    if (typeof dato.guardadoEn !== 'number' || !Array.isArray(dato.carrito)) {
      limpiarCarritoPersistido(cajaNumero, usuarioId)
      return null
    }
    if (Date.now() - dato.guardadoEn > FRESCURA_CARRITO_PERSISTIDO_MS) {
      limpiarCarritoPersistido(cajaNumero, usuarioId)
      return null
    }
    const carrito = dato.carrito.filter(
      (c) =>
        c != null &&
        typeof c.cantidad === 'number' &&
        Number.isFinite(c.cantidad) &&
        c.linea != null &&
        typeof c.linea.id === 'string',
    ) as CarritoItem[]
    return {
      guardadoEn: dato.guardadoEn,
      carrito,
      pagos: Array.isArray(dato.pagos) ? (dato.pagos as Pago[]) : [],
      monedaCobro: dato.monedaCobro as Moneda,
      multiples: Boolean(dato.multiples),
    }
  } catch {
    return null
  }
}

function pagosValidos(lista: Pago[]): Pago[] {
  return lista.filter(
    (p) =>
      p != null &&
      typeof p.id === 'string' &&
      typeof p.metodo === 'string' &&
      METODOS[p.metodo] != null &&
      typeof p.monto === 'string' &&
      MONEDAS.some((m) => m.codigo === p.moneda),
  )
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

export default function CajaPage() {
  const config = useConfig()
  const { user } = useAuth()
  const usuarioId = user?.id ?? 'anon'
  const vista = vistaStock(user)
  const sucursalFiltro = config.sucursalId ?? sucursalIdDeClaim(user)
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
  const [yaRestaurado, setYaRestaurado] = useState(false)

  const [posAbierto, setPosAbierto] = useState(false)
  const [posEstado, setPosEstado] = useState<EstadoCobroPos>('idle')
  const [posCargando, setPosCargando] = useState(false)
  const [posMensaje, setPosMensaje] = useState('')
  const [posResultado, setPosResultado] = useState<ResultadoPos | null>(null)
  const [posMedio, setPosMedio] = useState<MedioPosCaja | null>(null)
  const [posMontoGs, setPosMontoGs] = useState(0)

  const [impresoraOpen, setImpresoraOpen] = useState(false)

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
        moneda: s.moneda,
        cantidad: s.cantidad,
      })),
  })

  useKeyboardScanner((code) => {
    void agregarCodigo(code)
  })

  const recargarStock = useCallback(async () => {
    const claveStock = sucursalFiltro ? `${vista}:${sucursalFiltro}` : vista
    const soloSucursal = (filas: StockRow[]): StockRow[] =>
      sucursalFiltro
        ? filas.filter((r) => r.sucursal_id === sucursalFiltro)
        : filas
    if (!isSupabaseConfigured) {
      setStock(soloSucursal(getMockStock()))
      return
    }
    try {
      const { data, error } = await supabase
        .from(vista)
        .select('*, producto:productos_maestro(*)')
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) throw error
      const filas = soloSucursal((data as StockRow[] | null) ?? [])
      setStock(filas)
      guardarCacheStock(claveStock, filas)
    } catch (e) {
      if (!esErrorDeRed(e)) throw e
      // Sin conexión: no pisamos la lista en memoria y usamos la última
      // carga exitosa si no hay nada aún (el SyncBar avisa el estado).
      const cache = soloSucursal(leerCacheStock<StockRow>(claveStock) ?? [])
      setStock((prev) => (prev !== null ? prev : cache))
    }
  }, [vista, sucursalFiltro])

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
    if (carrito.length === 0) {
      // No escribir un carrito vacío sobre el guardado: al montar esto se
      // ejecuta con el carrito inicialmente vacío y borraría la venta en curso.
      return
    }
    guardarCarritoPersistido(config.cajaNumero, usuarioId, {
      guardadoEn: Date.now(),
      carrito,
      pagos,
      monedaCobro,
      multiples,
    })
  }, [carrito, pagos, monedaCobro, multiples, config.cajaNumero, usuarioId])

  useEffect(() => {
    if (yaRestaurado) return
    const dato = leerCarritoPersistido(config.cajaNumero, usuarioId)
    if (!dato || dato.carrito.length === 0) return
    setYaRestaurado(true)
    setCarrito(dato.carrito)
    setPagos(pagosValidos(dato.pagos))
    setMonedaCobro(
      config.monedasActivas.some((m) => m === dato.monedaCobro)
        ? dato.monedaCobro
        : monedaPrincipal(),
    )
    setMultiples(dato.multiples)
    setAviso({ tipo: 'ok', texto: 'Se restauró la venta en curso.' })
  }, [config.cajaNumero, config.monedasActivas, usuarioId, yaRestaurado])

  useEffect(() => {
    if (stock === null) return
    // Migración desde la clave vieja (solo guardaba id/cantidad): la venta se
    // reconstruye con el stock recién cargado en vez de un snapshot offline.
    if (carrito.length === 0) {
      const legado = leerCarritoLegado()
      if (legado.length > 0) {
        const restaurados: CarritoItem[] = []
        for (const p of legado) {
          const linea = stock.find((s) => s.id === p.id)
          if (linea && linea.cantidad > 0) {
            restaurados.push({
              linea,
              cantidad: Math.min(p.cantidad, linea.cantidad),
            })
          }
        }
        if (restaurados.length > 0) {
          setCarrito(restaurados)
          limpiarCarritoLegado()
          setAviso({ tipo: 'ok', texto: 'Se restauró la venta en curso.' })
        }
      }
    }
    // Re-sincroniza las líneas con el stock real: refresca datos, recorta las
    // cantidades a lo disponible y descarta productos que ya no existen.
    // Ojo: comparar con prev y no pisar si nada cambió, porque un array nuevo
    // en cada pasada hace que el efecto se vuelva a ejecutar y congela la app.
    setCarrito((prev) => {
      const siguiente: CarritoItem[] = []
      if (prev.length === 0) return prev
      for (const c of prev) {
        const linea = stock.find((s) => s.id === c.linea.id)
        if (!linea || linea.cantidad <= 0) continue
        siguiente.push({ linea, cantidad: Math.min(c.cantidad, linea.cantidad) })
      }
      if (siguiente.length !== prev.length) return siguiente
      for (let i = 0; i < prev.length; i += 1) {
        if (
          siguiente[i].linea !== prev[i].linea ||
          siguiente[i].cantidad !== prev[i].cantidad
        ) {
          return siguiente
        }
      }
      return prev
    })
  }, [stock, carrito])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 4000)
    return () => clearTimeout(t)
  }, [aviso])

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

  function marcarAgregado() {
    if (navigator.vibrate) navigator.vibrate(15)
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
    marcarAgregado()
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

  async function agregarCodigo(code: string) {
    const limpio = code.trim()
    const lista = stock ?? []
    const linea = buscarPorCodigo(lista, limpio)
    if (!linea) {
      avisar(`El producto con código ${limpio} no existe en stock.`, 'error')
      return
    }
    agregarCarrito(linea)
  }

  function recibirProductoRemoto(producto: PayloadNuevoProducto) {
    if (isSupabaseConfigured) {
      // El celular ya lo registró en Stock vía RPC; acá solo refrescamos.
      void recargarStock()
      avisar(`Nuevo producto recibido desde tu celular: ${producto.nombre}.`, 'ok')
      return
    }
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
    if (isSupabaseConfigured) {
      // El celular ya aplicó el ajuste en Stock vía RPC; acá solo refrescamos.
      const linea = buscarPorCodigo(stock ?? [], reponer.codigo_barras)
      const nombre = linea?.producto?.nombre ?? reponer.codigo_barras
      void recargarStock()
      avisar(
        `Se ${reponer.tipo === 'entrada' ? 'sumaron' : 'descontaron'} ${reponer.cantidad} unidades de ${nombre} desde tu celular.`,
        'ok',
      )
      return
    }
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

  function cambiarMonedaPago(id: string, nueva: Moneda) {
    setPagos((prev) =>
      prev.map((p) => {
        if (p.id !== id || p.moneda === nueva) return p
        const gs = aGs(parseMonto(p.monto), p.moneda, tasas)
        const convertido = desdeGs(gs, nueva, tasas)
        return {
          ...p,
          moneda: nueva,
          monto: (nueva === 'PYG' ? convertido.toFixed(0) : convertido.toFixed(2)),
        }
      }),
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

  function armarTicket(ventaId: string, resumen: string): TicketVenta {
    const fecha = new Date().toLocaleString('es-PY', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const empresa = datosEmpresa()
    return {
      nombreLocal: nombreLocalPropio(),
      ruc: empresa.ruc || undefined,
      direccion: empresa.direccion || undefined,
      telefono: empresa.telefono || undefined,
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

  async function imprimirUltimoBluetooth() {
    if (!ultimoTicket) return
    setReimprimiendo(true)
    try {
      const res = await imprimirBluetooth(ultimoTicket, config.anchoTicketPc)
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
    limpiarCarritoPersistido(config.cajaNumero, usuarioId)
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
          pagos: pagos
            .filter((p) => pagoGs(p) > 0)
            .map((p) => ({
              metodo: p.metodo,
              moneda: p.moneda,
              monto: Math.round(parseMonto(p.monto) * 100) / 100,
              detalle: p.detalle ?? null,
            })),
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
              p_dispositivo: dispositivoActual(),
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
        // No imprimir al confirmar: el ticket sale solo cuando se aprieta
        // «Imprimir / Celular / PC» en el diálogo de resultado.
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

  // Con POS Bancard habilitado la Caja cobra por el terminal; sin él, el botón
  // de tarjeta registra el pago directo (metodo 'tarjeta').
  const metodosActivos: MetodoPago[] = [
    'efectivo',
    config.bancardActivo ? 'pos' : 'tarjeta',
    'transferencia',
    'fiado',
  ]

  return (
    <>
      <div className="grid min-w-0 gap-4 pb-36 md:pb-28 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0">
        <section className="min-w-0 space-y-3">
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

          {query.trim() && resultadosBusqueda.length > 0 && (
            <div className="-mt-2 overflow-hidden rounded-md border bg-card">
              {resultadosBusqueda.map((linea) => (
                <button
                  key={linea.id}
                  type="button"
                  onClick={() => agregarCarrito(linea)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm hover:bg-muted"
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
                      className="flex items-center gap-1.5 p-2"
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

        <aside className="min-w-0 space-y-4">
          <div className="rounded-xl border bg-card p-4">
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
                    'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
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
              {metodosActivos.map((metodo) => {
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
                          onValueChange={(m) =>
                            cambiarMonedaPago(p.id, m as Moneda)
                          }
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
                  <span className="text-muted-foreground">1 US$ (dólar)</span>
                  <span>{formatMoney(tasas.USD, 'PYG')}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">
                    1 Peso arg. (ARS)
                  </span>
                  <span>{formatMoney(tasas.ARS, 'PYG')}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">1 R$ (real)</span>
                  <span>{formatMoney(tasas.BRL, 'PYG')}</span>
                </li>
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {actualizado ? `Actualizado ${formatFecha(actualizado)}` : 'Cargando…'}
              </p>
            </div>
          </div>

          <div className="hidden space-y-3 lg:block">
            <div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
              <span className="text-sm font-semibold">
                Caja {config.cajaNumero}
              </span>
              <a
                href="/app/configuracion"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="size-3.5" />
                Configurar
              </a>
            </div>
            <EscanerSelector
              enlace={enlaceEscaneo}
              estado={remoto.estado}
              escaneadoresConectados={remoto.escaneadoresConectados}
              destino={`la Caja ${config.cajaNumero}`}
            />
          </div>
        </aside>
      </div>

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
        bluetoothActivo={
          impresoraNativaDisponible() &&
          Boolean(config.impresoraBluetooth.impresoraDireccion)
        }
        onImprimirBluetooth={() => void imprimirUltimoBluetooth()}
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
