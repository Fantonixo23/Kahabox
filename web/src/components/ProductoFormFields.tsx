import BarcodeScanner from '@/components/BarcodeScanner'
import MoneyInput from '@/components/MoneyInput'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MONEDAS, type Moneda } from '@/lib/format'
import { useConfig } from '@/lib/config'

export type ProductoFormValues = {
  nombre: string
  codigo_barras: string
  marca: string
  categoria: string
  variante: string
  sku: string
  precio: string
  costo: string
  moneda: Moneda
  cantidad: string
}

export const productoFormInicial: ProductoFormValues = {
  nombre: '',
  codigo_barras: '',
  marca: '',
  categoria: '',
  variante: '',
  sku: '',
  precio: '',
  costo: '',
  moneda: 'PYG',
  cantidad: '0',
}

export function ProductoFormFields({
  form,
  set,
  onCodigoEscaneado,
  mostrarCosto = true,
}: {
  form: ProductoFormValues
  set: <K extends keyof ProductoFormValues>(
    key: K,
    value: ProductoFormValues[K],
  ) => void
  onCodigoEscaneado?: (codigo: string) => void
  mostrarCosto?: boolean
}) {
  const { monedasActivas } = useConfig()
  const activas =
    monedasActivas.length > 0 ? monedasActivas : MONEDAS.map((m) => m.codigo)
  return (
    <div className="grid gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="pf-nombre">Nombre *</Label>
        <Input
          id="pf-nombre"
          value={form.nombre}
          onChange={(e) => set('nombre', e.target.value)}
          placeholder="Auriculares Bluetooth"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-codigo">Código de barras</Label>
          <div className="flex gap-2">
            <Input
              id="pf-codigo"
              value={form.codigo_barras}
              onChange={(e) => set('codigo_barras', e.target.value)}
              placeholder="Escanear o tipear"
              className="flex-1"
            />
            {onCodigoEscaneado && <BarcodeScanner onDetected={onCodigoEscaneado} />}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-marca">Marca</Label>
          <Input
            id="pf-marca"
            value={form.marca}
            onChange={(e) => set('marca', e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-variante">Variante</Label>
          <Input
            id="pf-variante"
            value={form.variante}
            onChange={(e) => set('variante', e.target.value)}
            placeholder="Color / talle / capacidad"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-sku">SKU</Label>
          <Input
            id="pf-sku"
            value={form.sku}
            onChange={(e) => set('sku', e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pf-categoria">Categoría</Label>
        <Input
          id="pf-categoria"
          value={form.categoria}
          onChange={(e) => set('categoria', e.target.value)}
          placeholder="electrónica, indumentaria, perfumería…"
        />
      </div>

      <div
        className={
          mostrarCosto ? 'grid grid-cols-2 gap-3' : 'space-y-1.5'
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="pf-precio">Precio *</Label>
          <MoneyInput
            id="pf-precio"
            value={form.precio}
            onChange={(v) => set('precio', v)}
            placeholder="0"
            required
          />
        </div>
        {mostrarCosto && (
          <div className="space-y-1.5">
            <Label htmlFor="pf-costo">Costo</Label>
            <MoneyInput
              id="pf-costo"
              value={form.costo}
              onChange={(v) => set('costo', v)}
              placeholder="0"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-cantidad">Cantidad</Label>
          <Input
            id="pf-cantidad"
            type="number"
            min={0}
            step={1}
            value={form.cantidad}
            onChange={(e) => set('cantidad', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Moneda</Label>
          <Select value={form.moneda} onValueChange={(m) => set('moneda', m as Moneda)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONEDAS.filter((m) => activas.includes(m.codigo)).map((m) => (
                <SelectItem key={m.codigo} value={m.codigo}>
                  {m.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}