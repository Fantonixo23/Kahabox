import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'

import { Camera, Flashlight, FlashlightOff, RotateCcw, ScanBarcode } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Solo códigos de barras de producto (EAN/UPC). El QR y otros formatos se
// ignoran a propósito: evitan que se lean URLs o textos raros. Estos formatos
// validan su dígito verificador, así que un "código" leído mal (ej. una
// lectura parcial) directamente no se devuelve.
const formatos = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
]

type Estado = 'arrancando' | 'leyendo' | 'error'

export default function BarcodeScanner({
  onDetected,
  trigger,
}: {
  onDetected: (code: string) => void
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [estado, setEstado] = useState<Estado>('arrancando')
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('default')
  const [torch, setTorch] = useState(false)
  const [torchDisponible, setTorchDisponible] = useState(false)
  const [exito, setExito] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  const parar = useCallback(() => {
    try {
      controlsRef.current?.stop()
    } catch {
      // La cámara puede estar ya liberada.
    }
    controlsRef.current = null
    setTorchDisponible(false)
    setTorch(false)
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [])

  const completar = useCallback(
    (code: string) => {
      setExito(code)
      parar()
      timerRef.current = window.setTimeout(() => {
        setOpen(false)
        onDetected(code)
      }, 320)
    },
    [onDetected, parar],
  )

  const arrancar = useCallback(
    async (device: string) => {
      setEstado('arrancando')
      setError('')
      setExito('')
      parar()

      try {
        const video = videoRef.current
        if (!video) throw new Error('No se encontró la vista previa de la cámara.')

        const hints = new Map()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formatos)
        hints.set(DecodeHintType.TRY_HARDER, true)

        const reader = new BrowserMultiFormatReader(hints)
        const controls = await reader.decodeFromVideoDevice(
          device === 'default' ? undefined : device,
          video,
          (result) => {
            const code = result?.getText()
            if (!code) return
            completar(code)
          },
        )

        controlsRef.current = controls
        setTorchDisponible(Boolean(controls.switchTorch))
        setEstado('leyendo')
      } catch (e) {
        const nombre = e instanceof Error ? e.name : ''
        const mensaje =
          nombre === 'NotAllowedError' || nombre === 'SecurityError'
            ? 'Permisos de cámara denegados. Habilitá la cámara para Kahabox en la configuración del navegador y volvé a intentar.'
            : e instanceof Error
              ? e.message
              : 'No se pudo acceder a la cámara.'
        setError(mensaje)
        setEstado('error')
      }
    },
    [completar, parar],
  )

  useEffect(() => {
    if (!open) return
    let activo = true
    // Cerrar el teclado que quedó abierto por el foco del campo anterior.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    setManual('')
    setEstado('arrancando')
    setError('')

    if (!window.isSecureContext) {
      setEstado('error')
      setError(
        'La cámara requiere HTTPS. Abrí la app con https (en dev: `npm run dev` ya sirve https) y volvé a intentar.',
      )
      return
    }

    ;(async () => {
      try {
        const lista = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === 'videoinput',
        )
        if (!activo) return
        setDevices(lista)
        const trasera = lista.find((d) =>
          /back|traseira|rear|environment|lens/i.test(d.label),
        )
        if (trasera) setDeviceId(trasera.deviceId)
        await arrancar(trasera?.deviceId ?? 'default')
      } catch (e) {
        if (!activo) return
        setError(e instanceof Error ? e.message : 'No se pudo acceder a la cámara.')
        setEstado('error')
      }
    })()

    return () => {
      activo = false
      parar()
    }
  }, [open, arrancar, parar])

  async function toggleTorch() {
    const controls = controlsRef.current
    if (!controls?.switchTorch) return
    try {
      await controls.switchTorch(!torch)
      setTorch(!torch)
    } catch {
      // Algunas cámaras no soportan la linterna.
    }
  }

  function usarManual(event: React.FormEvent) {
    event.preventDefault()
    const code = manual.trim()
    if (!code) return
    parar()
    setOpen(false)
    onDetected(code)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) parar()
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="icon-sm" aria-label="Escanear código de barras">
            <ScanBarcode />
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escanear código de barras</DialogTitle>
          <DialogDescription>
            Lee solo códigos de barras de producto (EAN/UPC): apuntá al código y
            se lee solo, aunque no quede perfectamente en el rectángulo. Si la
            cámara no arranca, podés cargarlo a mano abajo.
          </DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-md border bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="aspect-[4/3] w-full object-cover"
          />
          {estado === 'leyendo' && (
            <div className="pointer-events-none absolute inset-0 select-none">
              <div
                className={`absolute left-1/2 top-1/2 h-2/5 w-4/5 -translate-x-1/2 -translate-y-1/2 border-2 ${
                  exito ? 'border-emerald-400' : 'border-white/80'
                }`}
              >
                <div className="absolute inset-x-1 top-1 h-[3px] rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.7)] animate-[scan-line_1.6s_ease-in-out_infinite_alternate]" />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p className="text-center text-[11px] leading-tight text-white">
                  {exito ? (
                    <span className="font-semibold text-emerald-300">¡Leído! {exito}</span>
                  ) : (
                    <>
                      Apuntá al código: se lee solo (solo EAN/UPC, se ignora el
                      QR y otros textos). Si está borroso, prendé la linterna.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {estado === 'arrancando' && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Camera className="size-4 animate-pulse" />
            Activando la cámara…
          </p>
        )}

        {estado === 'error' && (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
            <p className="text-xs text-destructive">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void arrancar(deviceId)}
            >
              <RotateCcw />
              Intentar de nuevo
            </Button>
          </div>
        )}

        {estado === 'leyendo' && (
          <div className="flex items-end gap-2">
            {devices.length > 1 && (
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="sc-camara">Cámara</Label>
                <Select
                  value={deviceId}
                  onValueChange={(id) => {
                    setDeviceId(id)
                    void arrancar(id)
                  }}
                >
                  <SelectTrigger id="sc-camara" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {devices.map((d) => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>
                        {d.label || d.deviceId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {torchDisponible && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void toggleTorch()}
                aria-label={torch ? 'Apagar linterna' : 'Prender linterna'}
              >
                {torch ? <FlashlightOff /> : <Flashlight />}
              </Button>
            )}
          </div>
        )}

        <form onSubmit={usarManual} className="space-y-1.5">
          <Label htmlFor="sc-manual">O ingresá el código a mano</Label>
          <div className="flex gap-2">
            <Input
              id="sc-manual"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="7791234000011"
            />
            <Button type="submit" variant="outline">
              Usar
            </Button>
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}