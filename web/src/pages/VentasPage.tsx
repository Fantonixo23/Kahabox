import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'

import { Ban, Plus, Printer, Receipt, Search } from 'lucide-react'

import ResultadoImpresionDialog from '@/components/ResultadoImpresionDialog'
import { useAuth } from '@/components/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { nombreNegocio, useConfig } from '@/lib/config'
import type { Database } from '@/lib/database'
import { formatFecha, formatMoney, type Moneda } from '@/lib/format'
import {
  copiarTicket,
  imprimirTicket,
  imprimirTicketPC,
  type ResultadoImpresion,
} from '@/lib/impresion/imprimir'
import { armarTextoPlano, type TicketVenta } from '@/lib/impresion/ticket'
import {
  getMockStock,
  getMockVentasDetalle,
  getTicketVentaMock,
  registrarVentaMock,
  type StockRow,
  type VentaConItems,
  type VentaItemDetalle,
  type VentaPagoDetalle,
} from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { vistaStock, type VistaStock } from '@/lib/vistaStock'

type VentaRow = Database['public']['Tables']['ventas']['Row']

const estadoBadge: Record<VentaRow['estado'], React.ReactNode> = {
  confirmada: <Badge variant="outline">Confirmada</Badge>,
  pendiente_sync: (
    <Badge className="border border-amber-400/40 bg-amber-50 text-amber-700">
      Pendiente de sync
    </Badge>
  ),
  anulada: (
    <Badge className="border border-destructive/30 bg-destructive/10 text-destructive">
      Anulada
    </Badge>
  ),
}

function numeroVenta(id: string): string {
  return `VTA-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

const metodoVentaLabel: Record<VentaPagoDetalle['metodo'], string> = {
  efectivo: 'Efectivo',
  pos: 'POS Bancard',
  transferencia: 'Transferencia',
  fiado: 'Crédito / Fiado',
}

function armarTicketDesdeVenta(v: VentaConItems): TicketVenta {
  const items: TicketVenta['items'] = v.items.map((i) => ({
    nombre: i.nombre,
    detalle: i.variante ?? undefined,
    cantidad: i.cantidad,
    precio: formatMoney(i.precio, i.moneda),
    total: formatMoney(i.precio * i.cantidad, i.moneda),
  }))
  if (items.length === 0) {
    items.push({
      nombre: 'Venta sin detalle',
      cantidad: 1,
      precio: formatMoney(v.total, 'PYG'),
      total: formatMoney(v.total, 'PYG'),
    })
  }
  return {
    nombreLocal: nombreNegocio(),
    fecha: formatFecha(v.created_at),
    numeroVenta: numeroVenta(v.id),
    items,
    total: formatMoney(v.total, 'PYG'),
    metodosPago: '—',
  }
}

export default function VentasPage() {
  const config = useConfig()
  const { user } = useAuth()
  const vista = vistaStock(user)
  const [rows, setRows] = useState<VentaConItems[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fiadas, setFiadas] = useState<ReadonlySet<string>>(new Set())

  const [texto, setTexto] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cantidadMin, setCantidadMin] = useState('')

  const [resultado, setResultado] = useState<ResultadoImpresion | null>(null)
  const [reimprimiendo, setReimprimiendo] = useState(false)
  const ticketActual = useRef<TicketVenta | null>(null)

  const [aAnular, setAAnular] = useState<VentaConItems | null>(null)
  const [anulando, setAnulando] = useState(false)
  const [anularError, setAnularError] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<VentaConItems | null>(null)

  async function anular(venta: VentaConItems) {
    setAnulando(true)
    setAnularError(null)
    try {
      const { error } = await supabase.rpc('anular_venta', { p_venta_id: venta.id })
      if (error) throw new Error(error.message)
      setAAnular(null)
      await load()
    } catch (e) {
      setAnularError(
        e instanceof Error ? e.message : 'No se pudo anular la venta.',
      )
    } finally {
      setAnulando(false)
    }
  }

  const load = useCallback(async () => {
    setError(null)
    if (!isSupabaseConfigured) {
      setRows(getMockVentasDetalle())
      return
    }
    const { data: ventasRes, error } = await supabase
      .from('ventas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) {
      setError(error.message)
      setRows(null)
      return
    }
    const ventas = (ventasRes as VentaRow[]) ?? []
    const porVenta = await cargarItemsPorVenta(vista)

    const ids = ventas.map((v) => v.id)
    const pagosPorVenta = new Map<string, VentaPagoDetalle[]>()
    if (ids.length > 0) {
      const { data: pagosRes } = await supabase
        .from('venta_pagos')
        .select('venta_id, metodo, moneda, monto, detalle')
        .in('venta_id', ids)
        .order('created_at', { ascending: true })
      for (const p of (pagosRes ?? []) as Array<{
        venta_id: string
        metodo: VentaPagoDetalle['metodo']
        moneda: Moneda
        monto: number
        detalle: string | null
      }>) {
        const arr = pagosPorVenta.get(p.venta_id) ?? []
        arr.push({
          metodo: p.metodo,
          moneda: p.moneda,
          monto: p.monto,
          detalle: p.detalle,
        })
        pagosPorVenta.set(p.venta_id, arr)
      }
    }

    setRows(
      ventas.map((v) => ({
        ...v,
        items: porVenta.get(v.id) ?? [],
        pagos: pagosPorVenta.get(v.id) ?? [],
      })),
    )
    setFiadas(
      new Set(
        ventas
          .filter((v) =>
            (pagosPorVenta.get(v.id) ?? []).some((p) => p.metodo === 'fiado'),
          )
          .map((v) => v.id),
      ),
    )
  }, [vista])

  useEffect(() => {
    void load()
  }, [load])

  const filtradas = useMemo(() => {
    if (!rows) return null
    const t = texto.trim().toLowerCase()
    return rows.filter((v) => {
      if (desde && v.created_at.slice(0, 10) < desde) return false
      if (hasta && v.created_at.slice(0, 10) > hasta) return false
      const unidades = v.items.reduce((acc, i) => acc + i.cantidad, 0)
      if (cantidadMin && unidades < Number(cantidadMin)) return false
      if (!t) return true
      if (numeroVenta(v.id).toLowerCase().includes(t)) return true
      if (v.id.toLowerCase().includes(t)) return true
      return v.items.some(
        (i) =>
          busca(i.nombre, t) ||
          busca(i.codigo_barras, t) ||
          busca(i.sku, t) ||
          busca(i.variante, t),
      )
    })
  }, [rows, texto, desde, hasta, cantidadMin])

  function limpiarFiltros() {
    setTexto('')
    setDesde('')
    setHasta('')
    setCantidadMin('')
  }

  function pedirAnular(v: VentaConItems) {
    setDetalle(null)
    setAnularError(null)
    setAAnular(v)
  }

  function reimprimir(v: VentaConItems) {
    const ticket = getTicketVentaMock(v.id) ?? armarTicketDesdeVenta(v)
    ticketActual.current = ticket
    setResultado({ texto: armarTextoPlano(ticket), nativo: false, compartido: false })
  }

  async function imprimirActual() {
    const ticket = ticketActual.current
    if (!ticket) return
    setReimprimiendo(true)
    try {
      setResultado(await imprimirTicket(ticket))
    } finally {
      setReimprimiendo(false)
    }
  }

  async function imprimirActualPC() {
    const ticket = ticketActual.current
    if (!ticket) return
    setReimprimiendo(true)
    try {
      setResultado(await imprimirTicketPC(ticket, config.anchoTicketPc))
    } finally {
      setReimprimiendo(false)
    }
  }

  async function copiarActual() {
    const ticket = ticketActual.current
    if (!ticket) return
    await copiarTicket(armarTextoPlano(ticket))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            {rows ? `${rows.length} ventas` : 'Cargando…'}
          </p>
        </div>
        <NuevaVentaDialog onCreated={load} vista={vista} />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <FiltrosVentas
        texto={texto}
        setTexto={setTexto}
        desde={desde}
        setDesde={setDesde}
        hasta={hasta}
        setHasta={setHasta}
        cantidadMin={cantidadMin}
        setCantidadMin={setCantidadMin}
        onLimpiar={limpiarFiltros}
      />

      {filtradas !== null && filtradas.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-10 text-center">
          <Receipt className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No se encontró ninguna venta</p>
          <p className="text-sm text-muted-foreground">
            Ajustá los filtros o probá con otra búsqueda.
          </p>
        </div>
      )}

      {filtradas && filtradas.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Ítems</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Cobro</TableHead>
                <TableHead className="text-right">Reimprimir</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((venta) => {
                const unidades = venta.items.reduce(
                  (acc, i) => acc + i.cantidad,
                  0,
                )
                const resumen = venta.items[0]
                return (
                  <TableRow
                    key={venta.id}
                    onClick={() => setDetalle(venta)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-mono text-xs">
                      {numeroVenta(venta.id)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatFecha(venta.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="tabular-nums">
                        {venta.items.length} ítems · {unidades} unid.
                      </span>
                      {resumen && (
                        <span className="block max-w-44 truncate text-xs text-muted-foreground">
                          {resumen.nombre}
                          {resumen.variante ? ` (${resumen.variante})` : ''}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                      {formatMoney(venta.total, 'PYG')}
                    </TableCell>
                    <TableCell>{estadoBadge[venta.estado]}</TableCell>
                    <TableCell>
                      {fiadas.has(venta.id) ? (
                        <Badge className="border border-sky-400/40 bg-sky-50 text-sky-700">
                          Crédito / Fiado
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {venta.estado !== 'anulada' && isSupabaseConfigured && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            setAnularError(null)
                            setAAnular(venta)
                          }}
                        >
                          <Ban />
                          Anular
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          reimprimir(venta)
                        }}
                      >
                        <Printer />
                        Ticket
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={aAnular !== null}
        onOpenChange={(v) => {
          if (!v) setAAnular(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anular venta</DialogTitle>
            <DialogDescription>
              {aAnular ? (
                <>
                  Vas a anular la venta{' '}
                  <span className="font-mono">{numeroVenta(aAnular.id)}</span> de{' '}
                  {formatMoney(aAnular.total, 'PYG')}. Se devolverá el stock de
                  todos sus ítems y la venta quedará marcada como anulada.
                </>
              ) : (
                'Cargando…'
              )}
            </DialogDescription>
          </DialogHeader>

          {anularError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {anularError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAAnular(null)}
              disabled={anulando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={anulando || !aAnular}
              onClick={() => aAnular && void anular(aAnular)}
            >
              {anulando ? 'Anulando…' : 'Anular venta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VentaDetalleDialog
        venta={detalle}
        onOpenChange={(v) => {
          if (!v) setDetalle(null)
        }}
        onAnular={pedirAnular}
        onReimprimir={reimprimir}
      />

      <ResultadoImpresionDialog
        resultado={resultado}
        puedeImprimir
        reimprimiendo={reimprimiendo}
        onImprimirPC={() => void imprimirActualPC()}
        onImprimir={() => void imprimirActual()}
        onCopiar={() => void copiarActual()}
        onOpenChange={(v) => {
          if (!v) setResultado(null)
        }}
      />
    </div>
  )
}

function VentaDetalleDialog({
  venta,
  onOpenChange,
  onAnular,
  onReimprimir,
}: {
  venta: VentaConItems | null
  onOpenChange: (next: boolean) => void
  onAnular: (v: VentaConItems) => void
  onReimprimir: (v: VentaConItems) => void
}) {
  const unidades = venta
    ? venta.items.reduce((acc, i) => acc + i.cantidad, 0)
    : 0

  return (
    <Dialog open={venta !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-lg">
        {venta && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{numeroVenta(venta.id)}</span>
                {estadoBadge[venta.estado]}
              </DialogTitle>
              <DialogDescription>
                {formatFecha(venta.created_at)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-base font-semibold tabular-nums">
                  {formatMoney(venta.total, 'PYG')}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Ítems</p>
                <p className="text-base font-semibold tabular-nums">
                  {venta.items.length} · {unidades} unid.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {venta.items.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-sm text-muted-foreground"
                      >
                        Sin detalle de ítems.
                      </TableCell>
                    </TableRow>
                  )}
                  {venta.items.map((item, idx) => (
                    <TableRow key={`${item.nombre}-${item.variante}-${idx}`}>
                      <TableCell>
                        <span className="font-medium">{item.nombre}</span>
                        {item.variante && (
                          <span className="block text-xs text-muted-foreground">
                            {item.variante}
                          </span>
                        )}
                        {item.codigo_barras && (
                          <span className="block font-mono text-[11px] text-muted-foreground">
                            {item.codigo_barras}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.cantidad}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(item.precio, item.moneda)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(item.precio * item.cantidad, item.moneda)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Métodos de cobro</p>
              {venta.pagos.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  Sin desglose de cobro registrado.
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {venta.pagos.map((pago, idx) => (
                    <li
                      key={`${pago.metodo}-${idx}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span>
                        {metodoVentaLabel[pago.metodo]}
                        {pago.detalle && (
                          <span className="text-xs text-muted-foreground">
                            {' '}
                            · {pago.detalle}
                          </span>
                        )}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(pago.monto, pago.moneda)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {venta && venta.estado !== 'anulada' && isSupabaseConfigured && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              onClick={() => onAnular(venta)}
            >
              <Ban />
              Anular
            </Button>
          )}
          {venta && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onReimprimir(venta)}
            >
              <Printer />
              Reimprimir
            </Button>
          )}
          <Button type="button" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function busca(valor: string | null | undefined, texto: string): boolean {
  return valor?.toLowerCase().includes(texto) ?? false
}

async function cargarItemsPorVenta(
  vista: VistaStock,
): Promise<Map<string, VentaItemDetalle[]>> {
  const { data } = await supabase
    .from('venta_items')
    .select(
      `venta_id, cantidad, precio_unitario, stock:${vista}(sku, variante, moneda, producto:productos_maestro(nombre, codigo_barras))`,
    )
  const mapa = new Map<string, VentaItemDetalle[]>()
  for (const it of (data ?? []) as unknown as Array<{
    venta_id: string
    cantidad: number
    precio_unitario: number
    stock: {
      sku: string | null
      variante: string | null
      moneda: Moneda | null
      producto: { nombre: string | null; codigo_barras: string | null } | null
    } | null
  }>) {
    const detalle: VentaItemDetalle = {
      nombre: it.stock?.producto?.nombre ?? 'Producto',
      codigo_barras: it.stock?.producto?.codigo_barras ?? null,
      sku: it.stock?.sku ?? null,
      variante: it.stock?.variante ?? null,
      cantidad: it.cantidad,
      precio: it.precio_unitario,
      moneda: it.stock?.moneda ?? 'PYG',
    }
    const arr = mapa.get(it.venta_id) ?? []
    arr.push(detalle)
    mapa.set(it.venta_id, arr)
  }
  return mapa
}

function FiltrosVentas({
  texto,
  setTexto,
  desde,
  setDesde,
  hasta,
  setHasta,
  cantidadMin,
  setCantidadMin,
  onLimpiar,
}: {
  texto: string
  setTexto: (v: string) => void
  desde: string
  setDesde: (v: string) => void
  hasta: string
  setHasta: (v: string) => void
  cantidadMin: string
  setCantidadMin: (v: string) => void
  onLimpiar: () => void
}) {
  const hayFiltros =
    texto.trim() !== '' || desde !== '' || hasta !== '' || cantidadMin !== ''

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-52 space-y-1.5">
          <Label htmlFor="filter-texto">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="filter-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Nombre, código de barras, SKU, n° de ticket…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="w-40 space-y-1.5">
          <Label htmlFor="filter-desde">Desde</Label>
          <Input
            id="filter-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>

        <div className="w-40 space-y-1.5">
          <Label htmlFor="filter-hasta">Hasta</Label>
          <Input
            id="filter-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>

        <div className="w-40 space-y-1.5">
          <Label htmlFor="filter-cantidad">Cantidad mín. (unid.)</Label>
          <Input
            id="filter-cantidad"
            type="number"
            min={1}
            value={cantidadMin}
            onChange={(e) => setCantidadMin(e.target.value.replace(/\D/g, ''))}
            placeholder="Ej: 3"
          />
        </div>

        {hayFiltros && (
          <Button type="button" variant="ghost" onClick={onLimpiar}>
            Limpiar
          </Button>
        )}
      </div>
    </div>
  )
}

function NuevaVentaDialog({
  onCreated,
  vista,
}: {
  onCreated: () => void | Promise<void>
  vista: VistaStock
}) {
  const [open, setOpen] = useState(false)
  const [lineas, setLineas] = useState<StockRow[]>([])
  const [lineaId, setLineaId] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const linea = lineas.find((l) => l.id === lineaId)

  useEffect(() => {
    if (!open) return
    const cargar = async () => {
      if (!isSupabaseConfigured) {
        setLineas(getMockStock().filter((l) => l.cantidad > 0))
        const primero = getMockStock().find((l) => l.cantidad > 0)
        if (primero) setLineaId(primero.id)
        return
      }
      const { data, error } = await supabase
        .from(vista)
        .select('*, producto:productos_maestro(*)')
        .gt('cantidad', 0)
        .order('updated_at', { ascending: false })
        .limit(500)
      if (error) {
        setError(error.message)
        return
      }
      setLineas((data as StockRow[]) ?? [])
      const primero = (data as StockRow[])?.[0]
      if (primero) setLineaId(primero.id)
    }
    void cargar()
  }, [open, vista])

  const qty = Number(cantidad)
  const total = linea
    ? linea.precio * (Number.isFinite(qty) ? Math.max(0, qty) : 0)
    : 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!linea) return
    setError(null)
    setSubmitting(true)

    if (!Number.isInteger(qty) || qty <= 0 || qty > linea.cantidad) {
      setError(
        qty > linea.cantidad
          ? `Solo hay ${linea.cantidad} unidades disponibles.`
          : 'Ingresá una cantidad válida.',
      )
      setSubmitting(false)
      return
    }

    try {
      if (!isSupabaseConfigured) {
        registrarVentaMock(linea.id, qty)
        setOpen(false)
        await onCreated()
        return
      }

      const { error: errUpdate } = await supabase
        .from('stock_tienda')
        .update({ cantidad: linea.cantidad - qty })
        .eq('id', linea.id)

      if (errUpdate) throw errUpdate

      const { data: venta, error: errVenta } = await supabase
        .from('ventas')
        .insert({
          total,
          estado: 'confirmada',
          sucursal_id: linea.sucursal_id,
        })
        .select('id')
        .single()

      if (errVenta) throw errVenta

      const { error: errItem } = await supabase.from('venta_items').insert({
        venta_id: venta.id,
        stock_tienda_id: linea.id,
        cantidad: qty,
        precio_unitario: linea.precio,
      })

      if (errItem) throw errItem

      setOpen(false)
      await onCreated()
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Ocurrió un error al registrar la venta.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setLineaId('')
          setCantidad('1')
          setError(null)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nueva venta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva venta</DialogTitle>
          <DialogDescription>
            Elegí el producto y la cantidad. El stock se descuenta al confirmar.
          </DialogDescription>
        </DialogHeader>

        <form id="nueva-venta" onSubmit={handleSubmit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Producto</Label>
            <Select value={lineaId} onValueChange={setLineaId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí un producto" />
              </SelectTrigger>
              <SelectContent>
                {lineas.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.producto?.nombre}
                    {l.variante ? ` (${l.variante})` : ''} · {l.cantidad} en stock ·{' '}
                    {formatMoney(l.precio, l.moneda)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nv-cantidad">Cantidad</Label>
            <Input
              id="nv-cantidad"
              type="number"
              min={1}
              max={linea?.cantidad ?? 1}
              step={1}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">
              {linea ? formatMoney(total, linea.moneda) : '—'}
            </span>
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button type="submit" form="nueva-venta" disabled={submitting || !linea}>
            {submitting ? 'Registrando…' : 'Confirmar venta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}