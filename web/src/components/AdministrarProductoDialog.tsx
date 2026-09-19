import { useEffect, useState, type FormEvent } from 'react'

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
import MoneyInput from '@/components/MoneyInput'
import { useAuth } from '@/components/auth/AuthContext'
import { ejecutarEscritura } from '@/lib/ejecutar'
import { MONEDAS, type Moneda } from '@/lib/format'
import { actualizarProductoMock, reponerStockMock } from '@/lib/mock'
import { esErrorDeRed } from '@/lib/red'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { dispositivoActual } from '@/lib/auditoriaData'
import type { StockRemotoRow } from '@/lib/stockRemoto'
import { useConfig } from '@/lib/config'
import { cn } from 'cn'

type AdminForm = {
  nombre: string
  marca: string
  categoria: string
  variante: string
  sku: string
  precio: string
  costo: string
  moneda: Moneda
  ajusteTipo: 'entrada' | 'salida'
  ajusteCantidad: string
  ajusteMotivo: string
}

const formVacio: AdminForm = {
  nombre: '',
  marca: '',
  categoria: '',
  variante: '',
  sku: '',
  precio: '',
  costo: '',
  moneda: 'PYG',
  ajusteTipo: 'entrada',
  ajusteCantidad: '',
  ajusteMotivo: '',
}

function formDeLinea(linea: StockRemotoRow): AdminForm {
  return {
    nombre: linea.producto?.nombre ?? '',
    marca: linea.producto?.marca ?? '',
    categoria: linea.producto?.categoria ?? '',
    variante: linea.variante ?? '',
    sku: linea.sku ?? '',
    precio: String(linea.precio ?? ''),
    costo: linea.costo != null ? String(linea.costo) : '',
    moneda: linea.moneda === 'USD' ? 'USD' : 'PYG',
    ajusteTipo: 'entrada',
    ajusteCantidad: '',
    ajusteMotivo: '',
  }
}

/**
 * Ventana para administrar un producto ya existente en el stock (datos + ajuste
 * de cantidad). Se abre al escanear un código que ya está en el catálogo, tanto
 * en la PC (app/stock) como en el celular (modo stock).
 *
 * El nombre/marca/categoría viven en el catálogo compartido: solo se habilitan
 * si el producto lo creó esta tienda (o no tiene creador). Precio, costo, SKU,
 * variante y moneda son propios de la tienda y siempre se editan.
 */
export default function AdministrarProductoDialog({
  open,
  onOpenChange,
  linea,
  onDone,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  linea: StockRemotoRow | null
  onDone: () => void | Promise<void>
}) {
  const { user } = useAuth()
  const { monedasActivas } = useConfig()
  const tenantId =
    typeof user?.app_metadata?.tenant_id === 'string'
      ? user.app_metadata.tenant_id
      : null
  const creador = linea?.producto?.creado_por_tenant_id ?? null
  const catalogoEditable = creador === null || creador === tenantId

  const [form, setForm] = useState<AdminForm>(formVacio)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !linea) return
    setForm(formDeLinea(linea))
    setError(null)
    setSubmitting(false)
  }, [open, linea])

  function set<K extends keyof AdminForm>(key: K, value: AdminForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const monedas =
    monedasActivas.length > 0 ? monedasActivas : MONEDAS.map((m) => m.codigo)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!linea) return
    setError(null)

    const nombre = form.nombre.trim()
    const precio = Number(form.precio)
    if (!nombre || !Number.isFinite(precio) || precio < 0) {
      setError('Falta el nombre o el precio no es válido.')
      return
    }

    const ajusteCantidad = Math.floor(Number(form.ajusteCantidad))
    const hayAjuste = Number.isFinite(ajusteCantidad) && ajusteCantidad > 0
    const codigoBarras = linea.producto?.codigo_barras ?? null
    const sku = form.sku.trim() || null

    setSubmitting(true)
    try {
      if (!isSupabaseConfigured) {
        if (
          !actualizarProductoMock(linea.id, {
            nombre,
            marca: form.marca.trim() || null,
            categoria: form.categoria.trim() || null,
            sku,
            variante: form.variante.trim() || null,
            precio,
            costo: form.costo ? Number(form.costo) : null,
            moneda: form.moneda,
          })
        ) {
          throw new Error('No se encontró la línea de stock.')
        }
        if (hayAjuste) {
          const res = reponerStockMock(
            codigoBarras ?? '',
            ajusteCantidad,
            form.ajusteTipo,
            form.ajusteMotivo.trim() || null,
          )
          if (!res) throw new Error('No se pudo aplicar el ajuste de stock.')
        }
      } else {
        // Edición de datos: online (sin cola; si no hay red, error).
        const { error: errActualizar } = await supabase.rpc(
          'actualizar_producto',
          {
            p_linea_id: linea.id,
            p_nombre: nombre,
            p_marca: form.marca.trim() || null,
            p_categoria: form.categoria.trim() || null,
            p_sku: sku,
            p_variante: form.variante.trim() || null,
            p_precio: precio,
            p_costo: form.costo ? Number(form.costo) : null,
            p_moneda: form.moneda === 'USD' ? 'USD' : 'PYG',
            p_dispositivo: dispositivoActual(),
          },
        )
        if (errActualizar) {
          if (esErrorDeRed(errActualizar)) {
            throw new Error('Sin conexión: la edición necesita internet.')
          }
          throw errActualizar
        }

        if (hayAjuste) {
          const movimientoId = crypto.randomUUID()
          const ahora = new Date().toISOString()
          await ejecutarEscritura({
            operacion: {
              tipo: 'ajuste',
              movimientoId,
              lineaId: linea.id,
              sucursalId: linea.sucursal_id,
              sentido: form.ajusteTipo,
              cantidad: ajusteCantidad,
              motivo: form.ajusteMotivo.trim() || null,
              productoNombre: nombre,
              codigoBarras,
              sku,
              creadoEn: ahora,
            },
            ejecutarRemoto: async () => {
              const { error: errAjuste } = await supabase.rpc('registrar_ajuste', {
                p_movimiento_id: movimientoId,
                p_linea_id: linea.id,
                p_sucursal_id: linea.sucursal_id,
                p_tipo: form.ajusteTipo,
                p_cantidad: ajusteCantidad,
                p_motivo: form.ajusteMotivo.trim() || null,
                p_producto_nombre: nombre,
                p_codigo_barras: codigoBarras,
                p_sku: sku,
                p_created_at: ahora,
                p_dispositivo: dispositivoActual(),
              })
              if (errAjuste) throw errAjuste
              return { movimientoId }
            },
          })
        }
      }

      await onDone()
      onOpenChange(false)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo guardar el producto.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Administrar producto</DialogTitle>
          <DialogDescription>
            {linea?.producto?.codigo_barras
              ? `Código ${linea.producto.codigo_barras}. `
              : ''}
            Editá los datos y/o ajustá las unidades en stock.
          </DialogDescription>
        </DialogHeader>

        <form id="administrar-producto" onSubmit={handleSubmit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ap-nombre">Nombre *</Label>
            <Input
              id="ap-nombre"
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              disabled={!catalogoEditable}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ap-marca">Marca</Label>
              <Input
                id="ap-marca"
                value={form.marca}
                onChange={(e) => set('marca', e.target.value)}
                disabled={!catalogoEditable}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-categoria">Categoría</Label>
              <Input
                id="ap-categoria"
                value={form.categoria}
                onChange={(e) => set('categoria', e.target.value)}
                disabled={!catalogoEditable}
              />
            </div>
          </div>

          {!catalogoEditable && (
            <p className="rounded-md border border-amber-300/50 bg-amber-50 p-2 text-xs text-amber-700">
              Este producto ya existe en el catálogo compartido y lo cargó otra
              tienda: solo podés editar precio, costo, variante, SKU y stock.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ap-variante">Variante</Label>
              <Input
                id="ap-variante"
                value={form.variante}
                onChange={(e) => set('variante', e.target.value)}
                placeholder="Color / talle / capacidad"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-sku">SKU</Label>
              <Input
                id="ap-sku"
                value={form.sku}
                onChange={(e) => set('sku', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ap-precio">Precio *</Label>
              <MoneyInput
                id="ap-precio"
                value={form.precio}
                onChange={(v) => set('precio', v)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-costo">Costo</Label>
              <MoneyInput
                id="ap-costo"
                value={form.costo}
                onChange={(v) => set('costo', v)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Select
              value={form.moneda}
              onValueChange={(m) => set('moneda', m as Moneda)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONEDAS.filter(
                  (m) =>
                    monedas.includes(m.codigo) &&
                    (m.codigo === 'PYG' || m.codigo === 'USD'),
                ).map((m) => (
                  <SelectItem key={m.codigo} value={m.codigo}>
                    {m.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-1 space-y-3 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-semibold">
              Stock actual:{' '}
              <span className="tabular-nums">{linea?.cantidad ?? 0}</span>
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set('ajusteTipo', 'entrada')}
                className={cn(
                  'h-10 rounded-lg border text-sm font-semibold',
                  form.ajusteTipo === 'entrada'
                    ? 'border-emerald-400/60 bg-emerald-50 text-emerald-700'
                    : 'bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                Entrada (+)
              </button>
              <button
                type="button"
                onClick={() => set('ajusteTipo', 'salida')}
                className={cn(
                  'h-10 rounded-lg border text-sm font-semibold',
                  form.ajusteTipo === 'salida'
                    ? 'border-amber-400/60 bg-amber-50 text-amber-700'
                    : 'bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                Salida (−)
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ap-ajuste">
                Unidades a {form.ajusteTipo === 'entrada' ? 'sumar' : 'descontar'}{' '}
                (opcional)
              </Label>
              <Input
                id="ap-ajuste"
                type="number"
                min={1}
                step={1}
                value={form.ajusteCantidad}
                onChange={(e) => set('ajusteCantidad', e.target.value)}
                placeholder="Ej. 10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ap-motivo">Motivo (opcional)</Label>
              <Input
                id="ap-motivo"
                value={form.ajusteMotivo}
                onChange={(e) => set('ajusteMotivo', e.target.value)}
                placeholder="Ej. compra a proveedor / merma"
              />
            </div>
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
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="administrar-producto"
            disabled={submitting}
          >
            {submitting ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
