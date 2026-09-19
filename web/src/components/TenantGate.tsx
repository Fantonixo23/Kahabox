import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { Hourglass, RefreshCw, ShieldX } from 'lucide-react'

import { AuthShell } from '@/components/auth/AuthShell'
import { useAuth } from '@/components/auth/AuthContext'
import { FullscreenLoader } from '@/components/FullscreenLoader'
import { Button } from '@/components/ui/button'
import { miEstadoEquipo } from '@/lib/equipoData'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

type EstadoAcceso = 'verificando' | 'ok' | 'pendiente' | 'rechazado'
type MotivoBloqueo = 'tenant' | 'miembro'

export default function TenantGate({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [estado, setEstado] = useState<EstadoAcceso>('verificando')
  const [motivo, setMotivo] = useState<MotivoBloqueo>('tenant')

  const tenantId = session?.user?.app_metadata?.tenant_id as string | undefined

  const verificar = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setEstado('ok')
      return
    }

    try {
      // Empleados invitados: hasta que el dueño confirme el alta no hay tenant
      // en el JWT, así que primero se chequea el estado como miembro.
      const miembroEstado = await miEstadoEquipo()
      if (miembroEstado === 'pendiente' || miembroEstado === 'rechazado') {
        setMotivo('miembro')
        setEstado(miembroEstado)
        return
      }

      if (!tenantId) {
        setEstado('ok')
        return
      }

      const { data: fila, error } = await supabase
        .from('tenants')
        .select('estado')
        .eq('id', tenantId)
        .maybeSingle()

      if (error) throw error

      const tenantEstado = fila?.estado

      if (tenantEstado === 'pendiente' || tenantEstado === 'rechazado') {
        setMotivo('tenant')
        setEstado(tenantEstado)
        return
      }

      // Estado activo/trial/suspendido o sin datos (JWT sin claim): se entra.
      setEstado('ok')
    } catch {
      // Sin red o error de lectura: no bloquear a los ya aprobados.
      setEstado('ok')
    }
  }, [tenantId])

  useEffect(() => {
    setEstado('verificando')
    verificar()
  }, [verificar])

  // Si el superadmin (o el dueño) aprueba mientras la pestaña está abierta,
  // al volver a enfocarla se destraba la cuenta sin necesidad de recargar.
  useEffect(() => {
    const onFocus = () => verificar()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [verificar])

  if (estado === 'verificando') return <FullscreenLoader />

  if (estado === 'pendiente') {
    return (
      <AuthShell subtitle={motivo === 'miembro' ? 'Tu alta está en revisión' : 'Tu tienda todavía no está habilitada'}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Hourglass className="size-10 text-amber-600" />
          <p className="text-sm font-medium">
            {motivo === 'miembro' ? 'Esperando confirmación del dueño' : 'Cuenta en revisión'}
          </p>
          <p className="text-sm text-muted-foreground">
            {motivo === 'miembro'
              ? 'Tu alta quedó pendiente de confirmación. Apenas el dueño de la tienda te habilite, vas a poder entrar.'
              : 'Tu cuenta quedó pendiente de aprobación. Te habilitamos el acceso apenas la validemos — normalmente en poco tiempo.'}
          </p>
          <Button variant="outline" className="mt-2 w-full" onClick={verificar}>
            <RefreshCw />
            Revisar de nuevo
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (estado === 'rechazado') {
    return (
      <AuthShell subtitle={motivo === 'miembro' ? 'Tu alta no fue habilitada' : 'Tu cuenta no fue habilitada'}>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <ShieldX className="size-10 text-destructive" />
          <p className="text-sm font-medium">
            {motivo === 'miembro' ? 'No fuiste aceptado en la tienda' : 'Registro rechazado'}
          </p>
          <p className="text-sm text-muted-foreground">
            {motivo === 'miembro'
              ? 'El dueño de la tienda no confirmó tu acceso. Si creés que es un error, pedile que te invite de nuevo.'
              : 'No pudimos habilitar esta cuenta. Si creés que es un error, escribinos y lo revisamos.'}
          </p>
          <Button variant="outline" className="mt-2 w-full" onClick={verificar}>
            <RefreshCw />
            Revisar de nuevo
          </Button>
        </div>
      </AuthShell>
    )
  }

  return children
}