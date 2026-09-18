import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { CalendarClock, HandCoins, Pencil, Plus, Trash2, Users } from 'lucide-react'

import MoneyInput from '@/components/MoneyInput'
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
  actualizarCliente,
  crearCliente,
  crearDeuda,
  eliminarCliente,
  eliminarCobro,
  eliminarDeuda,
  listarCobros,
  listarClientes,
  listarDeudas,
  registrarCobro,
} from '@/lib/clientesData'
import { monedasActivas } from '@/lib/config'
import { aGs, obtenerCotizaciones, tasasBase, type Tasas } from '@/lib/cotizaciones'
import { formatMoney, type Moneda } from '@/lib/format'
import type { Cliente, Cobro, Deuda } from '@/lib/mock'

type EstadoDialog =
  | { modo: 'crear' }
  | { modo: 'editar'; cliente: Cliente }
  | null

type FormCliente = {
  nombre: string
  tipo: 'fisica' | 'juridica'
  ruc: string
  cedula: string
  telefono: string
  email: string
  direccion: string
  ciudad: string
  notas: string
}

const METODOS_COBRO: Array<{
  valor: Cobro['metodo']
  etiqueta: string
}> = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'pos', etiqueta: 'POS Bancard' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
]

function formDesde(c: Cliente): FormCliente {
  return {
    nombre: c.nombre,
    tipo: c.tipo,
    ruc: c.ruc ?? '',
    cedula: c.cedula ?? '',
    telefono: c.telefono ?? '',
    email: c.email ?? '',
    direccion: c.direccion ?? '',
    ciudad: c.ciudad ?? '',
    notas: c.notas ?? '',
  }
}

function formVacio(): FormCliente {
  return {
    nombre: '',
    tipo: 'fisica',
    ruc: '',
    cedula: '',
    telefono: '',
    email: '',
    direccion: '',
    ciudad: '',
    notas: '',
  }
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDia(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

function saldoPendienteGs(
  clienteId: string,
  deudas: Deuda[],
  cobros: Cobro[],
  tasas: Tasas,
): number {
  const dado = deudas
    .filter((d) => d.cliente_id === clienteId)
    .reduce((acc, d) => acc + aGs(d.monto, d.moneda, tasas), 0)
  const pagado = cobros
    .filter((c) => c.cliente_id === clienteId)
    .reduce((acc, c) => acc + aGs(c.monto, c.moneda, tasas), 0)
  return Math.max(0, dado - pagado)
}

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[] | null>(null)
  const [deudas, setDeudas] = useState<Deuda[]>([])
  const [cobros, setCobros] = useState<Cobro[]>([])
  const [tasas, setTasas] = useState<Tasas>(() => tasasBase())
  const monedas = monedasActivas()

  const [dialog, setDialog] = useState<EstadoDialog>(null)
  const [aEliminar, setAEliminar] = useState<Cliente | null>(null)
  const [form, setForm] = useState<FormCliente>(formVacio)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [deudaDialogCliente, setDeudaDialogCliente] = useState<Cliente | null>(null)
  const [cobroDialogCliente, setCobroDialogCliente] = useState<Cliente | null>(null)
  const [aEliminarDeudaId, setAEliminarDeudaId] = useState<string | null>(null)
  const [aEliminarCobroId, setAEliminarCobroId] = useState<string | null>(null)

  const [deudaForm, setDeudaForm] = useState({
    fecha: hoy(),
    vencimiento: '',
    monto: '',
    moneda: 'PYG' as Moneda,
  })
  const [cobroForm, setCobroForm] = useState({
    fecha: hoy(),
    concepto: '',
    monto: '',
    moneda: 'PYG' as Moneda,
    metodo: 'efectivo' as Cobro['metodo'],
  })

  const recargar = useCallback(async () => {
    try {
      const [lista, deudaList, cobroList] = await Promise.all([
        listarClientes(),
        listarDeudas(),
        listarCobros(),
      ])
      setClientes(lista)
      setDeudas(deudaList)
      setCobros(cobroList)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes.')
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
    setForm({
      nombre: '',
      tipo: 'fisica',
      ruc: '',
      cedula: '',
      telefono: '',
      email: '',
      direccion: '',
      ciudad: '',
      notas: '',
    })
    setDialog({ modo: 'crear' })
  }

  function abrirEditar(c: Cliente) {
    setError(null)
    setForm(formDesde(c))
    setDialog({ modo: 'editar', cliente: c })
  }

  async function handleSubmitCliente(event: FormEvent) {
    event.preventDefault()
    if (!form.nombre.trim()) {
      setError('Ingresá el nombre del cliente.')
      return
    }
    setError(null)
    setOcupado(true)
    try {
      const entrada = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        ruc: form.ruc.trim() || undefined,
        cedula: form.cedula.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        email: form.email.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        ciudad: form.ciudad.trim() || undefined,
        notas: form.notas.trim() || undefined,
      }
      if (dialog?.modo === 'editar') {
        await actualizarCliente(dialog.cliente.id, entrada)
        setAviso('Cliente actualizado.')
      } else {
        await crearCliente(entrada)
        setAviso('Cliente creado.')
      }
      setDialog(null)
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el cliente.')
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarEliminar() {
    if (!aEliminar) return
    setError(null)
    setOcupado(true)
    try {
      await eliminarCliente(aEliminar.id)
      setAviso('Cliente eliminado.')
      setAEliminar(null)
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el cliente.')
    } finally {
      setOcupado(false)
    }
  }

  function abrirDeuda(c: Cliente) {
    setDeudaForm({ fecha: hoy(), vencimiento: '', monto: '', moneda: 'PYG' })
    setDeudaDialogCliente(c)
    setCuentaId(null)
  }

  async function handleCrearDeuda(event: FormEvent) {
    event.preventDefault()
    const cliente = deudaDialogCliente
    const monto = Number(deudaForm.monto)
    if (!cliente || !Number.isFinite(monto) || monto <= 0) {
      setError('Ingresá un monto válido.')
      return
    }
    setError(null)
    setOcupado(true)
    try {
      await crearDeuda({
        cliente_id: cliente.id,
        fecha: deudaForm.fecha || hoy(),
        vencimiento: deudaForm.vencimiento || null,
        monto,
        moneda: deudaForm.moneda,
      })
      setAviso('Crédito registrado.')
      setDeudaDialogCliente(null)
      await recargar()
      setCuentaId(cliente.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el crédito.')
    } finally {
      setOcupado(false)
    }
  }

  function abrirCobro(c: Cliente) {
    setCobroForm({
      fecha: hoy(),
      concepto: '',
      monto: '',
      moneda: 'PYG',
      metodo: 'efectivo',
    })
    setCobroDialogCliente(c)
    setCuentaId(null)
  }

  async function handleCrearCobro(event: FormEvent) {
    event.preventDefault()
    const cliente = cobroDialogCliente
    const monto = Number(cobroForm.monto)
    if (!cliente || !Number.isFinite(monto) || monto <= 0) {
      setError('Ingresá un monto válido.')
      return
    }
    setError(null)
    setOcupado(true)
    try {
      await registrarCobro({
        cliente_id: cliente.id,
        fecha: cobroForm.fecha || hoy(),
        concepto: cobroForm.concepto || undefined,
        monto,
        moneda: cobroForm.moneda,
        metodo: cobroForm.metodo,
      })
      setAviso('Cobro registrado.')
      setCobroDialogCliente(null)
      await recargar()
      setCuentaId(cliente.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el cobro.')
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarEliminarDeuda() {
    if (!aEliminarDeudaId) return
    setError(null)
    try {
      await eliminarDeuda(aEliminarDeudaId)
      setAEliminarDeudaId(null)
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el crédito.')
    }
  }

  async function confirmarEliminarCobro() {
    if (!aEliminarCobroId) return
    setError(null)
    try {
      await eliminarCobro(aEliminarCobroId)
      setAEliminarCobroId(null)
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el cobro.')
    }
  }

  const lista = clientes ?? []
  const activos = lista.filter((c) => c.activo).length
  const deudaTotalGs = lista.reduce(
    (acc, c) => acc + saldoPendienteGs(c.id, deudas, cobros, tasas),
    0,
  )
  const cuenta = cuentaId
    ? lista.find((c) => c.id === cuentaId) ?? null
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Quiénes te compran y cuánto te deben (cuentas por cobrar).
          </p>
        </div>
        <Button onClick={abrirCrear}>
          <Plus />
          Nuevo cliente
        </Button>
      </div>

      {aviso && (
        <p className="rounded-md border border-emerald-300/50 bg-emerald-50 p-3 text-sm text-emerald-700">
          {aviso}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Badge variant="secondary"> {lista.length} clientes</Badge>
        <Badge variant="outline"> {activos} activos</Badge>
        <Badge variant="outline"> Deuda total: {formatMoney(deudaTotalGs, 'PYG')}</Badge>
      </div>

      {clientes === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center">
          <Users className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Todavía no tenés clientes</p>
          <p className="text-sm text-muted-foreground">
            Agregá tu primer cliente con el botón de arriba.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => {
            const pendiente = saldoPendienteGs(c.id, deudas, cobros, tasas)
            return (
              <div key={c.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase">
                      {c.nombre.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.nombre}</p>
                      <div className="flex items-center gap-1.5">
                        {c.tipo === 'juridica' ? (
                          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Jurídica
                          </span>
                        ) : (
                          <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Física
                          </span>
                        )}
                        {c.ciudad && (
                          <span className="text-xs text-muted-foreground">
                            {c.ciudad}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => abrirEditar(c)}
                      aria-label={`Editar ${c.nombre}`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setAEliminar(c)}
                      aria-label={`Eliminar ${c.nombre}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {c.ruc && (
                    <p>
                      <span className="font-medium">RUC:</span> {c.ruc}
                    </p>
                  )}
                  {c.telefono && (
                    <p>
                      <span className="font-medium">Tel:</span> {c.telefono}
                    </p>
                  )}
                  {c.email && (
                    <p>
                      <span className="font-medium">Email:</span> {c.email}
                    </p>
                  )}
                  {!c.ruc && !c.telefono && !c.email && (
                    <p className="italic">Sin datos de contacto.</p>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-muted-foreground">
                    Deuda (Gs)
                  </span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      pendiente > 0 ? 'text-amber-600' : ''
                    }`}
                  >
                    {formatMoney(pendiente, 'PYG')}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => {
                    setError(null)
                    setCuentaId(c.id)
                  }}
                >
                  <HandCoins />
                  Cuenta y cobros
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {/* Alta / edición de cliente */}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      >
        <DialogContent className="max-h-[88svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog?.modo === 'editar' ? 'Editar cliente' : 'Nuevo cliente'}
            </DialogTitle>
            <DialogDescription>
              Ficha del cliente. RUC y cédula son opcionales.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitCliente} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="cli-nombre">Nombre *</Label>
              <Input
                id="cli-nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="María González"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cli-tipo">Tipo de persona</Label>
              <Select
                value={form.tipo}
                onValueChange={(v) =>
                  setForm({ ...form, tipo: v as FormCliente['tipo'] })
                }
              >
                <SelectTrigger id="cli-tipo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fisica">Persona física</SelectItem>
                  <SelectItem value="juridica">Persona jurídica (empresa)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cli-ruc">RUC</Label>
                <Input
                  id="cli-ruc"
                  value={form.ruc}
                  onChange={(e) => setForm({ ...form, ruc: e.target.value })}
                  placeholder="80012345-6"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cli-cedula">Cédula</Label>
                <Input
                  id="cli-cedula"
                  value={form.cedula}
                  onChange={(e) => setForm({ ...form, cedula: e.target.value })}
                  placeholder="1234567"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cli-tel">Teléfono</Label>
                <Input
                  id="cli-tel"
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  placeholder="(0985) 555-010"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cli-email">Email</Label>
                <Input
                  id="cli-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="vos@tutienda.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cli-dir">Dirección</Label>
                <Input
                  id="cli-dir"
                  value={form.direccion}
                  onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  placeholder="Av. San Blas 321"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cli-ciudad">Ciudad / Barrio</Label>
                <Input
                  id="cli-ciudad"
                  value={form.ciudad}
                  onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                  placeholder="Ciudad del Este"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cli-notas">Notas</Label>
              <Input
                id="cli-notas"
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Límite de crédito, condiciones…"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={ocupado}>
                {dialog?.modo === 'editar' ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación de cliente */}
      <Dialog
        open={aEliminar !== null}
        onOpenChange={(open) => {
          if (!open) setAEliminar(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar cliente?</DialogTitle>
            <DialogDescription>
              Se borrarán el cliente y todas sus deudas y cobros. Esta acción no
              se puede deshacer.
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

      {/* Cuenta del cliente: deudas + cobros */}
      <Dialog
        open={cuenta !== null}
        onOpenChange={(open) => {
          if (!open) setCuentaId(null)
        }}
      >
        <DialogContent className="max-h-[88svh] overflow-y-auto sm:max-w-lg">
          {cuenta && (
            <>
              <DialogHeader>
                <DialogTitle>{cuenta.nombre}</DialogTitle>
                <DialogDescription>
                  {[cuenta.tipo === 'juridica' ? 'Jurídica' : 'Física', cuenta.ruc && `RUC ${cuenta.ruc}`, cuenta.ciudad]
                    .filter(Boolean)
                    .join(' · ')}{' '}
                  — Saldo pendiente:{' '}
                  <span className="font-medium text-foreground">
                    {formatMoney(
                      saldoPendienteGs(cuenta.id, deudas, cobros, tasas),
                      'PYG',
                    )}
                  </span>
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => abrirCobro(cuenta)}
                >
                  <HandCoins />
                  Registrar cobro
                </Button>
                <Button variant="outline" size="sm" onClick={() => abrirDeuda(cuenta)}>
                  <CalendarClock />
                  Nuevo crédito
                </Button>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Deudas (créditos dados)</p>
                {deudas.filter((d) => d.cliente_id === cuenta.id).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sin créditos registrados.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {deudas
                      .filter((d) => d.cliente_id === cuenta.id)
                      .map((d) => {
                        const vencida =
                          d.vencimiento && d.vencimiento < hoy()
                        return (
                          <div
                            key={d.id}
                            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                {formatMoney(d.monto, d.moneda)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDia(d.fecha)} · vence{' '}
                                {d.vencimiento
                                  ? formatDia(d.vencimiento)
                                  : 'sin fecha'}
                                {vencida && (
                                  <span className="ml-1 rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-medium text-destructive">
                                    vencida
                                  </span>
                                )}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setAEliminarDeudaId(d.id)}
                              aria-label="Eliminar crédito"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Cobros recibidos</p>
                {cobros.filter((c) => c.cliente_id === cuenta.id).length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sin cobros registrados.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {cobros
                      .filter((c) => c.cliente_id === cuenta.id)
                      .map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {formatMoney(c.monto, c.moneda)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDia(c.fecha)}
                              {c.concepto ? ` · ${c.concepto}` : ''}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setAEliminarCobroId(c.id)}
                            aria-label="Eliminar cobro"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Nuevo crédito (deuda) */}
      <Dialog
        open={deudaDialogCliente !== null}
        onOpenChange={(open) => {
          if (!open) setDeudaDialogCliente(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo crédito</DialogTitle>
            <DialogDescription>
              Registrá un crédito/venta a plazo para{' '}
              <span className="font-medium text-foreground">
                {deudaDialogCliente?.nombre}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCrearDeuda} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="deuda-monto">Monto *</Label>
              <MoneyInput
                id="deuda-monto"
                value={deudaForm.monto}
                onChange={(v) => setDeudaForm({ ...deudaForm, monto: v })}
                placeholder="350000"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deuda-moneda">Moneda</Label>
              <Select
                value={deudaForm.moneda}
                onValueChange={(v) =>
                  setDeudaForm({ ...deudaForm, moneda: v as Moneda })
                }
              >
                <SelectTrigger id="deuda-moneda" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monedas.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="deuda-fecha">Fecha</Label>
                <Input
                  id="deuda-fecha"
                  type="date"
                  value={deudaForm.fecha}
                  onChange={(e) => setDeudaForm({ ...deudaForm, fecha: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="deuda-vencimiento">Vence (opcional)</Label>
                <Input
                  id="deuda-vencimiento"
                  type="date"
                  value={deudaForm.vencimiento}
                  onChange={(e) =>
                    setDeudaForm({ ...deudaForm, vencimiento: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeudaDialogCliente(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={ocupado}>
                Registrar crédito
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Registrar cobro */}
      <Dialog
        open={cobroDialogCliente !== null}
        onOpenChange={(open) => {
          if (!open) setCobroDialogCliente(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar cobro</DialogTitle>
            <DialogDescription>
              Anotá un pago recibido de{' '}
              <span className="font-medium text-foreground">
                {cobroDialogCliente?.nombre}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCrearCobro} className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="cobro-monto">Monto *</Label>
              <MoneyInput
                id="cobro-monto"
                value={cobroForm.monto}
                onChange={(v) => setCobroForm({ ...cobroForm, monto: v })}
                placeholder="100000"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cobro-moneda">Moneda</Label>
                <Select
                  value={cobroForm.moneda}
                  onValueChange={(v) =>
                    setCobroForm({ ...cobroForm, moneda: v as Moneda })
                  }
                >
                  <SelectTrigger id="cobro-moneda" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monedas.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cobro-metodo">Método</Label>
                <Select
                  value={cobroForm.metodo}
                  onValueChange={(v) =>
                    setCobroForm({ ...cobroForm, metodo: v as Cobro['metodo'] })
                  }
                >
                  <SelectTrigger id="cobro-metodo" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METODOS_COBRO.map((m) => (
                      <SelectItem key={m.valor} value={m.valor}>
                        {m.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cobro-fecha">Fecha</Label>
              <Input
                id="cobro-fecha"
                type="date"
                value={cobroForm.fecha}
                onChange={(e) => setCobroForm({ ...cobroForm, fecha: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cobro-concepto">Concepto (opcional)</Label>
              <Input
                id="cobro-concepto"
                value={cobroForm.concepto}
                onChange={(e) =>
                  setCobroForm({ ...cobroForm, concepto: e.target.value })
                }
                placeholder="Pago a cuenta…"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCobroDialogCliente(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={ocupado}>
                Registrar cobro
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación de deuda */}
      <Dialog
        open={aEliminarDeudaId !== null}
        onOpenChange={(open) => {
          if (!open) setAEliminarDeudaId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar crédito?</DialogTitle>
            <DialogDescription>
              El crédito se quita de la cuenta del cliente. Esta acción no se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAEliminarDeudaId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarEliminarDeuda}>
              <Trash2 />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación de cobro */}
      <Dialog
        open={aEliminarCobroId !== null}
        onOpenChange={(open) => {
          if (!open) setAEliminarCobroId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar cobro?</DialogTitle>
            <DialogDescription>
              El cobro se quita de la cuenta del cliente. Esta acción no se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAEliminarCobroId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarEliminarCobro}>
              <Trash2 />
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}