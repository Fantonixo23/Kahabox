import type { ReactNode } from 'react'

import { EyeOff } from 'lucide-react'

import { useAuth } from '@/components/auth/AuthContext'
import { puedeVerModulo } from '@/lib/config'
import { usePlan } from '@/lib/plan'
import { rolUsuario } from '@/lib/vistaStock'

export default function RequiereRol({
  ruta,
  children,
}: {
  ruta: string
  children: ReactNode
}) {
  const { user } = useAuth()
  const plan = usePlan()

  if (!puedeVerModulo(ruta, rolUsuario(user), plan)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-10 text-center">
        <EyeOff className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No tenés permiso para ver esta sección</p>
        <p className="text-sm text-muted-foreground">
          Pedile al dueño de la tienda que ajuste tu rol.
        </p>
      </div>
    )
  }

  return children
}