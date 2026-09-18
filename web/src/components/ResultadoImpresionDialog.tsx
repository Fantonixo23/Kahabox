import {
  AlertTriangle,
  Copy,
  Printer,
  RotateCw,
  Smartphone,
  Wifi,
} from 'lucide-react'

import type { ResultadoImpresion } from '@/lib/impresion/imprimir'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function ResultadoImpresionDialog({
  resultado,
  puedeImprimir,
  reimprimiendo,
  estacionActiva,
  onImprimirEstacion,
  onImprimirPC,
  onImprimir,
  onCopiar,
  onOpenChange,
}: {
  resultado: ResultadoImpresion | null
  puedeImprimir: boolean
  reimprimiendo: boolean
  estacionActiva?: boolean
  onImprimirEstacion?: () => void
  onImprimirPC: () => void
  onImprimir: () => void
  onCopiar: () => void
  onOpenChange: (v: boolean) => void
}) {
  const error = resultado?.error
  return (
    <Dialog open={Boolean(resultado)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tu ticket</DialogTitle>
          <DialogDescription>
            {error
              ? 'La venta quedó guardada. Elegí cómo imprimir o copiar el ticket.'
              : 'Elegí por dónde imprimir: estación, PC o el menú Compartir del celular.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <pre className="max-h-80 overflow-y-auto rounded-md border bg-black p-3 font-mono text-[11px] leading-snug text-white">
          {resultado?.texto}
        </pre>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={onCopiar}>
              <Copy />
              Copiar
            </Button>
            {estacionActiva && onImprimirEstacion && (
              <Button
                type="button"
                disabled={!puedeImprimir || reimprimiendo}
                onClick={onImprimirEstacion}
              >
                {reimprimiendo ? (
                  <RotateCw className="animate-spin" />
                ) : (
                  <Wifi />
                )}
                Imprimir estación
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={!puedeImprimir || reimprimiendo}
              onClick={onImprimir}
            >
              {reimprimiendo ? (
                <RotateCw className="animate-spin" />
              ) : (
                <Smartphone />
              )}
              Celular
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!puedeImprimir || reimprimiendo}
              onClick={onImprimirPC}
            >
              <Printer />
              PC
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
