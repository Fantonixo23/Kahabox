import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'

import {
  armarHtmlTicket,
  armarTextoPlano,
  columnasPorAnchoMm,
  type TicketVenta,
} from './ticket'
import { enviarTrabajoAEstacion } from './estacion'

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

/**
 * Imprime mandando el trabajo a la estación (celular/tablet con la app).
 * La PC solo inserta la fila en Supabase; la estación imprime por Bluetooth.
 */
export async function imprimirPorEstacion(
  ticket: TicketVenta,
  anchoMm: number,
): Promise<ResultadoImpresion> {
  const ancho = columnasPorAnchoMm(anchoMm)
  const texto = armarTextoPlano(ticket, ancho)
  const res = await enviarTrabajoAEstacion(ticket, ancho)
  return {
    texto,
    nativo: true,
    compartido: false,
    ...(res.ok ? {} : { error: res.error }),
  }
}

export async function imprimirTicketPC(
  ticket: TicketVenta,
  anchoMm: number,
): Promise<ResultadoImpresion> {
  const ancho = columnasPorAnchoMm(anchoMm)
  const texto = armarTextoPlano(ticket, ancho)
  try {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.srcdoc = armarHtmlTicket(ticket, anchoMm, ancho)
    document.body.appendChild(iframe)

    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          iframe.addEventListener('load', () => resolve(), { once: true })
        }),
        new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
      ])
    } catch {
      // Continúa aunque el evento load no dispare.
    }

    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    window.setTimeout(() => iframe.remove(), 60_000)
    return { texto, nativo: false, compartido: false }
  } catch (e) {
    return {
      texto,
      nativo: false,
      compartido: false,
      error:
        e instanceof Error
          ? e.message
          : 'No se pudo abrir el diálogo de impresión en la PC.',
    }
  }
}