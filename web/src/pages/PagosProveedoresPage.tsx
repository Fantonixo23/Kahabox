import { useState, type FormEvent } from 'react'

import { HandCoins, Plus, Trash2, WalletCards } from 'lucide-react'

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { aGs, tasasBase } from '@/lib/cotizaciones'
import { MONEDAS, formatMoney, type Moneda } from '@/lib/format'
import {
  eliminarPagoProveedorMock,
  getMockPagosProveedores,
  getMockProveedores,
  registrarPagoProveedorMock,
  type PagoProveedorConProveedor,
} from '@/lib/mock'

const METODOS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

type Form = {
  proveedor_id: string
  fecha: string
  concepto: string
  monto: string
  moneda: Moneda
  metodo: 'efectivo' | 'tarjeta' | 'transferencia'
}

export default function PagosProveedoresPage() {
  const [pagos, setPagos] = useState<PagoProveedorConProveedor[]>(() =>
    getMockPagosProveedores(),
  )
  const [proveedores, setProveedores] = useState(() => getMockProveedores())
  const [filtro, setFiltro] = useState<string>('todos')
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<Form>({
    proveedor_id: '',
    fecha: hoy(),
    concepto: '',
    monto: '',
    moneda: 'PYG',
    metodo: 'efectivo',
  })
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function recargar() {
    setPagos(getMockPagosProveedores())
    setProveedores(getMockProveedores())
  }

  function abrirDialogo() {
    setError(null)
    setForm({
      proveedor_id: proveedores[0]?.id ?? '',
      fecha: hoy(),
      concepto: '',
      monto: '',
      moneda: 'PYG',
      metodo: 'efectivo',
    })
    setAbierto(true)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const proveedor_id = form.proveedor_id
    const monto = Number(form.monto)
    if (!proveedor_id) {
      setError('Elegí un proveedor.')
      return
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      setError('Ingresá un monto válido mayor a cero.')
      return
    }
    registrarPagoProveedorMock({
      proveedor_id,
      fecha: form.fecha || hoy(),
      concepto: form.concepto || undefined,
      monto,
      moneda: form.moneda,
      metodo: form.metodo,
    })
    setAbierto(false)
    setAviso('Pago registrado.')
    recargar()
  }

  const visibles = pagos.filter(
    (p) => filtro === 'todos' || p.proveedor_id === filtro,
  )

  const totalGs = visibles.reduce(
    (acc, p) => acc + aGs(p.monto, p.moneda, tasasBase()),
    0,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Pagos a proveedores</h1>
          <p className="text-sm text-muted-foreground">
            Los egresos que hiciste a tus proveedores.
          </p>
        </div>
        <Button onClick={abrirDialogo} disabled={proveedores.length === 0}>
          <Plus />
          Registrar pago
        </Button>
      </div>

      {aviso && (
        <p className="rounded-md border border-emerald-300/50 bg-emerald-50 p-3 text-sm text-emerald-700">
          {aviso}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-56 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los proveedores</SelectItem>
            {proveedores.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="secondary" className="tabular-nums">
          Total: {formatMoney(totalGs, 'PYG')}
        </Badge>
      </div>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center">
          <WalletCards className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Sin pagos registrados</p>
          <p className="text-sm text-muted-foreground">
            Registrá tu primer pago a un proveedor.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums">{p.fecha}</TableCell>
                  <TableCell className="font-medium">
                    {p.proveedor?.nombre ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.concepto ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMoney(p.monto, p.moneda)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{METODOS[p.metodo]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        eliminarPagoProveedorMock(p.id)
                        setAviso('Pago eliminado.')
                        recargar()
                      }}
                      aria-label={`Eliminar pago de ${p.proveedor?.nombre ?? 'proveedor'}`}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="size-4" />
              Registrar pago
            </DialogTitle>
            <DialogDescription>
              Un egreso hecho a un proveedor, en la moneda en la que pagaste.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="pp-proveedor">Proveedor *</Label>
              <Select
                value={form.proveedor_id}
                onValueChange={(v) => setForm({ ...form, proveedor_id: v })}
              >
                <SelectTrigger id="pp-proveedor" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pp-fecha">Fecha</Label>
              <Input
                id="pp-fecha"
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pp-concepto">Concepto</Label>
              <Input
                id="pp-concepto"
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                placeholder="Reposición de mercadería"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pp-monto">Monto *</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pp-monto"
                  inputMode="decimal"
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  placeholder="0"
                  className="flex-1"
                />
                <Select
                  value={form.moneda}
                  onValueChange={(m) => setForm({ ...form, moneda: m as Moneda })}
                >
                  <SelectTrigger className="w-[5.5rem]">
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

            <div className="grid gap-2">
              <Label htmlFor="pp-metodo">Método de pago</Label>
              <Select
                value={form.metodo}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    metodo: v as 'efectivo' | 'tarjeta' | 'transferencia',
                  })
                }
              >
                <SelectTrigger id="pp-metodo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAbierto(false)}
              >
                Cancelar
              </Button>
              <Button type="submit">Registrar pago</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}