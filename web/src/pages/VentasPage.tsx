import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { Plus, Receipt } from 'lucide-react'

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
import type { Database } from '@/lib/database'
import { formatFecha, formatMoney } from '@/lib/format'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { getMockStock, getMockVentas, registrarVentaMock } from '@/lib/mock'

type VentaRow = Database['public']['Tables']['ventas']['Row']
type StockRow = Database['public']['Views']['stock_tienda_dueno']['Row'] & {
  producto: Database['public']['Tables']['productos_maestro']['Row'] | null
}

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

export default function VentasPage() {
  const [rows, setRows] = useState<VentaRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    if (!isSupabaseConfigured) {
      setRows(getMockVentas())
      return
    }
    const { data, error } = await supabase
      .from('ventas')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      setError(error.message)
      setRows(null)
    } else {
      setRows((data as VentaRow[]) ?? [])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            {rows ? `${rows.length} ventas` : 'Cargando…'}
          </p>
        </div>
        <NuevaVentaDialog onCreated={load} />
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {isSupabaseConfigured && rows !== null && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-10 text-center">
          <Receipt className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Todavía no hay ventas</p>
          <p className="text-sm text-muted-foreground">
            Registrá tu primera venta con «Nueva venta».
          </p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((venta) => (
                <TableRow key={venta.id}>
                  <TableCell>{formatFecha(venta.created_at)}</TableCell>
                  <TableCell>{estadoBadge[venta.estado]}</TableCell>
                  <TableCell className="font-semibold tabular-nums">
                    {venta.total.toLocaleString('es-PY')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function NuevaVentaDialog({ onCreated }: { onCreated: () => void | Promise<void> }) {
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
        .from('stock_tienda_dueno')
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
  }, [open])

  const qty = Number(cantidad)
  const total = linea ? linea.precio * (Number.isFinite(qty) ? Math.max(0, qty) : 0) : 0

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

      // Fase 0 / piloto: decremento directo sobre la tabla base.
      // En Fase 2 la Edge Function `confirmar_venta` hace el `UPDATE` atómico
      // (`where cantidad >= :n`, rechazo si rowCount = 0) para resistir
      // la carrera entre dos tablets. Este bloque es provisional.
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
      setError(e instanceof Error ? e.message : 'Ocurrió un error al registrar la venta.')
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