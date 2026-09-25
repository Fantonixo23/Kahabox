import { useEffect, useState } from 'react'

import {
  Bluetooth,
  CheckCircle2,
  Download,
  Monitor,
  Printer,
  RotateCw,
  WifiOff,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  actualizarConfig,
  actualizarImpresoraBluetooth,
  actualizarImpresoraQz,
  useConfig,
} from '@/lib/config'
import {
  imprimirTicketPC,
  imprimirTicketQz,
} from '@/lib/impresion/imprimir'
import {
  esNativo,
  impresoraNativaDisponible,
  imprimirConReintento,
  listarImpresoras,
  type DispositivoBluetooth,
} from '@/lib/impresion/nativo'
import {
  listarImpresorasQz,
  qzDisponible,
  vigilarQz,
} from '@/lib/impresion/qz'
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
    ruc: '80012345-6',
    direccion: 'Av. San Blas 1001, Ciudad del Este',
    telefono: '(061) 500-123',
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
    ],
    total: 'Gs 180.000',
    metodosPago: 'Efectivo',
    recibido: 'Gs 200.000',
    cambio: 'Gs 20.000',
  }
}

type EstadoQz = 'verificando' | 'listo' | 'caido'

export default function ImpresoraDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const config = useConfig()
  const nativo = esNativo() && impresoraNativaDisponible()
  const usarQz = !nativo && config.metodoImpresion === 'qztray'
  const [dispositivos, setDispositivos] = useState<DispositivoBluetooth[]>([])
  const [buscando, setBuscando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [estadoQz, setEstadoQz] = useState<EstadoQz>('verificando')
  const [impresorasQz, setImpresorasQz] = useState<string[]>([])
  const [buscandoQz, setBuscandoQz] = useState(false)

  const impresora = config.impresoraBluetooth

  async function revisarQz() {
    setBuscandoQz(true)
    setEstadoQz('verificando')
    const ok = await qzDisponible()
    if (!ok) {
      setEstadoQz('caido')
      setBuscandoQz(false)
      return
    }
    try {
      const lista = await listarImpresorasQz()
      setImpresorasQz(lista)
      setEstadoQz('listo')
    } catch {
      setEstadoQz('caido')
    } finally {
      setBuscandoQz(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setAviso(null)
    if (nativo) {
      setBuscando(true)
      listarImpresoras()
        .then(setDispositivos)
        .catch(() =>
          setAviso({ ok: false, texto: 'No se pudieron listar los dispositivos.' }),
        )
        .finally(() => setBuscando(false))
    } else if (config.metodoImpresion === 'qztray') {
      void revisarQz()
    }
  }, [open, nativo, config.metodoImpresion])

  // Estado en vivo: si QZ Tray se cierra a mitad de turno, se avisa al toque.
  useEffect(() => {
    if (!open || !usarQz) return
    const quitar = vigilarQz(() => setEstadoQz('caido'))
    return quitar
  }, [open, usarQz])

  async function probar() {
    setAviso(null)
    setProbando(true)
    try {
      if (config.metodoImpresion === 'qztray' && !nativo) {
        const res = await imprimirTicketQz(
          ticketPrueba(),
          config.anchoTicketPc,
        )
        setAviso(
          res.error
            ? { ok: false, texto: res.error }
            : {
                ok: true,
                texto: 'Ticket de prueba enviado a la impresora.',
              },
        )
      } else if (nativo) {
        if (!impresora.impresoraDireccion) {
          setAviso({ ok: false, texto: 'Elegí una impresora primero.' })
          return
        }
        const base64 = armarEscPosBase64(ticketPrueba(), 32)
        await imprimirConReintento(impresora.impresoraDireccion, base64)
        setAviso({ ok: true, texto: 'Ticket de prueba enviado a la impresora.' })
      } else {
        const res = await imprimirTicketPC(ticketPrueba(), config.anchoTicketPc)
        setAviso(
          res.error
            ? { ok: false, texto: res.error }
            : { ok: true, texto: 'Se abrió la ventana de impresión del navegador.' },
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
            Bluetooth directo
          </Button>
        )}
        {!nativo && (
          <Button
            type="button"
            variant={
              config.metodoImpresion === 'qztray' ? 'default' : 'outline'
            }
            onClick={() => {
              actualizarConfig({ metodoImpresion: 'qztray' })
              void revisarQz()
            }}
          >
            <Printer />
            QZ Tray (PC)
          </Button>
        )}
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
          : config.metodoImpresion === 'qztray'
            ? 'Al cobrar, la PC imprime silencioso por QZ Tray, sin diálogo ni driver.'
            : 'Al cobrar se muestra el ticket para imprimir desde la PC, por Bluetooth o copiarlo.'}
      </p>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-svh overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Impresora</DialogTitle>
          <DialogDescription>
            {nativo
              ? 'Elegí la impresora Bluetooth y la app imprime el ticket directo.'
              : config.metodoImpresion === 'qztray'
                ? 'QZ Tray imprime el ticket por la térmica de esta PC, silencioso y con corte.'
                : 'La impresora Bluetooth se configura desde la app del celular. En la PC se imprime con el diálogo del navegador.'}
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
                  No hay dispositivos. Vinculá la impresora en Ajustes →
                  Bluetooth del celular y volvé a abrir.
                </p>
              )}
              <div className="grid gap-1.5">
                {dispositivos.map((d) => {
                  const activo = d.address === impresora.impresoraDireccion
                  return (
                    <button
                      key={d.address}
                      type="button"
                      onClick={() =>
                        actualizarImpresoraBluetooth({
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

            {selectorMetodo}
          </div>
        ) : usarQz ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Impresoras detectadas</Label>
              {buscandoQz && (
                <p className="text-sm text-muted-foreground">Buscando…</p>
              )}
              {!buscandoQz &&
                estadoQz === 'listo' &&
                impresorasQz.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No se detectó ninguna impresora. Asegurate de que QZ Tray
                    esté abierto y que la térmica esté conectada a esta PC.
                  </p>
                )}
              <Select
                value={config.impresoraQz.nombre || undefined}
                onValueChange={(nombre) => actualizarImpresoraQz({ nombre })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elegí la térmica del ticket…" />
                </SelectTrigger>
                <SelectContent>
                  {impresorasQz.map((nombre) => (
                    <SelectItem key={nombre} value={nombre}>
                      {nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={buscandoQz}
                onClick={() => void revisarQz()}
              >
                <RotateCw
                  className={cn('size-4', buscandoQz && 'animate-spin')}
                />
                Volver a buscar impresoras
              </Button>
            </div>

            {estadoQz === 'caido' && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <WifiOff className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-1.5">
                  <p>
                    QZ Tray no está instalado o no está en ejecución en esta PC.
                  </p>
                  <ol className="list-decimal space-y-1 pl-4 text-xs">
                    <li>
                      Descargá e instalá QZ Tray desde{' '}
                      <a
                        href="https://qz.io/download/"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        qz.io/download
                      </a>
                      .
                    </li>
                    <li>
                      Abrí la app una vez (queda en la bandeja del sistema).
                    </li>
                    <li>
                      La primera impresión te pide confiar en el certificado de
                      Kahabox: marcá <b>«Recordar esta decisión»</b>.
                    </li>
                  </ol>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    asChild
                  >
                    <a
                      href="https://qz.io/download/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Download />
                      Ir a la descarga
                    </a>
                  </Button>
                </div>
              </div>
            )}

            {config.impresoraQz.nombre && (
              <p className="text-xs text-muted-foreground">
                Al cobrar se imprime silencioso en{' '}
                <span className="font-medium">
                  {config.impresoraQz.nombre}
                </span>
                .
              </p>
            )}

            {selectorMetodo}
          </div>
        ) : (
          <div className="space-y-4">
            <ol className="space-y-1.5 text-sm text-muted-foreground">
              <li>
                1. En el celular, entrá con el mismo usuario y abrí{' '}
                <b>Configuración → Impresora</b>.
              </li>
              <li>
                2. Elegí la impresora Bluetooth y el método{' '}
                <b>“Bluetooth directo”</b>.
              </li>
              <li>3. Acá elegí imprimir en la PC o copiar el ticket.</li>
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