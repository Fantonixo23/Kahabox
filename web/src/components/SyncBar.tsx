import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Loader2,
  RefreshCw,
  Trash2,
  WifiOff,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  eliminarItem,
  etiquetaOperacion,
  etiquetaTipo,
  reintentar,
  useCola,
  type ItemCola,
} from '@/lib/cola'
import { haySincronizacion, sincronizar, useSincronizando } from '@/lib/ejecutar'
import { formatFecha } from '@/lib/format'
import { useEnLinea } from '@/lib/red'
import { cn } from 'cn'

function FilaItem({ item }: { item: ItemCola }) {
  const op = item.operacion
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Badge variant={item.estado === 'fallo' ? 'destructive' : 'secondary'}>
          {etiquetaTipo(op.tipo)}
        </Badge>
        {item.estado === 'fallo' && <AlertTriangle className="size-4 text-destructive" />}
        {item.estado === 'sync' && (
          <CheckCircle2 className="size-4 text-emerald-600" />
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatFecha(item.creadoEn)}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium">{etiquetaOperacion(op)}</p>
      {item.error && (
        <p className="mt-1 text-xs text-destructive">{item.error}</p>
      )}
      <div className="mt-2 flex justify-end gap-1">
        {item.estado === 'fallo' && (
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              reintentar(item.id)
              void sincronizar()
            }}
          >
            <RefreshCw />
            Reintentar
          </Button>
        )}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => eliminarItem(item.id)}
        >
          <Trash2 />
          Quitar
        </Button>
      </div>
    </div>
  )
}

export default function SyncBar() {
  const enLinea = useEnLinea()
  const cola = useCola()
  const sincronizando = useSincronizando()
  const [abierto, setAbierto] = useState(false)

  const pendientes = cola.filter((i) => i.estado !== 'sync')
  const fallos = pendientes.filter((i) => i.estado === 'fallo').length
  const mostrando = !enLinea || pendientes.length > 0

  useEffect(() => {
    if (enLinea && pendientes.length > 0) void sincronizar()
  }, [enLinea, pendientes.length])

  if (!mostrando) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          'flex w-full items-center gap-2 px-4 py-1.5 text-xs transition-colors sm:text-sm',
          enLinea
            ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-200'
            : 'bg-destructive/10 text-destructive hover:bg-destructive/20',
        )}
      >
        {enLinea ? <ListChecks className="size-4" /> : <WifiOff className="size-4" />}
        <span className="min-w-0 flex-1 truncate text-left">
          {enLinea
            ? fallos > 0
              ? `${pendientes.length} pendientes de sincronización (${fallos} con error)`
              : `${pendientes.length} operación${pendientes.length === 1 ? '' : 'es'} pendiente${pendientes.length === 1 ? '' : 's'} de sincronización`
            : 'Sin conexión — se guarda todo de forma local'}
        </span>
        {enLinea && pendientes.length > 0 && (
          <span className="flex items-center gap-1 rounded-md bg-background/60 px-2 py-0.5 pr-1 font-medium">
            {sincronizando ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            Sincronizar
          </span>
        )}
        {!enLinea && sincronizando && <Loader2 className="size-3 animate-spin" />}
      </button>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pendientes de sincronización</DialogTitle>
            <DialogDescription>
              {enLinea
                ? 'Operaciones guardadas sin conexión. Se suben automáticamente al recuperar la red.'
                : 'Sin conexión: lo que hagas queda guardado en este equipo y se sube al volver.'}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {pendientes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay operaciones pendientes.
              </p>
            ) : (
              pendientes.map((item) => <FilaItem key={item.id} item={item} />)
            )}
          </div>

          <DialogFooter>
            {pendientes.length > 0 && enLinea && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void sincronizar()}
                disabled={haySincronizacion()}
              >
                {sincronizando && <Loader2 className="size-4 animate-spin" />}
                Sincronizar todo ahora
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cerrar
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}