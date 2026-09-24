import { useCallback, useEffect, useState } from 'react'

import { Ban, Check, Lock, RefreshCw, ShieldCheck } from 'lucide-react'

import { FullscreenLoader } from '@/components/FullscreenLoader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const ETIQUETAS_ESTADO: Record<string, { etiqueta: string; variante: 'default' | 'destructive' | 'outline' }> = {
  pendiente: { etiqueta: 'Pendiente', variante: 'outline' },
  trial: { etiqueta: 'Prueba', variante: 'outline' },
  activo: { etiqueta: 'Activo', variante: 'default' },
  suspendido: { etiqueta: 'Suspendido', variante: 'destructive' },
  rechazado: { etiqueta: 'Rechazado', variante: 'destructive' },
}

export default function AdminPage() {
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null)
  const [tenants, setTenants] = useState<FilaTenant[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorTecnico, setErrorTecnico] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<string | null>(null)

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
            Plane, estados y bloqueos de todas las tiendas de Kahabox.
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
            {tenants.map((t) => {
              const estado = ETIQUETAS_ESTADO[t.estado] ?? {
                etiqueta: t.estado,
                variante: 'outline' as const,
              }
              const suspendida = t.estado === 'suspendido'
              return (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{t.nombre_comercial}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.email_contacto ?? 'Sin email'}
                      </p>
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
                </TableRow>
              )
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
        Nota: al bloquear se corta el acceso de esa tienda (lectura y escritura)
        en toda la base. La app del cliente muestra el aviso de subscripcion
        vencida hasta que la desbloquees.
      </p>
    </div>
  )
}