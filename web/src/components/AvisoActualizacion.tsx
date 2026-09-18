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

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva versión disponible</DialogTitle>
          <DialogDescription>
            Hay una actualización de Kahabox Caja (v{info?.versionName}). Se
            descarga e instala automáticamente, sin perder la configuración.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAbierto(false)}>
            Ahora no
          </Button>
          <Button
            onClick={() => {
              if (!info) return
              setAbierto(false)
              void actualizarApp(info.url)
            }}
          >
            <Download />
            Actualizar ahora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}