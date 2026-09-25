import { useCallback, useEffect, useState } from 'react'

import {
  Ban,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  RefreshCw,
  ShieldCheck,
  Store,
} from 'lucide-react'

import { FullscreenLoader } from '@/components/FullscreenLoader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { formatFecha } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type FilaTenant = {
  id: string
  nombre_comercial: string
  email_contacto: string | null
  estado: string
  plan: string
  integrantes: number
  creada: string
}

type FilaSucursal = {
  id: string
  nombre: string
  vencimiento: string | null
  bloqueada: boolean
  dias_restantes: number | null
}

const ETIQUETAS_ESTADO: Record<string, { etiqueta: string; variante: 'default' | 'destructive' | 'outline' }> = {
  pendiente: { etiqueta: 'Pendiente', variante: 'outline' },
  trial: { etiqueta: 'Prueba', variante: 'outline' },
  activo: { etiqueta: 'Activo', variante: 'default' },
  suspendido: { etiqueta: 'Suspendido', variante: 'destructive' },
  rechazado: { etiqueta: 'Rechazado', variante: 'destructive' },
}

function fechaLocal(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-CA')
}

function fechaISO(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString()
}

function diasASumar(dias: number): string {
  const f = new Date()
  f.setDate(f.getDate() + dias)
  return f.toISOString()
}

export default function AdminPage() {
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null)
  const [tenants, setTenants] = useState<FilaTenant[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorTecnico, setErrorTecnico] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({})
  const [sucursales, setSucursales] = useState<Record<string, FilaSucursal[]>>({})
  const [fechas, setFechas] = useState<Record<string, string>>({})

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    setErrorTecnico(null)
    try {
      const { data: admin, error: errAdmin } = await supabase.rpc('es_superadmin')
      if (errAdmin) {
        setErrorTecnico(
          'La consola todavia no esta activa en la base de datos. Aplicá la migracion 20260924120000_admin_dashboard.sql en Supabase Studio y volvé a entrar.',
        )
        return
      }
      if (!admin) {
        setEsAdmin(false)
        return
      }
      setEsAdmin(true)
      const { data, error: errTenants } = await supabase.rpc('listar_tenants_admin')
      if (errTenants) throw errTenants
      setTenants(data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el panel.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function cambiarEstado(id: string, estado: string) {
    setGuardando(`${id}:${estado}`)
    setError(null)
    try {
      const { error } = await supabase.rpc('admin_cambiar_estado', {
        p_tenant_id: id,
        p_estado: estado,
      })
      if (error) throw error
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.')
    } finally {
      setGuardando(null)
    }
  }

  async function cambiarPlan(id: string, plan: string) {
    setGuardando(`${id}:plan`)
    setError(null)
    try {
      const { error } = await supabase.rpc('admin_cambiar_plan', {
        p_tenant_id: id,
        p_plan: plan,
      })
      if (error) throw error
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el plan.')
    } finally {
      setGuardando(null)
    }
  }

  async function cargarSucursales(tenantId: string) {
    try {
      const { data, error } = await supabase.rpc('listar_sucursales_admin', {
        p_tenant_id: tenantId,
      })
      if (error) throw error
      const filas = data ?? []
      setSucursales((prev) => ({ ...prev, [tenantId]: filas }))
      setFechas((prev) => {
        const prox = { ...prev }
        for (const s of filas) prox[s.id] = fechaLocal(s.vencimiento)
        return prox
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las sucursales.')
    }
  }

  async function abrirTenant(tenantId: string) {
    const abierto = !abiertos[tenantId]
    setAbiertos((prev) => ({ ...prev, [tenantId]: abierto }))
    if (abierto && !sucursales[tenantId]) {
      await cargarSucursales(tenantId)
    }
  }

  async function guardarFecha(id: string, value: string) {
    setGuardando(`${id}:fecha`)
    setError(null)
    try {
      const iso = value ? fechaISO(value) : null
      const { error } = await supabase.rpc('admin_cambiar_vencimiento_sucursal', {
        p_id: id,
        p_vencimiento: iso,
      })
      if (error) throw error
      const suc = Object.entries(sucursales).find(([, arr]) =>
        arr.some((s) => s.id === id),
      )
      if (suc) await cargarSucursales(suc[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la fecha.')
    } finally {
      setGuardando(null)
    }
  }

  async function renovarSucursal(id: string) {
    setGuardando(`${id}:renovar`)
    setError(null)
    try {
      const { error } = await supabase.rpc('admin_cambiar_vencimiento_sucursal', {
        p_id: id,
        p_vencimiento: diasASumar(30),
      })
      if (error) throw error
      const suc = Object.entries(sucursales).find(([, arr]) =>
        arr.some((s) => s.id === id),
      )
      if (suc) await cargarSucursales(suc[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo renovar la sucursal.')
    } finally {
      setGuardando(null)
    }
  }

  async function toggleSucursal(s: FilaSucursal) {
    const nuevo = !s.bloqueada
    setGuardando(`${s.id}:bloqueo`)
    setError(null)
    try {
      const { error } = await supabase.rpc('admin_set_sucursal_bloqueada', {
        p_id: s.id,
        p_bloqueada: nuevo,
      })
      if (error) throw error
      const suc = Object.entries(sucursales).find(([, arr]) =>
        arr.some((x) => x.id === s.id),
      )
      if (suc) await cargarSucursales(suc[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el bloqueo.')
    } finally {
      setGuardando(null)
    }
  }

  if (esAdmin === null) return <FullscreenLoader />

  if (esAdmin === false) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-10 text-muted-foreground" />
        <p className="text-sm font-semibold">Acceso restringido</p>
        <p className="text-sm text-muted-foreground">
          Solo el administrador de Kahabox puede entrar aca. Si sos el
          administrador, revisá que tu cuenta esté en la tabla superadmins
          (public.superadmins) con tu user_id.
        </p>
      </div>
    )
  }

  if (errorTecnico) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Lock className="size-10 text-destructive" />
        <p className="text-sm font-semibold">Consola no activada</p>
        <p className="max-w-md text-sm text-muted-foreground">{errorTecnico}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Administracion de clientes</h1>
          <p className="text-sm text-muted-foreground">
            Plane, estados, vencimientos y bloqueos. Toca para ver cada sucursal.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
          <RefreshCw className={cargando ? 'animate-spin' : ''} />
          Recargar
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tienda</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Integrantes</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.flatMap((t) => {
              const estado = ETIQUETAS_ESTADO[t.estado] ?? {
                etiqueta: t.estado,
                variante: 'outline' as const,
              }
              const suspendida = t.estado === 'suspendido'
              const abierta = !!abiertos[t.id]
              const sucs = sucursales[t.id] ?? []
              return [
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void abrirTenant(t.id)}
                        className="flex items-center gap-1 rounded text-muted-foreground hover:text-foreground"
                        title={abierta ? 'Ocultar sucursales' : 'Ver sucursales'}
                      >
                        {abierta ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">{t.nombre_comercial}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.email_contacto ?? 'Sin email'}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={t.plan}
                      onValueChange={(valor) => void cambiarPlan(t.id, valor)}
                      disabled={guardando === `${t.id}:plan`}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basico">
                          <span className="flex items-center gap-2">
                            <ShieldCheck className="size-3.5" />
                            Basico
                          </span>
                        </SelectItem>
                        <SelectItem value="estandar">Estandar</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {t.integrantes}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatFecha(t.creada)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {suspendida ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={guardando === `${t.id}:activo`}
                          onClick={() => void cambiarEstado(t.id, 'activo')}
                        >
                          <Check />
                          Desbloquear
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={guardando === `${t.id}:suspendido`}
                          onClick={() => void cambiarEstado(t.id, 'suspendido')}
                        >
                          <Ban />
                          Bloquear
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>,
                abierta ? (
                  <TableRow key={`${t.id}-sucursales`} className="bg-muted/30">
                    <TableCell colSpan={6}>
                      <SucursalesTabla
                        tenantNombre={t.nombre_comercial}
                        sucs={sucs}
                        fechas={fechas}
                        guardando={guardando}
                        onCambiarFecha={(id, v) => setFechas((prev) => ({ ...prev, [id]: v }))}
                        onGuardarFecha={(id) => void guardarFecha(id, fechas[id] ?? '')}
                        onRenovar={(id) => void renovarSucursal(id)}
                        onToggle={(s) => void toggleSucursal(s)}
                      />
                    </TableCell>
                  </TableRow>
                ) : null,
              ]
            })}
            {tenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Sin tiendas registradas todavia.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Bloquear una tienda corta todo su acceso. Bloquear una sucursal (o que
        venza su fecha) corta solo esa sucursal: esa parte del cliente ve el
        aviso de subscripcion vencida y no puede vender ni mover stock hasta
        renovarla.
      </p>
    </div>
  )
}

function SucursalesTabla({
  tenantNombre,
  sucs,
  fechas,
  guardando,
  onCambiarFecha,
  onGuardarFecha,
  onRenovar,
  onToggle,
}: {
  tenantNombre: string
  sucs: FilaSucursal[]
  fechas: Record<string, string>
  guardando: string | null
  onCambiarFecha: (id: string, value: string) => void
  onGuardarFecha: (id: string) => void
  onRenovar: (id: string) => void
  onToggle: (s: FilaSucursal) => void
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Store className="size-3.5" />
        Sucursales de {tenantNombre}
      </p>
      {sucs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Esta tienda no tiene sucursales cargadas.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-1.5 pr-3 font-medium">Sucursal</th>
                <th className="pb-1.5 pr-3 font-medium">Estado</th>
                <th className="pb-1.5 pr-3 font-medium">Vencimiento</th>
                <th className="pb-1.5 pr-3 font-medium">Cambiar fecha</th>
                <th className="pb-1.5 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sucs.map((s) => {
                const vencio =
                  s.vencimiento !== null &&
                  new Date(s.vencimiento as string).getTime() <= Date.now()
                const bloqueada = s.bloqueada || vencio
                const diasBajos = !bloqueada && s.dias_restantes !== null && s.dias_restantes <= 3
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{s.nombre}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {bloqueada ? (
                        <Badge variant="destructive">
                          {s.bloqueada ? 'Bloqueada' : 'Vencida'}
                        </Badge>
                      ) : s.vencimiento === null ? (
                        <Badge variant="outline">Sin limite</Badge>
                      ) : (
                        <Badge variant="outline" className={diasBajos ? 'text-amber-600' : ''}>
                          {s.dias_restantes} dias
                        </Badge>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {s.vencimiento ? formatFecha(s.vencimiento) : '-'}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="date"
                          className="h-8 w-40"
                          value={fechas[s.id] ?? ''}
                          onChange={(e) => onCambiarFecha(s.id, e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          disabled={guardando === `${s.id}:fecha`}
                          onClick={() => onGuardarFecha(s.id)}
                        >
                          Guardar
                        </Button>
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          disabled={guardando === `${s.id}:renovar`}
                          onClick={() => onRenovar(s.id)}
                        >
                          <CalendarPlus className="size-3.5" />
                          Renovar 30 dias
                        </Button>
                        {s.bloqueada ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            disabled={guardando === `${s.id}:bloqueo`}
                            onClick={() => onToggle(s)}
                          >
                            <Check className="size-3.5" />
                            Desbloquear
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 px-2 text-xs"
                            disabled={guardando === `${s.id}:bloqueo`}
                            onClick={() => onToggle(s)}
                          >
                            <Ban className="size-3.5" />
                            Bloquear
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}