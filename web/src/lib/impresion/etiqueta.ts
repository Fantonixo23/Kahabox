/**
 * Etiquetas de códigos de barras para impresora térmica.
 *
 * En la app nativa (celular/tablet Android) las etiquetas se imprimen como
 * imagen ESC/POS raster (GS v 0): se dibuja la etiqueta en un canvas de 384
 * puntos de ancho (impresora de 58 mm) y se mandan los bits empaquetados a la
 * impresora Bluetooth configurada. La PC sigue usando el diálogo del navegador.
 */

import JsBarcode from 'jsbarcode'

import * as escpos from './escpos'
import {
  imprimirConReintento,
  impresoraNativaDisponible,
} from './nativo'
import { leerConfig } from '@/lib/config'

/** Ancho de la etiqueta en puntos (58 mm). Debe ser múltiplo de 8. */
export const ANCHO_RASTER = 384

export type EtiquetaRaster = {
  codigo: string
  nombre: string
  detalle?: string
}

/** Corta texto a líneas que quepan en `maxAncho` píxeles. */
function cortarTexto(
  ctx: CanvasRenderingContext2D,
  texto: string,
  maxAncho: number,
): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return []
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (actual === '' || ctx.measureText(prueba).width <= maxAncho) {
      actual = prueba
    } else {
      lineas.push(actual)
      actual = palabra
    }
  }
  if (actual) lineas.push(actual)
  return lineas.map((l) => l.slice(0, 90))
}

/**
 * Dibuja la etiqueta en un canvas y devuelve la imagen 1bpp lista para
 * `escpos.imagenRaster` (bits empaquetados, una fila tras otra).
 */
export async function rasterizarEtiqueta(
  etiqueta: EtiquetaRaster,
): Promise<{ ancho: number; alto: number; bits: Uint8Array }> {
  const ancho = ANCHO_RASTER
  const margen = 20
  const altoNombre = 48
  const altoDetalle = 36
  const altoCodigoTexto = 44

  const medir = document.createElement('canvas').getContext('2d')
  if (!medir) throw new Error('No se pudo dibujar la etiqueta.')
  medir.font = 'bold 44px Arial, sans-serif'
  const lineasNombre = cortarTexto(medir, etiqueta.nombre, ancho - margen * 2)
  medir.font = '30px Arial, sans-serif'
  const lineasDetalle = etiqueta.detalle
    ? cortarTexto(medir, etiqueta.detalle, ancho - margen * 2)
    : []

  const yNombre = lineasNombre.length * altoNombre
  const yDetalle = lineasDetalle.length * altoDetalle
  const yBarra = Math.max(130, ancho - yNombre - yDetalle - altoCodigoTexto - margen * 2)
  const altoTotal = margen + yNombre + yDetalle + yBarra + altoCodigoTexto + margen

  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = altoTotal
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo dibujar la etiqueta.')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, ancho, altoTotal)

  let y = margen
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  if (lineasNombre.length > 0) {
    ctx.fillStyle = '#000'
    ctx.font = 'bold 44px Arial, sans-serif'
    for (const linea of lineasNombre) {
      ctx.fillText(linea, ancho / 2, y + 42)
      y += altoNombre
    }
  }

  if (lineasDetalle.length > 0) {
    ctx.fillStyle = '#333'
    ctx.font = '30px Arial, sans-serif'
    for (const linea of lineasDetalle) {
      ctx.fillText(linea, ancho / 2, y + 32)
      y += altoDetalle
    }
  }

  const sub = document.createElement('canvas')
  sub.width = ancho - margen * 2
  sub.height = yBarra
  JsBarcode(sub, etiqueta.codigo, {
    format: 'CODE128',
    lineColor: '#000',
    background: '#fff',
    width: 3,
    height: Math.max(60, yBarra - 8),
    displayValue: false,
    margin: 0,
  })
  ctx.drawImage(sub, margen, y)

  ctx.fillStyle = '#000'
  ctx.font = 'bold 34px monospace'
  ctx.fillText(etiqueta.codigo, ancho / 2, altoTotal - margen - 6)

  const imagen = ctx.getImageData(0, 0, ancho, altoTotal).data
  const bytesPorFila = Math.trunc(ancho / 8)
  const bits = new Uint8Array(bytesPorFila * altoTotal)
  for (let py = 0; py < altoTotal; py += 1) {
    for (let px = 0; px < ancho; px += 1) {
      const i = (py * ancho + px) * 4
      const luminancia = (imagen[i] + imagen[i + 1] + imagen[i + 2]) / 3
      if (luminancia < 128) {
        // GS v 0 empaqueta cada fila con el bit de mayor peso (MSB)
        // como el punto más a la izquierda.
        bits[py * bytesPorFila + (px >> 3)] |= 0x80 >> (px & 7)
      }
    }
  }

  return { ancho, alto: altoTotal, bits }
}

/** Arma los bytes ESC/POS para una tanda de etiquetas (una tras otra). */
export async function armarEtiquetasEscPos(
  etiquetas: EtiquetaRaster[],
): Promise<Uint8Array> {
  const partes: Uint8Array[] = [escpos.inicializar()]
  for (let i = 0; i < etiquetas.length; i += 1) {
    const r = await rasterizarEtiqueta(etiquetas[i])
    partes.push(escpos.imagenRaster(r.ancho, r.alto, r.bits))
    partes.push(escpos.alimentar(1))
  }
  partes.push(escpos.cortar())
  return escpos.concatenar(partes)
}

export async function armarEtiquetasEscPosBase64(
  etiquetas: EtiquetaRaster[],
): Promise<string> {
  return escpos.aBase64(await armarEtiquetasEscPos(etiquetas))
}

export type ResultadoEtiquetas = { ok: boolean; error?: string }

/**
 * Imprime la tanda de etiquetas directo por Bluetooth desde la app nativa.
 * Se conecta a la impresora configurada en Configuración → Impresora.
 */
export async function imprimirEtiquetasBluetooth(
  etiquetas: EtiquetaRaster[],
): Promise<ResultadoEtiquetas> {
  if (etiquetas.length === 0) {
    return { ok: false, error: 'Todavía no generaste ninguna etiqueta.' }
  }
  if (!impresoraNativaDisponible()) {
    return {
      ok: false,
      error:
        'La impresión por Bluetooth se hace desde la app Kahabox instalada en el celular o tablet Android.',
    }
  }

  const direccion = leerConfig().impresoraBluetooth.impresoraDireccion
  if (!direccion) {
    return {
      ok: false,
      error:
        'Configurá la impresora Bluetooth en Configuración → Impresora y volvé a intentar.',
    }
  }

  try {
    await imprimirConReintento(
      direccion,
      await armarEtiquetasEscPosBase64(etiquetas),
    )
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : 'No se pudo imprimir por Bluetooth.',
    }
  }
}