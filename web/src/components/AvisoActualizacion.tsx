import { useEffect, useState } from 'react'

import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  actualizarApp,
  buscarActualizacion,
  type InfoActualizacion,
} from '@/lib/actualizacion'

export function AvisoActualizacion() {
  const [info, setInfo] = useState<InfoActualizacion | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    buscarActualizacion()
      .then((resultado) => {
        if (activo && resultado) {
          setInfo(resultado)
          setAbierto(true)
        }
      })
      .catch(() => {
        // Sin conexión o sin metadatos: no molestar al usuario.
      })
    return () => {
      activo = false
    }
  }, [])

  async function instalar() {
    if (!info) return
    setError(null)
    try {
      await actualizarApp(info)
      setAbierto(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el APK.')
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva versión disponible</DialogTitle>
          <DialogDescription>
            Hay una actualización de Kahabox (v{info?.versionName}). Se
            descarga e instala automáticamente, sin perder la configuración.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-700">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)}>
            Ahora no
          </Button>
          <Button onClick={() => void instalar()}>
            <Download />
            Actualizar ahora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}