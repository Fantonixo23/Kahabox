import { useCallback, useEffect, useState } from 'react'

import { Check, ShieldX, Store } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Database } from '@/lib/database'
import { formatFecha } from '@/lib/format'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { cn } from 'cn'

type TenantRow = Database['public']['Tables']['tenants']['Row']
type Tab = 'pendientes' | 'todas'

const ETIQUETA_ESTADO: Record<TenantRow['estado'], string> = {
  pendiente: 'Pendiente',
  trial: 'Trial',
  activo: 'Activo',
  suspendido: 'Suspendido',
  rechazado: 'Rechazado',
}

const VARIANTE_ESTADO: Record<TenantRow['estado'], 'default' | 'secondary' | 'destructive' | 'outline'> =
  {
    pendiente: 'secondary',
    trial: 'outline',
    activo: 'default',
    suspendido: 'outline',
    rechazado: 'destructive',
  }

export default function AdminPage() {
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('pendientes')
  const [tenants, setTenants] = useState<TenantRow[] | null>(null)
  const [filtro, setFiltro] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupadoId, setOcupadoId] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!isSupabaseConfigured) return
    setError(null)
    const q = supabase
      .from('tenants')
      .select('id, nombre_comercial, estado, plan, email_contacto, created_at')
      .order('created_at', { ascending: tab === 'pendientes' })

    const { data, error } =
      tab === 'pendientes'
        ? await q.eq('estado', 'pendiente')
        : await q.limit(200)

    if (error) {
      setError(error.message)
      return
    }
    setTenants(data)
  }, [tab])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setEsAdmin(false)
      return
    }
    let activo = true
    supabase.rpc('es_superadmin').then(({ data, error }) => {
      if (!activo) return
      if (error || !data) {
        setEsAdmin(false)
      } else {
        setEsAdmin(true)
      }
    })
    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    if (esAdmin !== true) return
    void recargar()
  }, [recargar, esAdmin])

  async function cambiarEstado(id: string, estado: TenantRow['estado']) {
    setOcupadoId(id)
    setError(null)
    const { error } = await supabase.from('tenants').update({ estado }).eq('id', id)
    setOcupadoId(null)
    if (error) {
      setError(error.message)
      return
    }
    await recargar()
  }

  if (esAdmin === null) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Verificando acceso…
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!esAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ShieldX className="size-10 text-destructive" />
            <p className="text-sm font-medium">Sin acceso</p>
            <p className="text-sm text-muted-foreground">
              Esta consola es solo para administradores de Kahabox.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const visibles = tenants?.filter((t) => {
    const q = filtro.trim().toLowerCase()
    if (!q) return true
    return (
      t.nombre_comercial.toLowerCase().includes(q) ||
      (t.email_contacto ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Store className="size-5 text-muted-foreground" />
            <CardTitle>Registros de tiendas</CardTitle>
            <div className="ml-auto flex gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  ['pendientes', 'Pendientes'],
                  ['todas', 'Todas'],
                ] as const
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setTab(valor)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    tab === valor
                      ? 'bg-card shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>
          <CardDescription>
            {tab === 'pendientes'
              ? 'Tiendas esperando aprobación.'
              : 'Todas las tiendas registradas.'}
          </CardDescription>
          <Input
            placeholder="Filtrar por tienda o email…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        </CardHeader>
        <CardContent>
          {error && (
            <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {!tenants ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Cargando…
            </p>
          ) : visibles && visibles.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tienda</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Registro</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      {t.nombre_comercial}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.email_contacto ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatFecha(t.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE_ESTADO[t.estado]}>
                        {ETIQUETA_ESTADO[t.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.estado === 'pendiente' || t.estado === 'rechazado' ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            disabled={ocupadoId === t.id}
                            onClick={() => cambiarEstado(t.id, 'trial')}
                          >
                            <Check />
                            Aprobar
                          </Button>
                          {t.estado === 'pendiente' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive"
                              disabled={ocupadoId === t.id}
                              onClick={() => cambiarEstado(t.id, 'rechazado')}
                            >
                              Rechazar
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t.estado === 'suspendido' ? 'Suspendido' : 'En uso'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tab === 'pendientes'
                ? 'No hay tiendas pendientes de aprobación.'
                : 'No hay tiendas registradas.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}