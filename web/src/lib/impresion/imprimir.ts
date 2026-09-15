import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'

import { armarTextoPlano, type TicketVenta } from './ticket'

export type ResultadoImpresion = {
  texto: string
  nativo: boolean
  compartido: boolean
  error?: string
}

/**
 * Imprimir = compartir el texto del ticket y elegir RawBT en el menú de Android.
 * RawBT recibe texto plano (ESC/POS) y lo manda a la impresora Bluetooth.
 * Sin RawBT instalado, el menú de compartir deja elegir otra app que lo use.
 */
export async function imprimirTicket(
  ticket: TicketVenta,
): Promise<ResultadoImpresion> {
  const texto = armarTextoPlano(ticket)

  try {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share')) {
      await Share.share({ dialogTitle: 'Imprimir ticket', text: texto })
      return { texto, nativo: true, compartido: true }
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text: texto })
      return { texto, nativo: true, compartido: true }
    }
    return {
      texto,
      nativo: false,
      compartido: false,
      error:
        'Tu navegador no tiene el menú "Compartir". En el celular sí aparece y ahí elegís RawBT.',
    }
  } catch (e) {
    const error =
      e instanceof Error && e.name === 'AbortError'
        ? 'Compartir cancelado.'
        : e instanceof Error
          ? e.message
          : 'No se pudo abrir el menú de compartir.'
    return { texto, nativo: false, compartido: false, error }
  }
}

export async function copiarTicket(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}