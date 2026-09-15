import { useEffect, useState } from 'react'

import { Printer, RotateCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { imprimirTicket, type ResultadoImpresion } from '@/lib/impresion/imprimir'
import { armarTextoPlano, type TicketVenta } from '@/lib/impresion/ticket'

function ticketPrueba(): TicketVenta {
  const fecha = new Date().toLocaleString('es-PY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return {
    nombreLocal: 'KAHABOX',
    fecha,
    numeroVenta: 'PRUEBA-0001',
    items: [
      {
        nombre: 'Auriculares BT inalambricos',
        detalle: 'Negro',
        cantidad: 1,
        precio: 'Gs 180.000',
        total: 'Gs 180.000',
      },
      {
        nombre: 'Funda de celular',
        cantidad: 2,
        precio: 'Gs 45.000',
        total: 'Gs 90.000',
      },
    ],
    total: 'Gs 270.000',
    metodosPago: 'Efectivo',
    recibido: 'Gs 300.000',
    cambio: 'Gs 30.000',
  }
}

export default function ImpresoraDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [probando, setProbando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImpresion | null>(null)

  useEffect(() => {
    if (!open) return
    setResultado(null)
  }, [open])

  async function probar() {
    setProbando(true)
    const res = await imprimirTicket(ticketPrueba())
    setProbando(false)
    setResultado(res)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Impresora térmica</DialogTitle>
          <DialogDescription>
            En el celular se imprime con la app RawBT: el botón de imprimir abre el
            menú Compartir y ahí elegís RawBT.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-1.5 text-sm text-muted-foreground">
          <li>
            1. Instalá <b>RawBT</b> desde Play Store y vinculá tu impresora en{' '}
            <b>Ajustes → Bluetooth</b> del celular.
          </li>
          <li>
            2. Dentro de RawBT (icono de engranaje) elegí tu impresora Bluetooth.
          </li>
          <li>
            3. Acá tocá <b>Imprimir ticket de prueba</b> y en Compartir elegí RawBT.
          </li>
        </ol>

        <Button
          type="button"
          className="h-12 w-full"
          disabled={probando}
          onClick={() => void probar()}
        >
          {probando ? (
            <RotateCw className="animate-spin" />
          ) : (
            <Printer />
          )}
          Imprimir ticket de prueba
        </Button>

        {resultado?.error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {resultado.error}
          </p>
        )}
        {resultado && !resultado.error && (
          <p className="rounded-md border border-emerald-300/50 bg-emerald-50 p-2 text-xs text-emerald-700">
            Ticket enviado al menú Compartir: elegí RawBT para imprimir.
          </p>
        )}
        {resultado && (
          <pre className="max-h-64 overflow-y-auto rounded-md border bg-black p-3 font-mono text-[11px] leading-tight text-white">
            {armarTextoPlano(ticketPrueba())}
          </pre>
        )}

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}