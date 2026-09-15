import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { Search, Plus, ScanBarcode } from 'lucide-react'

import BarcodeScanner from '@/components/BarcodeScanner'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Database } from '@/lib/database'
import {
  estadoStock,
  formatFecha,
  formatMoney,
} from '@/lib/format'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { useKeyboardScanner } from '@/lib/useKeyboardScanner'
import { getMockStock, crearProductoMock } from '@/lib/mock'
import {
  ProductoFormFields,
  productoFormInicial,
  type ProductoFormValues,
} from '@/components/ProductoFormFields'
import { cn } from 'cn'

type StockRow = Database['public']['Views']['stock_tienda_dueno']['Row'] & {
  producto: Database['public']['Tables']['productos_maestro']['Row'] | null
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
  const [rows, setRows] = useState<StockRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  useKeyboardScanner((code) => setQ(code))

  const load = useCallback(async () => {
    setError(null)
    if (!isSupabaseConfigured) {
      setRows(getMockStock())
      return
    }
    const { data, error } = await supabase
      .from('stock_tienda_dueno')
      .select('*, producto:productos_maestro(*)')
      .order('updated_at', { ascending: false })
      .limit(500)

    if (error) {
      setError(error.message)
      setRows(null)
    } else {
      setRows((data as StockRow[]) ?? [])
    }
  }, [])

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
            {rows ? `${rows.length} líneas de stock` : 'Cargando…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BarcodeScanner
            onDetected={(code) => setQ(code)}
            trigger={
              <Button variant="outline">
                <ScanBarcode />
                Escanear
              </Button>
            }
          />
          <NuevoProductoDialog onCreated={load} />
        </div>
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

      {isSupabaseConfigured && rows !== null && rows.length === 0 && (
        <EmptyState
          icon={<Search className="size-6" />}
          title="Todavía no hay stock"
          description="Cargá tu primer producto con «Nuevo producto»."
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
                <TableHead>Costo</TableHead>
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
                    <TableCell className="tabular-nums text-muted-foreground">
                      {row.costo != null
                        ? formatMoney(row.costo, row.moneda)
                        : '—'}
                    </TableCell>
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

const formInicial: ProductoFormValues = productoFormInicial

function NuevoProductoDialog({
  onCreated,
}: {
  onCreated: () => void | Promise<void>
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
        })
        reset()
        setOpen(false)
        await onCreated()
        return
      }

      let productoId: string | null = null
      const codigoBarras = form.codigo_barras.trim() || null

      if (codigoBarras) {
        const { data: existente } = await supabase
          .from('productos_maestro')
          .select('id')
          .eq('codigo_barras', codigoBarras)
          .maybeSingle()
        if (existente) productoId = existente.id
      }

      if (!productoId) {
        const { data: creado, error: errMaestro } = await supabase
          .from('productos_maestro')
          .insert({
            nombre,
            codigo_barras: codigoBarras,
            marca: form.marca.trim() || null,
            categoria: form.categoria.trim() || null,
          })
          .select('id')
          .single()
        if (errMaestro) throw errMaestro
        productoId = creado.id
      }

      const { error: errStock } = await supabase.from('stock_tienda').insert({
        producto_id: productoId,
        variante: form.variante.trim() || null,
        sku: form.sku.trim() || null,
        precio,
        costo: form.costo ? Number(form.costo) : null,
        moneda: form.moneda === 'USD' ? 'USD' : 'PYG',
        cantidad: Number.isFinite(cantidad) ? Math.max(0, Math.floor(cantidad)) : 0,
      })

      if (errStock) throw errStock

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