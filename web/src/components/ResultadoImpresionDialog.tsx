import { AlertTriangle, Copy, Printer, RotateCw } from 'lucide-react'

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
  onImprimir,
  onCopiar,
  onOpenChange,
}: {
  resultado: ResultadoImpresion | null
  puedeImprimir: boolean
  reimprimiendo: boolean
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
              ? 'La venta quedó guardada. Compartí el ticket para imprimirlo.'
              : 'En el menú Compartir elegí RawBT y se imprime.'}
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

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onCopiar}>
            <Copy />
            Copiar
          </Button>
          <Button
            type="button"
            disabled={!puedeImprimir || reimprimiendo}
            onClick={onImprimir}
          >
            {reimprimiendo ? (
              <RotateCw className="animate-spin" />
            ) : (
              <Printer />
            )}
            Imprimir
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}