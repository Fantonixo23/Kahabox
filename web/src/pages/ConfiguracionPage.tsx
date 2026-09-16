import { useState } from 'react'

import {
  EyeOff,
  FileKey2,
  Info,
  ShieldCheck,
  Store as StoreIcon,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from 'cn'
import {
  MODULOS,
  actualizarConfig,
  nombreNegocio,
  useConfig,
  type CertificadoSifen,
} from '@/lib/config'

export default function ConfiguracionPage() {
  const config = useConfig()
  const [nombre, setNombre] = useState(config.nombreNegocio)
  const [mensaje, setMensaje] = useState<string | null>(null)

  function guardarNombre() {
    actualizarConfig({ nombreNegocio: nombre.trim() })
    setMensaje('Nombre del negocio actualizado.')
    window.setTimeout(() => setMensaje(null), 2500)
  }

  function alternarModulo(ruta: string) {
    const ocultos = config.modulosOcultos.includes(ruta)
      ? config.modulosOcultos.filter((r) => r !== ruta)
      : [...config.modulosOcultos, ruta]
    actualizarConfig({ modulosOcultos: ocultos })
  }

  function actualizarCertificado(cert: CertificadoSifen) {
    actualizarConfig({ certificado: cert })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Nombre del negocio, facturación electrónica (SIFEN) y qué módulos querés ver.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StoreIcon className="size-4" />
            Nombre del negocio
          </CardTitle>
          <CardDescription>
            Aparece en el encabezado del ticket. Hoy se imprime:{' '}
            <span className="font-medium">{nombreNegocio()}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-nombre">Nombre (ej: «Ferretería El Tucán»)</Label>
            <Input
              id="cfg-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="KAHABOX"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={guardarNombre}>
              Guardar nombre
            </Button>
            {mensaje && (
              <span className="text-xs font-medium text-emerald-600">
                {mensaje}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            Facturación electrónica (SIFEN)
          </CardTitle>
          <CardDescription>
            De momento guardamos esta configuración. La emisión de facturas
            electrónicas de Paraguay se activa en una próxima etapa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Habilitar SIFEN</p>
              <p className="text-xs text-muted-foreground">
                Emitir facturas electrónicas al cobrar.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.sifenActivo}
              onClick={() => actualizarConfig({ sifenActivo: !config.sifenActivo })}
              className={cn(
                'flex h-6 w-11 shrink-0 items-center rounded-full border px-0.5 transition-colors',
                config.sifenActivo
                  ? 'justify-end border-primary bg-primary'
                  : 'justify-start border-input bg-muted',
              )}
            >
              <span
                className={cn(
                  'size-5 rounded-full transition-colors',
                  config.sifenActivo ? 'bg-primary-foreground' : 'bg-background',
                )}
              />
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cfg-ruc">RUC de la empresa</Label>
            <Input
              id="cfg-ruc"
              value={config.sifenRuc}
              onChange={(e) =>
                actualizarConfig({ sifenRuc: e.target.value.replace(/\D/g, '') })
              }
              placeholder="80000000-0"
              inputMode="numeric"
            />
          </div>

          <CertificadoBlock
            certificado={config.certificado}
            onCambiar={actualizarCertificado}
            onQuitar={() => actualizarConfig({ certificado: null })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="size-4" />
            Módulos visibles
          </CardTitle>
          <CardDescription>
            Ocultá los módulos que no usás: se quedan fuera de la barra de
            navegación.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {MODULOS.map((m) => {
            const oculto = config.modulosOcultos.includes(m.ruta)
            return (
              <label
                key={m.ruta}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2.5"
              >
                <span className="text-sm font-medium">{m.label}</span>
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={!oculto}
                  onChange={() => alternarModulo(m.ruta)}
                />
              </label>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="size-4" />
            Datos de la demo
          </CardTitle>
          <CardDescription>
            Trabajás con datos de demostración guardados en este navegador.
            Conectá la base de datos real (Supabase) para producción.
          </CardDescription>
        </CardHeader>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Los cambios se guardan automáticamente en este dispositivo.
      </p>
    </div>
  )
}

function CertificadoBlock({
  certificado,
  onCambiar,
  onQuitar,
}: {
  certificado: CertificadoSifen | null
  onCambiar: (cert: CertificadoSifen) => void
  onQuitar: () => void
}) {
  async function leerArchivo(archivo?: File | null) {
    if (!archivo) return
    const contenido: string = await new Promise((resolve, reject) => {
      const lector = new FileReader()
      lector.onload = () => resolve(String(lector.result ?? ''))
      lector.onerror = () => reject(new Error('No se pudo leer el archivo.'))
      lector.readAsDataURL(archivo)
    })
    onCambiar({
      nombre: archivo.name,
      tamano: archivo.size,
      tipo: archivo.type || 'p12',
      base64: contenido,
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Certificado digital (SIFEN)</Label>
        {certificado && (
          <Button type="button" variant="ghost" size="sm" onClick={onQuitar}>
            <Trash2 />
            Quitar
          </Button>
        )}
      </div>

      {certificado ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
          <FileKey2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{certificado.nombre}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {(certificado.tamano / 1024).toFixed(1)} KB
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Todavía no cargaste un certificado. Acepta archivos .p12 / .pfx.
        </p>
      )}

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
        <FileKey2 className="size-4" />
        {certificado ? 'Reemplazar certificado' : 'Cargar certificado'}
        <input
          type="file"
          accept=".p12,.pfx,.pem,.cer"
          className="sr-only"
          onChange={(e) => void leerArchivo(e.target.files?.[0])}
        />
      </label>
    </div>
  )
}