import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { Pencil, Plus, Trash2, Truck } from 'lucide-react'

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
  aGs,
  obtenerCotizaciones,
  tasasBase,
  type Tasas,
} from '@/lib/cotizaciones'
import { formatMoney } from '@/lib/format'
import type { PagoProveedorConProveedor, Proveedor } from '@/lib/mock'
import {
  actualizarProveedor,
  crearProveedor,
  eliminarProveedor,
  listarPagos,
  listarProveedores,
} from '@/lib/proveedoresData'

type EstadoDialog =
  | { modo: 'crear' }
  | { modo: 'editar'; proveedor: Proveedor }
  | null

type Form = {
  nombre: string
  ruc: string
  telefono: string
  email: string
  direccion: string
}

function totalPagado(
  proveedorId: string,
  pagos: PagoProveedorConProveedor[],
  tasas: Tasas,
): number {
  return pagos
    .filter((p) => p.proveedor_id === proveedorId)
    .reduce((acc, p) => acc + aGs(p.monto, p.moneda, tasas), 0)
}

function formDesde(p: Proveedor): Form {
  return {
    nombre: p.nombre,
    ruc: p.ruc ?? '',
    telefono: p.telefono ?? '',
    email: p.email ?? '',
    direccion: p.direccion ?? '',
  }
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[] | null>(null)
  const [pagos, setPagos] = useState<PagoProveedorConProveedor[]>([])
  const [tasas, setTasas] = useState<Tasas>(() => tasasBase())
  const [dialog, setDialog] = useState<EstadoDialog>(null)
  const [aEliminar, setAEliminar] = useState<Proveedor | null>(null)
  const [form, setForm] = useState<Form>({
    nombre: '',
    ruc: '',
    telefono: '',
    email: '',
    direccion: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const recargar = useCallback(async () => {
    try {
      const [lista, listaPagos] = await Promise.all([
        listarProveedores(),
        listarPagos(),
      ])
      setProveedores(lista)
      setPagos(listaPagos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los proveedores.')
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar])

  useEffect(() => {
    let activo = true
    void obtenerCotizaciones().then((c) => {
      if (activo) setTasas(c)
    })
    return () => {
      activo = false
    }
  }, [])

  function abrirCrear() {
    setError(null)
    setForm({ nombre: '', ruc: '', telefono: '', email: '', direccion: '' })
    setDialog({ modo: 'crear' })
  }

  function abrirEditar(p: Proveedor) {
    setError(null)
    setForm(formDesde(p))
    setDialog({ modo: 'editar', proveedor: p })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.nombre.trim()) {
      setError('Ingresá el nombre del proveedor.')
      return
    }
    setError(null)
    setOcupado(true)
    try {
      if (dialog?.modo === 'editar') {
        await actualizarProveedor(dialog.proveedor.id, {
          nombre: form.nombre.trim(),
          ruc: form.ruc.trim() || undefined,
          telefono: form.telefono.trim() || undefined,
          email: form.email.trim() || undefined,
          direccion: form.direccion.trim() || undefined,
        })
        setAviso('Proveedor actualizado.')
      } else {
        await crearProveedor({
          nombre: form.nombre.trim(),
          ruc: form.ruc.trim() || undefined,
          telefono: form.telefono.trim() || undefined,
          email: form.email.trim() || undefined,
          direccion: form.direccion.trim() || undefined,
        })
        setAviso('Proveedor creado.')
      }
      setDialog(null)
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el proveedor.')
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarEliminar() {
    if (!aEliminar) return
    setError(null)
    setOcupado(true)
    try {
      await eliminarProveedor(aEliminar.id)
      setAviso('Proveedor eliminado.')
      setAEliminar(null)
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el proveedor.')
    } finally {
      setOcupado(false)
    }
  }

  const lista = proveedores ?? []
  const activos = lista.filter((p) => p.activo).length

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Proveedores</h1>
          <p className="text-sm text-muted-foreground">
            Quiénes te venden y cuánto les pagaste.
          </p>
        </div>
        <Button onClick={abrirCrear}>
          <Plus />
          Nuevo proveedor
        </Button>
      </div>

      {aviso && (
        <p className="rounded-md border border-emerald-300/50 bg-emerald-50 p-3 text-sm text-emerald-700">
          {aviso}
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Badge variant="secondary"> {lista.length} proveedores</Badge>
        <Badge variant="outline"> {activos} activos</Badge>
      </div>

      {proveedores === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center">
          <Truck className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Todavía no tenés proveedores</p>
          <p className="text-sm text-muted-foreground">
            Agregá tu primer proveedor con el botón de arriba.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((p) => (
            <div key={p.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase">
                    {p.nombre.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{p.nombre}</p>
                    {p.ruc && (
                      <p className="text-xs text-muted-foreground">RUC {p.ruc}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => abrirEditar(p)}
                    aria-label={`Editar ${p.nombre}`}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setAEliminar(p)}
                    aria-label={`Eliminar ${p.nombre}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {p.telefono && (
                  <p>
                    <span className="font-medium">Tel:</span> {p.telefono}
                  </p>
                )}
                {p.email && (
                  <p>
                    <span className="font-medium">Email:</span> {p.email}
                  </p>
                )}
                {p.direccion && (
                  <p>
                    <span className="font-medium">Dirección:</span> {p.direccion}
                  </p>
                )}
                {!p.telefono && !p.email && !p.direccion && (
                  <p className="italic">Sin datos de contacto.</p>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">
                  Pagado (Gs)
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {formatMoney(totalPagado(p.id, pagos, tasas), 'PYG')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.modo === 'editar' ? 'Editar proveedor' : 'Nuevo proveedor'}
            </DialogTitle>
            <DialogDescription>
              Datos básicos del proveedor. El RUC es opcional.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="prov-nombre">Nombre *</Label>
              <Input
                id="prov-nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Distribuidora Central SRL"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prov-ruc">RUC</Label>
              <Input
                id="prov-ruc"
                value={form.ruc}
                onChange={(e) => setForm({ ...form, ruc: e.target.value })}
                placeholder="80012345-6"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prov-tel">Teléfono</Label>
              <Input
                id="prov-tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                placeholder="(021) 450-123"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prov-email">Email</Label>
              <Input
                id="prov-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ventas@central.com.py"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="prov-dir">Dirección</Label>
              <Input
                id="prov-dir"
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                placeholder="Av. Mariscal López 2890"
              />
            </div>
            <DialogFooter>
              <DialogCancel onCancel={() => setDialog(null)} />
              <Button type="submit" disabled={ocupado}>
                {dialog?.modo === 'editar' ? 'Guardar cambios' : 'Crear proveedor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={aEliminar !== null}
        onOpenChange={(open) => {
          if (!open) setAEliminar(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar proveedor?</DialogTitle>
            <DialogDescription>
              Se borrarán el proveedor y todos sus pagos registrados. Esta
              acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAEliminar(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarEliminar} disabled={ocupado}>
              <Trash2 />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DialogCancel({ onCancel }: { onCancel: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onCancel}>
      Cancelar
    </Button>
  )
}