import { useCallback, useEffect, useState, type FormEvent } from 'react'

import {
  ArrowRightLeft,
  History,
  PackagePlus,
  Plus,
  ScanBarcode,
  Search,
} from 'lucide-react'

import BarcodeScanner from '@/components/BarcodeScanner'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Database } from '@/lib/database'
import { guardarCacheStock, leerCacheStock } from '@/lib/cache'
import {
  estadoStock,
  formatFecha,
  formatMoney,
} from '@/lib/format'
import { ejecutarEscritura } from '@/lib/ejecutar'
import { esErrorDeRed } from '@/lib/red'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { esDueno, vistaStock, type VistaStock } from '@/lib/vistaStock'
import { useKeyboardScanner } from '@/lib/useKeyboardScanner'
import {
  SUCURSAL,
  crearProductoMock,
  getMockMovimientos,
  getMockStock,
  getMockSucursales,
  getSucursalNombre,
  reponerStockMock,
  transferirStockMock,
  type MovimientoStock,
  type Sucursal,
} from '@/lib/mock'
import {
  ProductoFormFields,
  productoFormInicial,
  type ProductoFormValues,
} from '@/components/ProductoFormFields'
import type { PayloadReponer } from '@/lib/escaneoRemoto'
import { cn } from 'cn'

type StockRow = Database['public']['Views']['stock_tienda_dueno']['Row'] & {
  producto: Database['public']['Tables']['productos_maestro']['Row'] | null
}

type EntradaProductoStock = {
  nombre: string
  codigo: string | null
  marca: string | null
  categoria: string | null
  variante: string | null
  sku: string | null
  precio: number
  costo: number | null
  moneda: 'PYG' | 'USD'
  cantidad: number
  sucursalId: string | null
  maestroId: string
  lineaId: string
}

function lineaStockLocal(entrada: EntradaProductoStock): StockRow {
  const ahora = new Date().toISOString()
  return {
    id: entrada.lineaId,
    tenant_id: '',
    sucursal_id: entrada.sucursalId,
    producto_id: entrada.maestroId,
    sku: entrada.sku,
    variante: entrada.variante,
    precio: entrada.precio,
    costo: entrada.costo,
    moneda: entrada.moneda,
    cantidad: entrada.cantidad,
    updated_at: ahora,
    producto: {
      id: entrada.maestroId,
      codigo_barras: entrada.codigo,
      nombre: entrada.nombre,
      marca: entrada.marca,
      categoria: entrada.categoria,
      foto_url: null,
      creado_por_tenant_id: null,
      created_at: ahora,
    },
  }
}

const estadoBadge = {
  ok: (
    <Badge variant="outline" className="text-muted-foreground">
      Ok
    </Badge>
  ),
  bajo: (
    <Badge className="border border-amber-400/40 bg-amber-50 text-amber-700">
      Stock bajo
    </Badge>
  ),
  agotado: (
    <Badge className="border border-destructive/30 bg-destructive/10 text-destructive">
      Agotado
    </Badge>
  ),
}

export default function StockPage() {
  const { user } = useAuth()
  const esDuenoActivo = esDueno(user)
  const vista = vistaStock(user)
  const [rows, setRows] = useState<StockRow[] | null>(null)
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sucursalId, setSucursalId] = useState(SUCURSAL)
  const [reponerOpen, setReponerOpen] = useState(false)
  const [moverOpen, setMoverOpen] = useState(false)
  const [histOpen, setHistOpen] = useState(false)

  useKeyboardScanner((code) => setQ(code))

  const loadSucursales = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSucursales(getMockSucursales())
      return
    }
    const { data, error } = await supabase
      .from('sucursales')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error && data) setSucursales(data as unknown as Sucursal[])
  }, [])

  useEffect(() => {
    void loadSucursales()
  }, [loadSucursales])

  useEffect(() => {
    if (sucursales.length > 0 && !sucursales.some((s) => s.id === sucursalId)) {
      setSucursalId(sucursales[0].id)
    }
  }, [sucursales, sucursalId])

  const sucursalNombre = useCallback(
    (id: string | null | undefined) =>
      sucursales.find((s) => s.id === id)?.nombre ?? getSucursalNombre(id),
    [sucursales],
  )

  const cacheKey = `${vista}:${sucursalId}`

  const aplicarAjusteLocal = useCallback(
    (lineaId: string, tipo: 'entrada' | 'salida', n: number) => {
      const delta = tipo === 'salida' ? -n : n
      setRows((prev) => {
        if (!prev) return prev
        const lista = prev.map((r) =>
          r.id === lineaId
            ? { ...r, cantidad: Math.max(0, r.cantidad + delta) }
            : r,
        )
        guardarCacheStock(cacheKey, lista)
        return lista
      })
    },
    [cacheKey],
  )

  const aplicarLineaNueva = useCallback(
    (fila: StockRow) => {
      setRows((prev) => {
        const lista = prev
          ? [fila, ...prev.filter((r) => r.id !== fila.id)]
          : [fila]
        guardarCacheStock(cacheKey, lista)
        return lista
      })
    },
    [cacheKey],
  )

  const load = useCallback(async () => {
    setError(null)
    if (!isSupabaseConfigured) {
      setRows(getMockStock().filter((r) => r.sucursal_id === sucursalId))
      setMovimientos(getMockMovimientos())
      return
    }
    const { data, error } = await supabase
      .from(vista)
      .select('*, producto:productos_maestro(*)')
      .eq('sucursal_id', sucursalId)
      .order('updated_at', { ascending: false })
      .limit(500)

    if (error) {
      if (esErrorDeRed(error)) {
        const cache = leerCacheStock<StockRow>(`${vista}:${sucursalId}`)
        setRows((prev) => prev ?? cache ?? [])
      } else {
        setError(error.message)
        setRows(null)
      }
    } else {
      const filas = (data as StockRow[] | null) ?? []
      setRows(filas)
      guardarCacheStock(`${vista}:${sucursalId}`, filas)
    }

    if (!esErrorDeRed(error)) {
      const { data: movs, error: errMov } = await supabase
        .from('stock_movimientos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      setMovimientos(
        errMov || !movs ? [] : (movs as unknown as MovimientoStock[]),
      )
    }
  }, [sucursalId, vista])

  useEffect(() => {
    void load()
  }, [load])

  const term = q.trim().toLowerCase()
  const filtered = rows?.filter((row) => {
    if (!term) return true
    const fields = [
      row.producto?.nombre,
      row.producto?.marca,
      row.producto?.codigo_barras,
      row.variante,
      row.sku,
    ]
    return fields.some((f) => f?.toLowerCase().includes(term))
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Stock</h1>
          <p className="text-sm text-muted-foreground">
            {rows
              ? `${rows.length} líneas en ${sucursalNombre(sucursalId)}`
              : 'Cargando…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BarcodeScanner
            onDetected={(code) => setQ(code)}
            trigger={
              <Button variant="outline">
                <ScanBarcode />
                Escanear
              </Button>
            }
          />
          <Button variant="outline" onClick={() => setReponerOpen(true)}>
            <PackagePlus />
            Reponer
          </Button>
          <Button variant="outline" onClick={() => setMoverOpen(true)}>
            <ArrowRightLeft />
            Mover
          </Button>
          <NuevoProductoDialog
            onCreated={load}
            sucursalId={sucursalId}
            onLineaNueva={aplicarLineaNueva}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {sucursales.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSucursalId(s.id)}
            className={cn(
              'h-9 rounded-lg border px-3 text-sm font-semibold transition-colors',
              sucursalId === s.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            {s.nombre}
          </button>
        ))}
      </div>

      <Input
        type="search"
        placeholder="Buscar por nombre, marca, código o variante…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-sm"
      />

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {filtered && filtered.length === 0 && (
        <EmptyState
          icon={<Search className="size-6" />}
          title="Sin resultados"
          description={
            rows && rows.length === 0
              ? `No hay stock en ${sucursalNombre(sucursalId)} todavía. Cargá tu primer producto con «Nuevo producto».`
              : 'Probá con otro término de búsqueda.'
          }
        />
      )}

      {filtered && filtered.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Variante</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Precio</TableHead>
                {esDuenoActivo && <TableHead>Costo</TableHead>}
                <TableHead>Actualizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const estado = estadoStock(row.cantidad)
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{row.producto?.nombre}</span>
                        <span className="text-xs text-muted-foreground">
                          {row.producto?.marca}
                          {row.producto?.codigo_barras
                            ? ` · ${row.producto.codigo_barras}`
                            : row.sku
                              ? ` · ${row.sku}`
                              : ''}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{row.variante ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            estado === 'agotado' && 'text-destructive',
                            estado === 'bajo' && 'text-amber-600',
                          )}
                        >
                          {row.cantidad}
                        </span>
                        {estadoBadge[estado]}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(row.precio, row.moneda)}
                    </TableCell>
                    {esDuenoActivo && (
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.costo != null
                          ? formatMoney(row.costo, row.moneda)
                          : '—'}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">
                      {formatFecha(row.updated_at)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {movimientos.length > 0 && (
        <div className="rounded-md border bg-card">
          <button
            type="button"
            onClick={() => setHistOpen((v) => !v)}
            className="flex w-full items-center gap-2 p-3 text-left text-sm font-semibold"
          >
            <History className="size-4 text-muted-foreground" />
            Últimos movimientos de stock
            <span className="ml-auto text-muted-foreground">
              {histOpen ? 'Ocultar' : 'Ver históricos'}
            </span>
          </button>
          {histOpen && (
            <ul className="max-h-80 divide-y overflow-auto border-t">
              {movimientos.slice(0, 25).map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-3 py-2">
                  <span
                    className={cn(
                      'mt-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
                      m.tipo === 'entrada' && 'border-emerald-400/40 bg-emerald-50 text-emerald-700',
                      m.tipo === 'salida' && 'border-amber-400/40 bg-amber-50 text-amber-700',
                      m.tipo === 'transferencia_destino' &&
                        'border-sky-400/40 bg-sky-50 text-sky-700',
                      m.tipo === 'transferencia_origen' &&
                        'border-violet-400/40 bg-violet-50 text-violet-700',
                    )}
                  >
                    {m.tipo === 'entrada'
                      ? 'Entrada'
                      : m.tipo === 'salida'
                        ? 'Salida'
                        : m.tipo === 'transferencia_destino'
                          ? 'Recibido'
                          : 'Enviado'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.producto_nombre}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {sucursalNombre(m.sucursal_id)}
                      {m.ref_sucursal_nombre
                        ? ` → ${m.ref_sucursal_nombre}`
                        : ''}
                      {m.motivo ? ` · ${m.motivo}` : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 font-semibold tabular-nums',
                      m.cantidad >= 0 ? 'text-emerald-600' : 'text-destructive',
                    )}
                  >
                    {m.cantidad >= 0 ? '+' : ''}
                    {m.cantidad}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFecha(m.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ReponerStockDialog
        open={reponerOpen}
        onOpenChange={setReponerOpen}
        sucursalId={sucursalId}
        vista={vista}
        aplicarAjusteLocal={aplicarAjusteLocal}
        onDone={load}
      />
      <TransferirStockDialog
        open={moverOpen}
        onOpenChange={setMoverOpen}
        origenSucursalId={sucursalId}
        sucursales={sucursales}
        lineasOrigen={rows ?? []}
        onDone={load}
      />
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-10 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function ReponerStockDialog({
  open,
  onOpenChange,
  sucursalId,
  vista,
  aplicarAjusteLocal,
  onDone,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  sucursalId: string
  vista: VistaStock
  aplicarAjusteLocal: (lineaId: string, tipo: 'entrada' | 'salida', n: number) => void
  onDone: () => void | Promise<void>
}) {
  const [codigo, setCodigo] = useState('')
  const [tipo, setTipo] = useState<PayloadReponer['tipo']>('entrada')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setCodigo('')
    setTipo('entrada')
    setCantidad('')
    setMotivo('')
    setError(null)
  }, [open])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const n = Math.floor(Number(cantidad))
    if (!codigo.trim() || !Number.isFinite(n) || n <= 0) {
      setError('Indicá un código y una cantidad mayor a cero.')
      setSubmitting(false)
      return
    }
    try {
      if (!isSupabaseConfigured) {
        const nombre = reponerStockMock(
          codigo.trim(),
          n,
          tipo,
          motivo.trim() || null,
        )
        if (!nombre) {
          throw new Error('Ese código no está en el stock de esta sucursal.')
        }
      } else {
        // Se busca el código contra el servidor (no contra la caché de 500
        // filas ya cargadas) para que funciones haya o no más de 500 líneas.
        const { data: maestros, error: errMaestros } = await supabase
          .from('productos_maestro')
          .select('id')
          .eq('codigo_barras', codigo.trim())
          .limit(1)
        if (errMaestros) throw errMaestros
        if (!maestros?.[0]) {
          throw new Error('Ese código no está en el stock de esta sucursal.')
        }
        const { data: filas, error: errLineas } = await supabase
          .from(vista)
          .select('*, producto:productos_maestro(*)')
          .eq('sucursal_id', sucursalId)
          .eq('producto_id', maestros[0].id)
          .limit(1)
        if (errLineas) throw errLineas
        const fila = (filas as StockRow[] | null)?.[0]
        if (!fila) {
          throw new Error('Ese código no está en el stock de esta sucursal.')
        }
        const movimientoId = crypto.randomUUID()
        const ahora = new Date().toISOString()
        await ejecutarEscritura({
          operacion: {
            tipo: 'ajuste',
            movimientoId,
            lineaId: fila.id,
            sucursalId,
            sentido: tipo,
            cantidad: n,
            motivo: motivo.trim() || null,
            productoNombre: fila.producto?.nombre ?? 'Producto',
            codigoBarras: fila.producto?.codigo_barras ?? null,
            sku: fila.sku,
            creadoEn: ahora,
          },
          ejecutarRemoto: async () => {
            const { error } = await supabase.rpc('registrar_ajuste', {
              p_movimiento_id: movimientoId,
              p_linea_id: fila.id,
              p_sucursal_id: sucursalId,
              p_tipo: tipo,
              p_cantidad: n,
              p_motivo: motivo.trim() || null,
              p_producto_nombre: fila.producto?.nombre ?? 'Producto',
              p_codigo_barras: fila.producto?.codigo_barras ?? null,
              p_sku: fila.sku,
              p_created_at: ahora,
            })
            if (error) throw error
          },
          aplicarLocal: () => aplicarAjusteLocal(fila.id, tipo, n),
        })
      }
      await onDone()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error al reponer.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reponer stock</DialogTitle>
          <DialogDescription>
            Sumá o descontá unidades a un producto existente. Cada ajuste queda
            registrado en el histórico con su motivo.
          </DialogDescription>
        </DialogHeader>

        <form id="reponer-stock" onSubmit={handleSubmit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rep-stock-codigo">Código de barras</Label>
            <div className="flex gap-2">
              <Input
                id="rep-stock-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Código del producto"
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
            <Label htmlFor="rep-stock-cantidad">
              Unidades a {tipo === 'entrada' ? 'sumar' : 'descontar'}
            </Label>
            <Input
              id="rep-stock-cantidad"
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
            <Label htmlFor="rep-stock-motivo">Motivo (opcional)</Label>
            <Input
              id="rep-stock-motivo"
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="reponer-stock" disabled={submitting}>
            {submitting ? 'Aplicando…' : 'Aplicar ajuste'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransferirStockDialog({
  open,
  onOpenChange,
  origenSucursalId,
  sucursales,
  lineasOrigen,
  onDone,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  origenSucursalId: string
  sucursales: Sucursal[]
  lineasOrigen: StockRow[]
  onDone: () => void | Promise<void>
}) {
  const [destinoId, setDestinoId] = useState('')
  const [lineaId, setLineaId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const destinos = sucursales.filter((s) => s.id !== origenSucursalId)
  const sucursalNombre = (id: string | null | undefined) =>
    sucursales.find((s) => s.id === id)?.nombre ?? getSucursalNombre(id)

  useEffect(() => {
    if (!open) return
    const primerDestino =
      sucursales.find((s) => s.id !== origenSucursalId)?.id ?? ''
    setDestinoId(primerDestino)
    setLineaId('')
    setCantidad('')
    setMotivo('')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const lineaOrigen = lineasOrigen.find((l) => l.id === lineaId)
  const disponible = lineaOrigen?.cantidad ?? 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const n = Math.floor(Number(cantidad))
    if (!destinoId || !lineaId || !Number.isFinite(n) || n <= 0) {
      setError('Elegí producto, destino y una cantidad mayor a cero.')
      setSubmitting(false)
      return
    }
    try {
      if (!isSupabaseConfigured) {
        const res = transferirStockMock(
          origenSucursalId,
          destinoId,
          lineaId,
          n,
          motivo.trim() || null,
        )
        if (!res.ok) throw new Error(res.error ?? 'No se pudo mover el stock.')
      } else {
        const { data: origen, error: errOrigen } = await supabase
          .from('stock_tienda')
          .select('*, producto:productos_maestro(*)')
          .eq('id', lineaId)
          .eq('sucursal_id', origenSucursalId)
          .single()
        if (errOrigen) throw errOrigen
        if (n > origen.cantidad) {
          throw new Error(`Solo hay ${origen.cantidad} unidades en origen.`)
        }

        const { data: dest, error: errDestSel } = await supabase
          .from('stock_tienda')
          .select('*')
          .eq('sucursal_id', destinoId)
          .eq('producto_id', origen.producto_id)
          .eq('sku', origen.sku ?? '')
          .eq('variante', origen.variante ?? '')
          .maybeSingle()
        if (errDestSel) throw errDestSel

        const { error: errOrigenUpd } = await supabase
          .from('stock_tienda')
          .update({ cantidad: origen.cantidad - n })
          .eq('id', origen.id)
        if (errOrigenUpd) throw errOrigenUpd

        if (dest) {
          const { error: errDestUpd } = await supabase
            .from('stock_tienda')
            .update({ cantidad: dest.cantidad + n })
            .eq('id', dest.id)
          if (errDestUpd) throw errDestUpd
        } else {
          const { error: errDestIns } = await supabase
            .from('stock_tienda')
            .insert({
              producto_id: origen.producto_id,
              sucursal_id: destinoId,
              sku: origen.sku,
              variante: origen.variante,
              precio: origen.precio,
              costo: origen.costo,
              moneda: origen.moneda as 'PYG' | 'USD',
              cantidad: n,
            })
          if (errDestIns) throw errDestIns
        }

        const nombre = origen.producto?.nombre ?? 'Producto'
        const { error: errMov1 } = await supabase
          .from('stock_movimientos')
          .insert({
            sucursal_id: origenSucursalId,
            linea_id: origen.id,
            producto_nombre: nombre,
            codigo_barras: origen.producto?.codigo_barras ?? null,
            sku: origen.sku,
            tipo: 'transferencia_origen',
            cantidad: -n,
            motivo: motivo.trim() || null,
            ref_sucursal_id: destinoId,
            ref_sucursal_nombre: sucursalNombre(destinoId),
          })
        if (errMov1) throw errMov1
        const { error: errMov2 } = await supabase
          .from('stock_movimientos')
          .insert({
            sucursal_id: destinoId,
            linea_id: dest?.id ?? null,
            producto_nombre: nombre,
            codigo_barras: origen.producto?.codigo_barras ?? null,
            sku: origen.sku,
            tipo: 'transferencia_destino',
            cantidad: n,
            motivo: motivo.trim() || null,
            ref_sucursal_id: origenSucursalId,
            ref_sucursal_nombre: sucursalNombre(origenSucursalId),
          })
        if (errMov2) throw errMov2
      }
      await onDone()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ocurrió un error al mover.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mover stock</DialogTitle>
          <DialogDescription>
            Transferí unidades de esta sucursal a otra. Se registra el
            movimiento en ambas.
          </DialogDescription>
        </DialogHeader>

        <form id="transferir-stock" onSubmit={handleSubmit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="mov-linea">Producto a mover</Label>
            <select
              id="mov-linea"
              value={lineaId}
              onChange={(e) => setLineaId(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Elegí un producto…</option>
              {lineasOrigen.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.producto?.nombre ?? l.sku ?? 'Producto'} · {l.cantidad} uds
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Disponible en origen: {disponible} unidades.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-destino">Hacia la sucursal</Label>
            <select
              id="mov-destino"
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              {destinos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-cantidad">Unidades a mover</Label>
            <Input
              id="mov-cantidad"
              type="number"
              min={1}
              step={1}
              max={disponible || undefined}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder={`Máx. ${disponible}`}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mov-motivo">Motivo (opcional)</Label>
            <Input
              id="mov-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. reponer vidriera del local 2"
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="transferir-stock" disabled={submitting}>
            {submitting ? 'Moviendo…' : 'Mover unidades'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const formInicial: ProductoFormValues = productoFormInicial

function NuevoProductoDialog({
  onCreated,
  sucursalId,
  onLineaNueva,
}: {
  onCreated: () => void | Promise<void>
  sucursalId: string
  onLineaNueva: (fila: StockRow) => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<ProductoFormValues>(formInicial)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set<K extends keyof ProductoFormValues>(key: K, value: ProductoFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function reset() {
    setForm(formInicial)
    setError(null)
  }

  async function handleCodigoEscaneado(code: string) {
    set('codigo_barras', code)
    try {
      if (!isSupabaseConfigured) {
        const encontrado = getMockStock().find(
          (r) => r.producto?.codigo_barras === code,
        )?.producto
        if (encontrado) {
          if (!form.nombre.trim()) set('nombre', encontrado.nombre)
          if (!form.marca.trim() && encontrado.marca) set('marca', encontrado.marca)
        }
        return
      }

      const { data } = await supabase
        .from('productos_maestro')
        .select('nombre, marca')
        .eq('codigo_barras', code)
        .maybeSingle()

      if (data) {
        if (!form.nombre.trim()) set('nombre', data.nombre)
        if (!form.marca.trim() && data.marca) set('marca', data.marca)
      }
    } catch {
      // Si falla la búsqueda, igual queda el código cargado.
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const nombre = form.nombre.trim()
    const precio = Number(form.precio)
    const cantidad = Number(form.cantidad)

    if (!nombre || !Number.isFinite(precio) || precio < 0) {
      setError('Falta el nombre o el precio no es válido.')
      setSubmitting(false)
      return
    }

    try {
      if (!isSupabaseConfigured) {
        crearProductoMock({
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
          sucursal_id: sucursalId,
        })
        reset()
        setOpen(false)
        await onCreated()
        return
      }

      const codigoBarras = form.codigo_barras.trim() || null
      const moneda = form.moneda === 'USD' ? 'USD' : 'PYG'
      const cantidadNum = Number.isFinite(cantidad)
        ? Math.max(0, Math.floor(cantidad))
        : 0
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
          marca: form.marca.trim() || null,
          categoria: form.categoria.trim() || null,
          sucursalId,
          sku: form.sku.trim() || null,
          variante: form.variante.trim() || null,
          precio,
          costo: form.costo ? Number(form.costo) : null,
          moneda,
          cantidad: cantidadNum,
          creadoEn: ahora,
        },
        ejecutarRemoto: async () => {
          const { data, error } = await supabase.rpc('registrar_producto', {
            p_maestro_id: maestroId,
            p_codigo: codigoBarras,
            p_nombre: nombre,
            p_marca: form.marca.trim() || null,
            p_categoria: form.categoria.trim() || null,
            p_linea_id: lineaId,
            p_sucursal_id: sucursalId,
            p_sku: form.sku.trim() || null,
            p_variante: form.variante.trim() || null,
            p_precio: precio,
            p_costo: form.costo ? Number(form.costo) : null,
            p_moneda: moneda,
            p_cantidad: cantidadNum,
            p_created_at: ahora,
          })
          if (error) throw error
          return { lineaId: data as string }
        },
        aplicarLocal: () => {
          onLineaNueva(
            lineaStockLocal({
              nombre,
              codigo: codigoBarras,
              marca: form.marca.trim() || null,
              categoria: form.categoria.trim() || null,
              variante: form.variante.trim() || null,
              sku: form.sku.trim() || null,
              precio,
              costo: form.costo ? Number(form.costo) : null,
              moneda,
              cantidad: cantidadNum,
              sucursalId,
              maestroId,
              lineaId,
            }),
          )
        },
      })

      reset()
      setOpen(false)
      await onCreated()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ocurrió un error al cargar el producto.'
      setError(msg.includes('unique')
        ? 'Ese producto + variante ya existe en tu stock.'
        : msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Nuevo producto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo producto</DialogTitle>
          <DialogDescription>
            Si es un artículo nuevo, se agrega al catálogo compartido.
          </DialogDescription>
        </DialogHeader>

        <form id="nuevo-producto" onSubmit={handleSubmit}>
          <ProductoFormFields
            form={form}
            set={set}
            onCodigoEscaneado={handleCodigoEscaneado}
          />

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
          <Button type="submit" form="nuevo-producto" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar producto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}