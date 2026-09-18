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

// Los formatos de barras lineales (1D) más usados en retail y logística.
// A propósito NO se incluye QR, Data Matrix, PDF417, Aztec ni ningún otro
// código 2D: esos casi nunca identifican un producto individual (suelen ser
// URLs, pagos o datos de envío) y aceptar cualquier formato solo suma falsos
// positivos al apuntar la cámara.
//   EAN-13 / EAN-8 / UPC-A / UPC-E → estándar mundial de góndola de retail.
//   CODE-128                       → el más común en logística/depósito.
//   CODE-39                        → muy usado en indumentaria e industria.
//   ITF (Interleaved 2 of 5)       → cajas y bultos de mercadería.
//   CODABAR                        → todavía aparece en algunos rubros.
//   RSS-14 / RSS expandido (GS1 DataBar) → productos de peso/talle variable.
// EAN/UPC validan dígito verificador propio; los demás formatos no siempre
// lo tienen, por eso la confirmación por repetición de abajo importa para
// todos, no solo para el motor nativo.
const formatos = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.RSS_14,
  BarcodeFormat.RSS_EXPANDED,
]

// --- Motor nativo (BarcodeDetector) -----------------------------------
//
// Chrome/Edge en Android y Safari 17+ en iPhone traen un detector de
// códigos de barras nativo del sistema operativo — en Android es
// literalmente el modelo de IA de Google ML Kit corriendo on-device.
// Gratis, sin cuenta ni API key, y bastante más tolerante a cuadros
// borrosos, en ángulo o con poca luz que un decodificador por patrones
// puro como ZXing. Donde no está disponible, se cae automático a ZXing
// (motor de siempre) más abajo.
//
// Los nombres van en el formato string que exige la API del navegador, que
// no siempre coincide 1 a 1 con el enum de ZXing (ej.: no incluye GS1
// DataBar). Cuando el motor nativo no cubre un formato, ZXing sigue
// cubriéndolo como fallback general.
const FORMATOS_NATIVOS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'codabar',
]

interface DeteccionNativa {
  rawValue: string
}
interface DetectorNativo {
  detect(fuente: CanvasImageSource): Promise<DeteccionNativa[]>
}
type DetectorNativoCtor = (new (opciones: { formats: string[] }) => DetectorNativo) & {
  getSupportedFormats?: () => Promise<string[]>
}

function obtenerCtorNativo(): DetectorNativoCtor | null {
  return (
    (window as unknown as { BarcodeDetector?: DetectorNativoCtor }).BarcodeDetector ??
    null
  )
}

async function formatosNativosSoportados(): Promise<string[] | null> {
  const Ctor = obtenerCtorNativo()
  if (!Ctor) return null
  try {
    const soportados = Ctor.getSupportedFormats
      ? await Ctor.getSupportedFormats()
      : FORMATOS_NATIVOS
    const utiles = FORMATOS_NATIVOS.filter((f) => soportados.includes(f))
    return utiles.length > 0 ? utiles : null
  } catch {
    return null
  }
}

// Cuántas veces seguidas hay que leer el mismo código antes de aceptarlo.
// Filtra lecturas sueltas erróneas (un cuadro de mala calidad que por
// casualidad matchea un patrón) casi sin demora real: a varias lecturas por
// segundo, dos coincidencias seguidas es cuestión de un instante cuando el
// código está bien enfocado.
const CONFIRMACIONES_REQUERIDAS = 2

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
  const controlsRef = useRef<IScannerControls | null>(null) // motor ZXing
  const streamRef = useRef<MediaStream | null>(null) // motor nativo
  const loopRef = useRef<number | undefined>(undefined) // bucle del motor nativo
  const timerRef = useRef<number | undefined>(undefined) // delay del "¡Leído!"
  const activoRef = useRef(false)
  const lecturaRef = useRef<{ code: string; veces: number }>({ code: '', veces: 0 })

  const parar = useCallback(() => {
    activoRef.current = false
    try {
      controlsRef.current?.stop()
    } catch {
      // La cámara puede estar ya liberada.
    }
    controlsRef.current = null

    if (loopRef.current !== undefined) {
      clearTimeout(loopRef.current)
      loopRef.current = undefined
    }
    streamRef.current?.getTracks().forEach((pista) => pista.stop())
    streamRef.current = null

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

  const confirmarLectura = useCallback(
    (code: string) => {
      if (!code) return
      const anterior = lecturaRef.current
      const veces = anterior.code === code ? anterior.veces + 1 : 1
      lecturaRef.current = { code, veces }
      if (veces >= CONFIRMACIONES_REQUERIDAS) {
        completar(code)
      }
    },
    [completar],
  )

  const arrancarNativo = useCallback(
    async (device: string, formatosSoportados: string[]) => {
      const video = videoRef.current
      if (!video) throw new Error('No se encontró la vista previa de la cámara.')

      const stream = await navigator.mediaDevices.getUserMedia({
        video:
          device === 'default'
            ? { facingMode: { ideal: 'environment' } }
            : { deviceId: { exact: device } },
      })
      streamRef.current = stream
      video.srcObject = stream
      await video.play()

      const Ctor = obtenerCtorNativo()
      if (!Ctor) throw new Error('Detector nativo no disponible.')
      const detector = new Ctor({ formats: formatosSoportados })

      const pista = stream.getVideoTracks()[0]
      const capacidades = pista.getCapabilities?.() as
        | (MediaTrackCapabilities & { torch?: boolean })
        | undefined
      setTorchDisponible(Boolean(capacidades?.torch))

      activoRef.current = true
      const ciclo = async () => {
        if (!activoRef.current) return
        try {
          const resultados = await detector.detect(video)
          if (resultados[0]?.rawValue) confirmarLectura(resultados[0].rawValue)
        } catch {
          // Cuadro no decodificable; se reintenta en el próximo ciclo.
        }
        if (activoRef.current) {
          loopRef.current = window.setTimeout(ciclo, 150)
        }
      }
      void ciclo()
      setEstado('leyendo')
    },
    [confirmarLectura],
  )

  const arrancarZXing = useCallback(
    async (device: string) => {
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
          if (code) confirmarLectura(code)
        },
      )

      controlsRef.current = controls
      setTorchDisponible(Boolean(controls.switchTorch))
      setEstado('leyendo')
    },
    [confirmarLectura],
  )

  const arrancar = useCallback(
    async (device: string) => {
      setEstado('arrancando')
      setError('')
      setExito('')
      lecturaRef.current = { code: '', veces: 0 }
      parar()

      try {
        const formatosSoportados = await formatosNativosSoportados()
        if (formatosSoportados) {
          await arrancarNativo(device, formatosSoportados)
        } else {
          await arrancarZXing(device)
        }
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
    [arrancarNativo, arrancarZXing, parar],
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
    const nuevoValor = !torch

    // Motor nativo: el track de cámara lo manejamos nosotros.
    if (streamRef.current) {
      const pista = streamRef.current.getVideoTracks()[0]
      try {
        await pista.applyConstraints({
          advanced: [{ torch: nuevoValor } as unknown as MediaTrackConstraintSet],
        })
        setTorch(nuevoValor)
      } catch {
        // Algunas cámaras no soportan la linterna.
      }
      return
    }

    // Motor ZXing: usa su propio helper.
    const controls = controlsRef.current
    if (!controls?.switchTorch) return
    try {
      await controls.switchTorch(nuevoValor)
      setTorch(nuevoValor)
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

      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Escanear código de barras</DialogTitle>
          <DialogDescription>
            Lee los códigos de barras de producto más comunes (EAN, UPC,
            CODE-128, CODE-39, ITF y otros) — no lee QR ni códigos 2D. Apuntá
            al código y se lee solo, aunque no quede perfectamente en el
            rectángulo. Si la cámara no arranca, podés cargarlo a mano abajo.
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
                <div className="absolute inset-x-1 top-1 h-[3px] rounded-full bg-emerald-400" />
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
            <Camera className="size-4" />
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