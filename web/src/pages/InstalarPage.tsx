import { Navigate } from 'react-router-dom'
import { Download, Printer, QrCode as QrIcon, Smartphone } from 'lucide-react'

import QrCode from '@/components/QrCode'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { esNativo } from '@/lib/impresion/nativo'

const APK_CANONICA = 'https://kahabox-web.vercel.app/kahabox-caja.apk'

function urlApk(): string {
  if (typeof window === 'undefined') return APK_CANONICA
  const { origin, hostname, protocol } = window.location
  if (/^https?:$/.test(protocol) && hostname !== 'localhost') {
    return `${origin}/kahabox-caja.apk`
  }
  return APK_CANONICA
}

const PASOS = [
  'Escaneá el código QR con la cámara del celular o tablet Android (o abrí el enlace).',
  'Descargá el archivo kahabox-caja.apk.',
  'Si Android lo pide, permití "Instalar apps de origen desconocido" para Chrome.',
  'Abrí Kahabox, iniciá sesión con tu usuario de siempre.',
  'En Configuración → Impresora, elegí la térmica Bluetooth y probá una impresión.',
]

export default function InstalarPage() {
  if (esNativo()) {
    return <Navigate to="/app/caja" replace />
  }

  const apk = urlApk()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Instalá Kahabox en tu dispositivo móvil
        </h1>
        <p className="text-sm text-muted-foreground">
          Instalá la app para imprimir los tickets por Bluetooth y usar el
          celular o tablet como caja.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-4" />
            Descargar la app (Android)
          </CardTitle>
          <CardDescription>
            Escaneá el QR desde el celular o tablet, o descargá el APK en este
            dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <QrCode value={apk} size={180} />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <QrIcon className="size-3.5" />
              Apuntá la cámara acá
            </span>
          </div>

          <div className="flex-1 space-y-3">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              {PASOS.map((paso) => (
                <li key={paso}>{paso}</li>
              ))}
            </ol>
            <Button asChild className="h-11 w-full sm:w-auto">
              <a href={apk} download>
                <Download />
                Descargar APK
              </a>
            </Button>
            <p className="truncate text-xs text-muted-foreground">{apk}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="size-4" />
            Imprimir desde la PC (QZ Tray)
          </CardTitle>
          <CardDescription>
            Para que la PC imprima el ticket en la térmica silencioso —sin
            diálogo ni driver de Windows— instalá QZ Tray una sola vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
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
            <li>Abrí la app una vez: queda en la bandeja del sistema.</li>
            <li>
              La primera impresión te pide confiar en el certificado de
              Kahabox: marcá <b>«Recordar esta decisión»</b>.
            </li>
            <li>
              En Configuración → Impresora elegí <b>«QZ Tray (PC)»</b> y la
              térmica del ticket.
            </li>
          </ol>
          <Button asChild className="h-11">
            <a
              href="https://qz.io/download/"
              target="_blank"
              rel="noreferrer"
            >
              <Download />
              Descargar QZ Tray
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="size-4" />
            ¿Para qué sirve la app?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            · Imprime el ticket automáticamente al cobrar en una impresora
            térmica Bluetooth (ESC/POS), sin instalar nada en la PC.
          </p>
          <p>
            · También imprime etiquetas de códigos de barras desde el módulo
            Códigos, directo por Bluetooth.
          </p>
          <p>
            · Si tu dispositivo no es Android, podés agregar Kahabox a la
            pantalla de inicio desde el menú del navegador (Compartir → Agregar
            a inicio) y usarlo como caja.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
