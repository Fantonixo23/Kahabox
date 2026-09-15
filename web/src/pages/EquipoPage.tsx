import { useCallback, useEffect, useState } from 'react'

import { Users } from 'lucide-react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database'
import { formatFecha } from '@/lib/format'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { getMockMiembros } from '@/lib/mock'

type MiembroRow = Database['public']['Tables']['usuarios_tenant']['Row']

export default function EquipoPage() {
  const [rows, setRows] = useState<MiembroRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    if (!isSupabaseConfigured) {
      setRows(getMockMiembros())
      return
    }
    const { data, error } = await supabase
      .from('usuarios_tenant')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
      setRows(null)
    } else {
      setRows((data as MiembroRow[]) ?? [])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mi equipo</h1>
        <p className="text-sm text-muted-foreground">
          Personas con acceso a la cuenta de la tienda.
        </p>
      </div>

      <p className="max-w-xl rounded-md border border-sky-300/40 bg-sky-50 p-3 text-xs text-sky-700">
        Por ahora los vendedores se agregan desde la base de datos. La invitación
        automática por magic link llega en la Fase 1 (Edge Function de invitación).
      </p>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {isSupabaseConfigured && rows !== null && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-10 text-center">
          <Users className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">El equipo está vacío</p>
          <p className="text-sm text-muted-foreground">
            El dueño es el primer miembro del tenant.
          </p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Alta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((miembro) => (
                <TableRow key={miembro.id}>
                  <TableCell className="font-medium">{miembro.user_id}</TableCell>
                  <TableCell>
                    <Badge variant={miembro.rol === 'dueño' ? 'default' : 'outline'}>
                      {miembro.rol}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatFecha(miembro.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}