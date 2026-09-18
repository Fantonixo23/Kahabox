import { useEffect, useState } from 'react'

import {
  Bluetooth,
  CheckCircle2,
  Monitor,
  Printer,
  RotateCw,
  Smartphone,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  actualizarConfig,
  actualizarEstacionImpresion,
  useConfig,
} from '@/lib/config'
import { listarImpresorasDisponibles } from '@/lib/impresion/estacion'
import { imprimirPorEstacion } from '@/lib/impresion/imprimir'
import {
  esNativo,
  impresoraNativaDisponible,
  KahaboxPrinter,
  type DispositivoBluetooth,
} from '@/lib/impresion/nativo'
import { armarEscPosBase64, type TicketVenta } from '@/lib/impresion/ticket'
import { cn } from 'cn'

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
  const config = useConfig()
  const nativo = esNativo() && impresoraNativaDisponible()
  const [dispositivos, setDispositivos] = useState<DispositivoBluetooth[]>([])
  const [buscando, setBuscando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const estacion = config.estacionImpresion

  const selectorMetodo = (
    <div className="space-y-2">
      <Label>Método de impresión de esta caja</Label>
      <div className="grid grid-cols-2 gap-2">
        {nativo && (
          <Button
            type="button"
            variant={
              config.metodoImpresion === 'bluetooth' ? 'default' : 'outline'
            }
            onClick={() => actualizarConfig({ metodoImpresion: 'bluetooth' })}
          >
            <Bluetooth />
            Bluetooth
          </Button>
        )}
        <Button
          type="button"
          variant={
            config.metodoImpresion === 'estacion' ? 'default' : 'outline'
          }
          onClick={() => actualizarConfig({ metodoImpresion: 'estacion' })}
        >
          <Smartphone />
          Estación
        </Button>
        <Button
          type="button"
          variant={
            config.metodoImpresion === 'navegador' ? 'default' : 'outline'
          }
          onClick={() => actualizarConfig({ metodoImpresion: 'navegador' })}
        >
          <Monitor />
          PC / navegador
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {config.metodoImpresion === 'bluetooth'
          ? 'Al cobrar, este celular imprime el ticket directo por Bluetooth.'
          : config.metodoImpresion === 'estacion'
            ? 'Al cobrar, se encola el ticket y la estación elegida lo imprime.'
            : 'Al cobrar se muestra el ticket para imprimir desde la PC, la estación o compartirlo.'}
      </p>
    </div>
  )

  useEffect(() => {
    if (!open) return
    setAviso(null)
    if (nativo) {
      setBuscando(true)
      listarImpresorasDisponibles()
        .then(setDispositivos)
        .catch(() =>
          setAviso({ ok: false, texto: 'No se pudieron listar los dispositivos.' }),
        )
        .finally(() => setBuscando(false))
    }
  }, [open, nativo])

  async function probar() {
    setAviso(null)
    setProbando(true)
    try {
      if (nativo) {
        if (!estacion.impresoraDireccion) {
          setAviso({ ok: false, texto: 'Elegí una impresora primero.' })
          return
        }
        const base64 = armarEscPosBase64(ticketPrueba(), 32)
        await KahaboxPrinter.connect({ address: estacion.impresoraDireccion })
        await KahaboxPrinter.print({ data: base64 })
        setAviso({ ok: true, texto: 'Ticket de prueba enviado a la impresora.' })
      } else {
        const res = await imprimirPorEstacion(ticketPrueba(), config.anchoTicketPc)
        setAviso(
          res.error
            ? { ok: false, texto: res.error }
            : { ok: true, texto: 'Trabajo enviado a la estación de impresión.' },
        )
      }
    } catch (e) {
      setAviso({
        ok: false,
        texto: e instanceof Error ? e.message : 'No se pudo imprimir la prueba.',
      })
    } finally {
      setProbando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Impresora · Estación de impresión</DialogTitle>
          <DialogDescription>
            {nativo
              ? 'Este dispositivo puede imprimir los tickets directo por Bluetooth.'
              : 'La impresora se configura en el celular/tablet que hace de estación.'}
          </DialogDescription>
        </DialogHeader>

        {nativo ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Impresoras vinculadas</Label>
              {buscando && (
                <p className="text-sm text-muted-foreground">Buscando…</p>
              )}
              {!buscando && dispositivos.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay dispositivos. Vinculá la impresora en Ajustes → Bluetooth
                  del celular y volvé a abrir.
                </p>
              )}
              <div className="grid gap-1.5">
                {dispositivos.map((d) => {
                  const activo = d.address === estacion.impresoraDireccion
                  return (
                    <button
                      key={d.address}
                      type="button"
                      onClick={() =>
                        actualizarEstacionImpresion({
                          impresoraNombre: d.name || d.address,
                          impresoraDireccion: d.address,
                        })
                      }
                      className={cn(
                        'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-muted',
                        activo && 'border-primary bg-muted font-medium',
                      )}
                    >
                      <span className="truncate">{d.name || '(sin nombre)'}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                        {d.type === 'le' ? 'BLE' : 'Bluetooth'}
                        {activo && <CheckCircle2 className="ml-2 inline size-4" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={estacion.activa}
                onChange={(e) =>
                  actualizarEstacionImpresion({ activa: e.target.checked })
                }
              />
              <span className="text-sm">
                <b>Usar este dispositivo como estación de impresión</b>
                <span className="mt-1 block text-muted-foreground">
                  Se queda escuchando los tickets de la caja con la pantalla
                  apagada. Conviene dejarlo enchufado.
                </span>
              </span>
            </label>

            {selectorMetodo}
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="space-y-1.5 text-sm text-muted-foreground">
              <li>
                1. En el celular/tablet, entrá con el mismo usuario y abrí{' '}
                <b>Configuración → Impresora</b>.
              </li>
              <li>
                2. Elegí la impresora Bluetooth y activá{' '}
                <b>“Usar este dispositivo como estación”</b>.
              </li>
              <li>3. Acá elegí imprimir en la estación.</li>
            </ol>
            {selectorMetodo}
          </div>
        )}

        {aviso && (
          <p
            className={cn(
              'rounded-md border p-2 text-xs',
              aviso.ok
                ? 'border-emerald-300/50 bg-emerald-50 text-emerald-700'
                : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            {aviso.texto}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={probando}
            onClick={() => void probar()}
          >
            {probando ? <RotateCw className="animate-spin" /> : <Printer />}
            Imprimir ticket de prueba
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
