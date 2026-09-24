import { useCallback, useEffect, useState, type FormEvent } from 'react'

import {
  Ban,
  Check,
  Copy,
  MessageCircle,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ETIQUETA_ROL, nombreNegocio } from '@/lib/config'
import { etiquetaPlan, useLimitesPlan, usePlan } from '@/lib/plan'
import {
  cancelarInvitacion,
  confirmarMiembro,
  crearInvitacion,
  linkInvitacion,
  listarInvitaciones,
  listarMiembros,
  mensajeWhatsApp,
  quitarMiembro,
  rechazarMiembro,
  setRolMiembro,
  urlWhatsApp,
  type InvitacionDetalle,
  type MiembroDetalle,
} from '@/lib/equipoData'
import { formatFecha } from '@/lib/format'

const ESTADO_MIEMBRO: Record<
  MiembroDetalle['estado'],
  { label: string; variant: 'default' | 'outline' | 'secondary' | 'destructive' }
> = {
  activo: { label: 'Activo', variant: 'secondary' },
  pendiente: { label: 'Pendiente', variant: 'outline' },
  rechazado: { label: 'Rechazado', variant: 'destructive' },
}

export default function EquipoPage() {
  const [miembros, setMiembros] = useState<MiembroDetalle[]>([])
  const [invitaciones, setInvitaciones] = useState<InvitacionDetalle[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Formulario de invitación
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState<'administrador' | 'vendedor'>('vendedor')
  const [invitando, setInvitando] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [ultimoInvitado, setUltimoInvitado] = useState<{ nombre: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const plan = usePlan()
  const limites = useLimitesPlan()

  const load = useCallback(async () => {
    setError(null)
    try {
      const [m, i] = await Promise.all([listarMiembros(), listarInvitaciones()])
      setMiembros(m)
      setInvitaciones(i)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el equipo.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleInvitar(event: FormEvent) {
    event.preventDefault()
    if (!nombre.trim()) return
    const nombreInvitado = nombre.trim()
    setInvitando(true)
    setError(null)
    setCopiado(false)
    try {
      const creada = await crearInvitacion(nombreInvitado, rol)
      setLink(linkInvitacion(creada.token))
      setUltimoInvitado({ nombre: nombreInvitado })
      setNombre('')
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la invitación.')
    } finally {
      setInvitando(false)
    }
  }

  function mensaje(): string {
    return mensajeWhatsApp(ultimoInvitado?.nombre ?? 'integrante', nombreNegocio(), link ?? '')
  }

  async function copiarLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setCopiado(false)
    }
  }

  async function compartirLink() {
    if (!link) return
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Kahabox', text: mensaje(), url: link })
      } catch {
        // El usuario canceló el share nativo.
      }
    } else {
      await copiarLink()
    }
  }

  async function accion(accionFn: () => Promise<void>) {
    setError(null)
    try {
      await accionFn()
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción.')
    }
  }

  const pendientes = miembros.filter((m) => m.estado === 'pendiente')
  const invitacionesVivas = invitaciones.filter(
    (inv) => inv.estado === 'pendiente' || inv.estado === 'registrado',
  )

  // Cupos del plan: administradores y empleados (el dueño no cuenta).
  const usadosPorRol = {
    administrador:
      miembros.filter(
        (m) => m.rol === 'administrador' && m.estado !== 'rechazado',
      ).length +
      invitacionesVivas.filter((i) => i.rol === 'administrador').length,
    vendedor:
      miembros.filter((m) => m.rol === 'vendedor' && m.estado !== 'rechazado')
        .length +
      invitacionesVivas.filter((i) => i.rol === 'vendedor').length,
  }
  const cupoDe = (rol: 'administrador' | 'vendedor') =>
    rol === 'administrador' ? limites?.admins : limites?.empleados
  const cupoLleno = (rol: 'administrador' | 'vendedor') => {
    const cupo = cupoDe(rol)
    return typeof cupo === 'number' && usadosPorRol[rol] >= cupo
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mi equipo</h1>
        <p className="text-sm text-muted-foreground">
          Invitá a tu equipo por link y asigná roles. Tu plan {etiquetaPlan(plan)}:
        </p>
        <p className="text-sm text-muted-foreground">
          {usadosPorRol.administrador}/{limites?.admins ?? '…'} administradores y{' '}
          {usadosPorRol.vendedor}/{limites?.empleados ?? '…'} empleados.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <form
        onSubmit={handleInvitar}
        className="rounded-xl bg-card p-4 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="size-5 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Invitar a alguien</h2>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="inv-nombre">Nombre</Label>
            <Input
              id="inv-nombre"
              type="text"
              placeholder="Ej.: Marcos"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-rol">Rol</Label>
            <Select
              value={rol}
              onValueChange={(v) => setRol(v as 'administrador' | 'vendedor')}
            >
              <SelectTrigger id="inv-rol" size="default">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="administrador">Administrador</SelectItem>
                <SelectItem value="vendedor">Empleado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={invitando || cupoLleno(rol)}>
              {invitando ? 'Generando…' : 'Generar link'}
            </Button>
          </div>
        </div>

        {cupoLleno(rol) && (
          <p className="mt-2 text-xs text-amber-600">
            Alcanzaste el cupo de{' '}
            {ETIQUETA_ROL[rol === 'administrador' ? 'administrador' : 'vendedor']}{' '}
            de tu plan {etiquetaPlan(plan)}. Para sumar más, cambiá el rol o
            pasá a un plan superior.
          </p>
        )}

        {link && (
          <div className="mt-3 space-y-2 rounded-md border border-emerald-300/40 bg-emerald-50 p-3 dark:bg-emerald-950/30">
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Listo. Enviale este link a la persona para que ponga su correo y
              contraseña:
            </p>
            <code className="block break-all rounded bg-white px-2 py-1 text-xs text-foreground ring-1 ring-emerald-200 dark:bg-neutral-900">
              {link}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={urlWhatsApp(mensaje())} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  Enviar por WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={compartirLink}>
                {copiado ? <Check /> : <Copy />}
                {typeof navigator.share === 'function' ? 'Compartir' : 'Copiar link'}
              </Button>
            </div>
          </div>
        )}
      </form>

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando equipo…</p>
      ) : (
        <>
          {pendientes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pendientes de confirmación</CardTitle>
                <CardDescription>
                  Ya se registraron y esperan que los habilites.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Alta</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendientes.map((miembro) => (
                      <TableRow key={miembro.id}>
                        <TableCell className="font-medium">
                          {miembro.nombre ?? 'Miembro'}
                        </TableCell>
                        <TableCell>{ETIQUETA_ROL[miembro.rol]}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFecha(miembro.alta)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => accion(() => confirmarMiembro(miembro.id))}
                            >
                              <ShieldCheck />
                              Confirmar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => accion(() => rechazarMiembro(miembro.id))}
                            >
                              <Ban />
                              Rechazar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {invitacionesVivas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Invitaciones</CardTitle>
                <CardDescription>
                  Links generados que todavía no se usan o ya se registraron.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Expira</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invitacionesVivas.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.nombre}</TableCell>
                        <TableCell>{ETIQUETA_ROL[inv.rol]}</TableCell>
                        <TableCell>
                          <Badge variant={inv.estado === 'registrado' ? 'secondary' : 'outline'}>
                            {inv.estado === 'registrado' ? 'Registrado' : 'Sin usar'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFecha(inv.expiraAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {inv.estado === 'pendiente' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                accion(async () => {
                                  if (
                                    window.confirm(`¿Cancelar la invitación de ${inv.nombre}?`)
                                  ) {
                                    await cancelarInvitacion(inv.id)
                                  }
                                })
                              }
                            >
                              <X />
                              Cancelar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Equipo</CardTitle>
              <CardDescription>Personas con acceso a la tienda.</CardDescription>
            </CardHeader>
            <CardContent>
              {miembros.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-10 text-center">
                  <Users className="size-6 text-muted-foreground" />
                  <p className="text-sm font-medium">El equipo está vacío</p>
                  <p className="text-sm text-muted-foreground">
                    El dueño es el primer miembro del tenant.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Miembro</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Alta</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {miembros.map((miembro) => {
                      const esDueno = miembro.rol === 'dueño'
                      return (
                        <TableRow key={miembro.id}>
                          <TableCell>
                            <p className="font-medium">{miembro.nombre ?? 'Miembro'}</p>
                            <p className="text-xs text-muted-foreground">
                              {miembro.email ?? '—'}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant={esDueno ? 'default' : 'outline'}>
                              {ETIQUETA_ROL[miembro.rol]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={ESTADO_MIEMBRO[miembro.estado].variant}>
                              {ESTADO_MIEMBRO[miembro.estado].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatFecha(miembro.alta)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {!esDueno && miembro.rol === 'administrador' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    accion(async () => {
                                      if (
                                        window.confirm(
                                          `¿Pasar a ${miembro.nombre ?? 'este integrante'} a Empleado?`,
                                        )
                                      ) {
                                        await setRolMiembro(miembro.id, 'vendedor')
                                      }
                                    })
                                  }
                                >
                                  <UserCog className="size-4" />
                                  Empleado
                                </Button>
                              )}
                              {!esDueno && miembro.rol === 'vendedor' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={cupoLleno('administrador')}
                                  onClick={() =>
                                    accion(async () => {
                                      if (
                                        window.confirm(
                                          `¿Dar acceso de Administrador a ${miembro.nombre ?? 'este integrante'}?`,
                                        )
                                      ) {
                                        await setRolMiembro(miembro.id, 'administrador')
                                      }
                                    })
                                  }
                                >
                                  <ShieldCheck />
                                  Administrador
                                </Button>
                              )}
                              {!esDueno && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() =>
                                    accion(async () => {
                                      if (
                                        window.confirm(
                                          `¿Quitar del equipo a ${miembro.nombre ?? 'este integrante'}? Perderá el acceso.`,
                                        )
                                      ) {
                                        await quitarMiembro(miembro.id)
                                      }
                                    })
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}