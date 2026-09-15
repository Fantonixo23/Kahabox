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
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  HandCoins,
  Minus,
  Plus,
  RefreshCw,
  ScanBarcode,
  Settings2,
  ShoppingCart,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import BarcodeScanner from '@/components/BarcodeScanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { MONEDAS, formatFecha, formatMoney, type Moneda } from '@/lib/format'
import {
  useSalaEscaneo,
  type PayloadNuevoProducto,
  type PayloadReponer,
} from '@/lib/escaneoRemoto'
import {
  crearProductoMock,
  getMockStock,
  registrarVentaCaja,
  reponerStockMock,
} from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { useKeyboardScanner } from '@/lib/useKeyboardScanner'
import { cn } from 'cn'

type StockRow = Database['public']['Views']['stock_tienda_dueno']['Row'] & {
  producto: Database['public']['Tables']['productos_maestro']['Row'] | null
}

type CarritoItem = { linea: StockRow; cantidad: number }

type MetodoPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'fiado'

const METODOS: Record<MetodoPago, { nombre: string; Icono: LucideIcon }> = {
  efectivo: { nombre: 'Efectivo', Icono: Banknote },
  tarjeta: { nombre: 'Tarjeta', Icono: CreditCard },
  transferencia: { nombre: 'Transferencia', Icono: HandCoins },
  fiado: { nombre: 'Crédito / Fiado', Icono: Wallet },
}

const METODOS_ACTIVOS: MetodoPago[] = [
  'efectivo',
  'tarjeta',
  'transferencia',
  'fiado',
]

type Pago = {
  id: string
  metodo: MetodoPago
  monto: string
  moneda: Moneda
}

type Aviso = { tipo: 'ok' | 'error'; texto: string }

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

export default function CajaPage() {
  const [stock, setStock] = useState<StockRow[] | null>(null)
  const [carrito, setCarrito] = useState<CarritoItem[]>([])
  const [query, setQuery] = useState('')
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [tasas, setTasas] = useState<Tasas>(tasasBase())
  const [actualizado, setActualizado] = useState<string | null>(null)
  const [monedaCobro, setMonedaCobro] = useState<Moneda>('PYG')
  const [pagos, setPagos] = useState<Pago[]>([])
  const [multiples, setMultiples] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const remoto = useSalaEscaneo({
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
    let activo = true
    async function cargarStock() {
      if (!isSupabaseConfigured) {
        setStock(getMockStock())
        return
      }
      const { data } = await supabase
        .from('stock_tienda_dueno')
        .select('*, producto:productos_maestro(*)')
        .order('updated_at', { ascending: false })
        .limit(500)
      if (activo) setStock((data as StockRow[]) ?? [])
    }
    void cargarStock()
    return () => {
      activo = false
    }
  }, [])

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
    const lista = stock ?? []
    const linea = buscarPorCodigo(lista, code)
    if (!linea) {
      avisar(`El código ${code} no está en tu stock.`)
      return
    }
    agregarCarrito(linea)
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
    const nombre = reponerStockMock(reponer.codigo_barras, reponer.cantidad)
    if (
      !nombre ||
      !buscarPorCodigo(lista, reponer.codigo_barras)
    ) {
      avisar(`El código ${reponer.codigo_barras} no está en el stock de esta Caja.`)
      return
    }
    setStock(getMockStock())
    avisar(
      `Se sumaron ${reponer.cantidad} unidades de ${nombre} desde tu celular.`,
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

  async function copiarSala() {
    try {
      await navigator.clipboard.writeText(remoto.sala)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permisos de portapapeles: el código se ve igual en pantalla.
    }
  }

  async function cobrar() {
    if (!puedeCobrar) return
    const estado = pagos.some((p) => p.metodo === 'fiado')
      ? 'pendiente_sync'
      : 'confirmada'

    const resumen = pagos
      .filter((p) => pagoGs(p) > 0)
      .map((p) => METODOS[p.metodo].nombre)
      .join(' + ')

    try {
      if (!isSupabaseConfigured) {
        registrarVentaCaja({
          items: carrito.map((c) => ({
            stockLineaId: c.linea.id,
            cantidad: c.cantidad,
            precioUnitario: c.linea.precio,
            moneda: c.linea.moneda,
          })),
          totalGs,
          estado,
        })
      } else {
        for (const c of carrito) {
          await supabase
            .from('stock_tienda')
            .update({ cantidad: c.linea.cantidad - c.cantidad })
            .eq('id', c.linea.id)
        }
        const { data: venta, error } = await supabase
          .from('ventas')
          .insert({
            total: Math.round(totalGs),
            estado,
            sucursal_id: carrito[0].linea.sucursal_id,
          })
          .select('id')
          .single()
        if (error) throw error
        for (const c of carrito) {
          const { error: errItem } = await supabase
            .from('venta_items')
            .insert({
              venta_id: venta.id,
              stock_tienda_id: c.linea.id,
              cantidad: c.cantidad,
              precio_unitario: c.linea.precio,
            })
          if (errItem) throw errItem
        }
      }

      setCarrito([])
      setPagos([])
      setQuery('')
      avisar(`Venta confirmada (${resumen || '…'})`, 'ok')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Ocurrió un error al cobrar.')
    }
  }

  const esFiado = pagos.some((p) => p.metodo === 'fiado')

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
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
            autoFocus
            className="h-12 pr-14 text-base"
          />
          <BarcodeScanner
            onDetected={(code) => void agregarCodigo(code)}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-10 w-10 -translate-y-1/2"
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
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
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
              {carrito.map((c) => (
                <div key={c.linea.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.linea.producto?.nombre}
                      {c.linea.variante ? ` (${c.linea.variante})` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(c.linea.precio, c.linea.moneda)} c/u
                    </p>
                  </div>

                  <div className="flex items-center rounded-md border">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setCantidad(c.linea.id, c.cantidad - 1)}
                    >
                      <Minus />
                    </Button>
                    <span className="w-10 text-center text-sm font-semibold tabular-nums">
                      {c.cantidad}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setCantidad(c.linea.id, c.cantidad + 1)}
                    >
                      <Plus />
                    </Button>
                  </div>

                  <span className="w-24 text-right text-sm font-semibold tabular-nums">
                    {formatMoney(
                      c.linea.precio * c.cantidad,
                      c.linea.moneda,
                    )}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                    onClick={() => remover(c.linea.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Cobro</h2>
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

          <div className="mt-3 flex items-end justify-between">
            <div className="space-y-1">
              <Label htmlFor="caja-moneda">Cobrar en</Label>
              <Select value={monedaCobro} onValueChange={(m) => setMonedaCobro(m as Moneda)}>
                <SelectTrigger id="caja-moneda" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONEDAS.map((m) => (
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
                  className="h-12 justify-start gap-2"
                  onClick={() => toggleMetodo(metodo)}
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
                      className="ml-auto text-muted-foreground"
                      onClick={() => toggleMetodo(p.metodo)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={p.monto}
                      onChange={(e) => actualizarPago(p.id, { monto: e.target.value })}
                      placeholder="0"
                      className="h-9 flex-1 tabular-nums"
                    />
                    <Select
                      value={p.moneda}
                      onValueChange={(m) => actualizarPago(p.id, { moneda: m as Moneda })}
                    >
                      <SelectTrigger className="w-24 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONEDAS.map((m) => (
                          <SelectItem key={m.codigo} value={m.codigo}>
                            {m.codigo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
            className="mt-4 w-full"
            size="lg"
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
                className="text-muted-foreground"
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

        <div className="rounded-xl border bg-card p-4">
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
            <span className="font-mono text-lg font-bold tracking-wider">
              {remoto.sala}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void copiarSala()}
              aria-label="Copiar código de sala"
            >
              {copiado ? <Check className="text-emerald-600" /> : <Copy />}
            </Button>
          </div>

          <ol className="mt-2 list-inside list-decimal space-y-0.5 text-xs text-muted-foreground">
            <li>
              En el celular abrí{' '}
              <span className="font-mono">https://{location.host}/escaneo</span>
            </li>
            <li>Ingresá este código de sala</li>
            <li>Escaneá de corrido: se agregan solos al carrito</li>
          </ol>

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
  )
}