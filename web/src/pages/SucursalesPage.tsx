import { useEffect, useState, type FormEvent } from 'react'

import { MapPin, Phone, Pencil, Plus, Store, Trash2 } from 'lucide-react'

import { useAuth } from '@/components/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { ETIQUETA_ROL } from '@/lib/config'
import {
  actualizarSucursal,
  contarLineasPorSucursal,
  crearSucursal,
  eliminarSucursal,
  listarSucursales,
  useSucursalActual,
  type ConteoLineas,
  type DatosSucursal,
} from '@/lib/sucursal'
import { listarMiembros, type MiembroDetalle } from '@/lib/equipoData'
import { useLimitesPlan } from '@/lib/plan'
import type { Sucursal } from '@/lib/mock'

type ValoresForm = {
  nombre: string
  direccion: string
  telefono: string
}

export default function SucursalesPage() {
  const { user } = useAuth()
  const { sucursalId: sucursalGlobal, cambiarSucursal } = useSucursalActual(user)
  const limites = useLimitesPlan()
  const maximoSucursales = limites?.sucursales ?? 3

  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [lineas, setLineas] = useState<ConteoLineas>({})
  const [integrantes, setIntegrantes] = useState<MiembroDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Sucursal | null>(null)
  const [valores, setValores] = useState<ValoresForm>({
    nombre: '',
    direccion: '',
    telefono: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const [confirmarCambio, setConfirmarCambio] = useState<Sucursal | null>(null)
  const [cambiando, setCambiando] = useState(false)

  const [confirmarBorrar, setConfirmarBorrar] = useState<Sucursal | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const [lista, conteo, equipo] = await Promise.all([
        listarSucursales(),
        contarLineasPorSucursal(),
        listarMiembros(),
      ])
      setSucursales(lista)
      setLineas(conteo)
      setIntegrantes(equipo)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar las sucursales.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function abrirNueva() {
    setValores({ nombre: '', direccion: '', telefono: '' })
    setEditando(null)
    setErrorForm(null)
    setFormOpen(true)
  }

  function abrirEdicion(s: Sucursal) {
    setValores({
      nombre: s.nombre,
      direccion: s.direccion ?? '',
      telefono: s.telefono ?? '',
    })
    setEditando(s)
    setErrorForm(null)
    setFormOpen(true)
  }

  async function guardarForm(event: FormEvent) {
    event.preventDefault()
    const nombre = valores.nombre.trim()
    if (!nombre) {
      setErrorForm('Ingresá el nombre de la sucursal.')
      return
    }
    setGuardando(true)
    setErrorForm(null)
    const datos: DatosSucursal = {
      nombre,
      direccion: valores.direccion.trim(),
      telefono: valores.telefono.trim(),
    }
    try {
      if (editando) {
        await actualizarSucursal(editando.id, datos)
      } else {
        await crearSucursal(datos)
      }
      setFormOpen(false)
      setAviso(editando ? 'Sucursal actualizada.' : 'Sucursal creada.')
      void load()
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : 'No se pudo guardar la sucursal.')
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarCambioDeSucursal() {
    if (!confirmarCambio) return
    setCambiando(true)
    setError(null)
    try {
      cambiarSucursal(confirmarCambio.id)
      setAviso(
        `Cambiaste a ${confirmarCambio.nombre}. Ahora todo el sistema muestra esa sucursal.`,
      )
      setConfirmarCambio(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar de sucursal.')
    } finally {
      setCambiando(false)
    }
  }

  async function borrar() {
    if (!confirmarBorrar) return
    setBorrando(true)
    setErrorBorrar(null)
    try {
      await eliminarSucursal(confirmarBorrar.id)
      if (confirmarBorrar.id === sucursalGlobal) {
        const restante = sucursales.find((s) => s.id !== confirmarBorrar.id)
        if (restante) cambiarSucursal(restante.id)
      }
      setAviso('Sucursal eliminada.')
      setConfirmarBorrar(null)
      void load()
    } catch (err) {
      setErrorBorrar(err instanceof Error ? err.message : 'No se pudo eliminar la sucursal.')
    } finally {
      setBorrando(false)
    }
  }

  const empleadosDe = (id: string) =>
    integrantes.filter((m) => m.sucursalId === id)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Sucursales</h1>
          <p className="text-sm text-muted-foreground">
            {cargando
              ? 'Cargando…'
              : `${sucursales.length}/${maximoSucursales} creadas. El stock y los empleados se agrupan por sucursal.`}
          </p>
        </div>
        <Button
          onClick={() => void abrirNueva()}
          disabled={sucursales.length >= maximoSucursales}
        >
          <Plus />
          Nueva sucursal
        </Button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {aviso && (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-50 p-3 text-sm text-emerald-700">
          {aviso}
        </p>
      )}

      {sucursales.length === 0 && !cargando && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Todavía no hay sucursales. Creá la primera con «Nueva sucursal».
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sucursales.map((s) => {
          const actual = s.id === sucursalGlobal
          const equipo = empleadosDe(s.id)
          return (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Store className="size-4 text-muted-foreground" />
                  {s.nombre}
                  {actual && (
                    <Badge className="bg-primary text-primary-foreground">
                      Sucursal actual
                    </Badge>
                  )}
                </CardTitle>
                <CardAction className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => abrirEdicion(s)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    className="text-destructive"
                    onClick={() => {
                      setErrorBorrar(null)
                      setConfirmarBorrar(s)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1 text-sm text-muted-foreground">
                  {s.direccion && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0" />
                      {s.direccion}
                    </p>
                  )}
                  {s.telefono && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="size-3.5 shrink-0" />
                      {s.telefono}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {lineas[s.id] ?? 0} líneas de stock
                  </Badge>
                  <Badge variant="secondary">
                    {equipo.length} integrante{equipo.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                {equipo.length > 0 && (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {equipo.map((m) => (
                      <li key={m.id} className="flex items-center gap-2">
                        <span className="truncate">{m.nombre ?? '—'}</span>
                        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5">
                          {ETIQUETA_ROL[m.rol]}
                          {m.estado === 'pendiente' && ' · pendiente'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
              <CardFooter className="justify-between">
                {actual ? (
                  <span className="text-sm text-muted-foreground">
                    Estás operando aquí
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmarCambio(s)}
                  >
                    Cambiar a esta sucursal
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle>
            <DialogDescription>
              {editando
                ? 'Actualizá los datos de la sucursal.'
                : `Podés tener hasta ${maximoSucursales} sucursales en tu plan.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void guardarForm(e)} className="space-y-3">
            {errorForm && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
                {errorForm}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="sucursal-nombre">Nombre</Label>
              <Input
                id="sucursal-nombre"
                value={valores.nombre}
                onChange={(e) =>
                  setValores((v) => ({ ...v, nombre: e.target.value }))
                }
                placeholder="Sucursal Centro"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sucursal-direccion">Dirección</Label>
              <Input
                id="sucursal-direccion"
                value={valores.direccion}
                onChange={(e) =>
                  setValores((v) => ({ ...v, direccion: e.target.value }))
                }
                placeholder="Avda. Principal 1234"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sucursal-telefono">Teléfono</Label>
              <Input
                id="sucursal-telefono"
                value={valores.telefono}
                onChange={(e) =>
                  setValores((v) => ({ ...v, telefono: e.target.value }))
                }
                placeholder="021 555 000"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear sucursal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarCambio !== null} onOpenChange={(o) => !o && setConfirmarCambio(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Estás seguro que querés cambiar de sucursal?</DialogTitle>
            <DialogDescription>
              Al pasar a {confirmarCambio?.nombre} vas a ver el stock y el equipo de esa sucursal en todo el sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmarCambio(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmarCambioDeSucursal()}
              disabled={cambiando}
            >
              {cambiando ? 'Cambiando…' : 'Sí, cambiar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarBorrar !== null} onOpenChange={(o) => !o && setConfirmarBorrar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Borrar la sucursal «{confirmarBorrar?.nombre}»?</DialogTitle>
            <DialogDescription>
              No se puede eliminar si tiene stock, ventas o integrantes. Reasignalos antes de eliminarla.
            </DialogDescription>
          </DialogHeader>
          {errorBorrar && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {errorBorrar}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmarBorrar(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void borrar()}
              disabled={borrando}
            >
              {borrando ? 'Borrando…' : 'Sí, borrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}