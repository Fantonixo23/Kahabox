import { useState } from 'react'

import { Check, Copy, Smartphone, Usb } from 'lucide-react'

import QrCode from '@/components/QrCode'
import type { EstadoConexion } from '@/lib/escaneoRemoto'
import { cn } from 'cn'

/**
 * Selector informativo del método de escaneo. El lector USB y el celular
 * funcionan SIEMPRE al mismo tiempo; esto solo muestra estado e instrucciones.
 */
export default function EscanerSelector({
  enlace,
  estado,
  escaneadoresConectados,
  destino,
  className,
}: {
  enlace: string
  estado: EstadoConexion
  escaneadoresConectados: number
  /** Texto para el QR, ej. "Caja 1" o "Stock". */
  destino: string
  className?: string
}) {
  const [dispositivo, setDispositivo] = useState<'telefono' | 'usb'>('telefono')
  const [copiado, setCopiado] = useState(false)

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(enlace)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1500)
    } catch {
      // Sin permisos de portapapeles.
    }
  }

  const estadoTexto =
    estado === 'conectado'
      ? 'Conexión activa'
      : estado === 'error'
        ? 'Sin conexión'
        : 'Conectando…'

  return (
    <div className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Escanear</h2>
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            dispositivo === 'usb'
              ? 'bg-emerald-500'
              : estado === 'conectado'
                ? 'bg-emerald-500'
                : estado === 'error'
                  ? 'bg-destructive'
                  : 'animate-pulse bg-amber-500',
          )}
          aria-hidden
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setDispositivo('telefono')}
          className={cn(
            'flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors',
            dispositivo === 'telefono'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Smartphone className="size-4" />
          Teléfono
        </button>
        <button
          type="button"
          onClick={() => setDispositivo('usb')}
          className={cn(
            'flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors',
            dispositivo === 'usb'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Usb className="size-4" />
          Lector USB
        </button>
      </div>

      {dispositivo === 'telefono' ? (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground">{estadoTexto}</p>
          <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-3">
            <QrCode value={enlace} size={160} />
            <p className="text-center text-xs text-muted-foreground">
              Escanealo con la cámara del celular para conectar el teléfono a{' '}
              {destino}.
            </p>
            <button
              type="button"
              onClick={() => void copiarEnlace()}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {copiado ? (
                <Check className="size-3.5 text-emerald-600" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copiado ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
          </div>
          <p className="mt-2 border-t pt-2 text-xs font-medium text-muted-foreground">
            {escaneadoresConectados > 0
              ? `${escaneadoresConectados} celular${
                  escaneadoresConectados === 1 ? '' : 'es'
                } conectado${escaneadoresConectados === 1 ? '' : 's'}`
              : 'Ningún celular conectado todavía'}
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="flex items-center gap-2 text-xs font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Lector listo
          </p>
          <p className="text-xs text-muted-foreground">
            Dispará el lector apuntando al código. Cada lectura se procesa sola,
            no hace falta enfocar ningún campo.
          </p>
        </div>
      )}
    </div>
  )
}
