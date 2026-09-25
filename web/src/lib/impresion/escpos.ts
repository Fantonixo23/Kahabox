/**
 * Codificador ESC/POS puro (sin dependencias ni DOM).
 *
 * Devuelve bytes (Uint8Array) listos para mandar tal cual al puerto de la
 * impresora: Bluetooth SPP desde la app Android (plugin KahaboxPrinter) o el
 * diálogo del navegador en la PC.
 */

export type Alineacion = 'izq' | 'centro' | 'der'

export const CODIFICACION_PC850 = 2

const ALINEACION: Record<Alineacion, number> = { izq: 0, centro: 1, der: 2 }

/** Selector de página de códigos a CP850 (ESC t 2): acentos y ñ/Ñ en español. */
const CP850: Record<string, number> = {
  'Ç': 0x80,
  'ü': 0x81,
  'é': 0x82,
  'â': 0x83,
  'ä': 0x84,
  'à': 0x85,
  'å': 0x86,
  'ç': 0x87,
  'ê': 0x88,
  'ë': 0x89,
  'è': 0x8a,
  'ï': 0x8b,
  'î': 0x8c,
  'ì': 0x8d,
  'Ä': 0x8e,
  'Å': 0x8f,
  'É': 0x90,
  'æ': 0x91,
  'Æ': 0x92,
  'ô': 0x93,
  'ö': 0x94,
  'ò': 0x95,
  'û': 0x96,
  'ù': 0x97,
  'ÿ': 0x98,
  'Ö': 0x99,
  'Ü': 0x9a,
  'ø': 0x9b,
  '£': 0x9c,
  'Ø': 0x9d,
  '×': 0x9e,
  'ƒ': 0x9f,
  'á': 0xa0,
  'í': 0xa1,
  'ó': 0xa2,
  'ú': 0xa3,
  'ñ': 0xa4,
  'Ñ': 0xa5,
  'ª': 0xa6,
  'º': 0xa7,
  '¿': 0xa8,
  '®': 0xa9,
  '¬': 0xaa,
  '½': 0xab,
  '¼': 0xac,
  '¡': 0xad,
  '«': 0xae,
  '»': 0xaf,
  'Á': 0xb5,
  'Â': 0xb6,
  'À': 0xb7,
  '©': 0xb8,
  '¢': 0xbd,
  '¥': 0xbe,
  'Í': 0xd6,
  'Î': 0xd7,
  'Ï': 0xd8,
  'Ì': 0xde,
  'Ó': 0xe0,
  'Ô': 0xe2,
  'Ò': 0xe3,
  'õ': 0xe4,
  'Õ': 0xe5,
  'µ': 0xe6,
  'þ': 0xe7,
  'Þ': 0xe8,
  'Ú': 0xe9,
  'Û': 0xea,
  'Ù': 0xeb,
  'ý': 0xec,
  'Ý': 0xed,
  '´': 0xef,
  '±': 0xf1,
  '¾': 0xf3,
  '¶': 0xf4,
  '§': 0xf5,
  '÷': 0xf6,
  '¸': 0xf7,
  '°': 0xf8,
  '¨': 0xf9,
  '·': 0xfa,
  '¹': 0xfb,
  '³': 0xfc,
  '²': 0xfd,
}

export function inicializar(): Uint8Array {
  return Uint8Array.of(0x1b, 0x40)
}

export function alinear(a: Alineacion): Uint8Array {
  return Uint8Array.of(0x1b, 0x61, ALINEACION[a])
}

export function negrita(activo: boolean): Uint8Array {
  return Uint8Array.of(0x1b, 0x45, activo ? 1 : 0)
}

export function tamano(ancho: number, alto: number): Uint8Array {
  const w = Math.min(8, Math.max(1, Math.trunc(ancho)))
  const h = Math.min(8, Math.max(1, Math.trunc(alto)))
  return Uint8Array.of(0x1d, 0x21, ((w - 1) << 4) | (h - 1))
}

export function codepage(pagina: number): Uint8Array {
  return Uint8Array.of(0x1b, 0x74, Math.max(0, Math.trunc(pagina)))
}

export function alimentar(lineas = 1): Uint8Array {
  return Uint8Array.of(0x1b, 0x64, Math.min(255, Math.max(0, Math.trunc(lineas))))
}

export function nuevaLinea(): Uint8Array {
  return Uint8Array.of(0x0a)
}

export function cortar(): Uint8Array {
  return Uint8Array.of(0x1d, 0x56, 0x42, 0x00)
}

/**
 * Apertura de cajón de dinero (ESC p 0 25 250): pulso al pin 2 del conector
 * RJ11 de impresoras que tienen el cajón enchufado. Si el cajón no está, la
 * impresora ignora el comando sin problema.
 */
export function abrirCajon(): Uint8Array {
  return Uint8Array.of(0x1b, 0x70, 0x00, 0x19, 0xfa)
}

/**
 * Imagen rasterizada (GS v 0, modo normal): dibuja una matriz de puntos 1bpp
 * de `ancho` × `alto`. `ancho` debe ser múltiplo de 8 y `datos` traer
 * `ancho / 8` bytes por fila; en cada byte, el bit de mayor peso (MSB)
 * corresponde al punto de más a la izquierda (convención de GS v 0).
 *
 * Ojo: en el header de GS v 0, xL/xH es la cantidad de BYTES por fila (no de
 * puntos). Poner el ancho en puntos hace que la impresora lea de más y no
 * imprima la imagen.
 */
export function imagenRaster(
  ancho: number,
  alto: number,
  datos: Uint8Array,
): Uint8Array {
  const x = Math.max(8, Math.trunc(ancho))
  const y = Math.max(1, Math.trunc(alto))
  const bytesPorFila = Math.trunc(Math.ceil(x / 8))
  const esperados = bytesPorFila * y
  const fila = datos.length >= esperados ? datos : concatenar([datos, new Uint8Array(esperados - datos.length)])
  const xL = bytesPorFila & 0xff
  const xH = (bytesPorFila >> 8) & 0xff
  const yL = y & 0xff
  const yH = (y >> 8) & 0xff
  return concatenar([
    Uint8Array.of(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH),
    fila,
  ])
}

export function codificarTexto(texto: string): Uint8Array {
  const bytes = new Uint8Array(texto.length)
  for (let i = 0; i < texto.length; i += 1) {
    const char = texto[i]
    const code = char.charCodeAt(0)
    if (code <= 0x7f) {
      bytes[i] = code
    } else {
      const mapeado = CP850[char]
      bytes[i] = mapeado ?? 0x3f
    }
  }
  return bytes
}

export function concatenar(partes: Uint8Array[]): Uint8Array {
  let total = 0
  for (const parte of partes) total += parte.length
  const salida = new Uint8Array(total)
  let offset = 0
  for (const parte of partes) {
    salida.set(parte, offset)
    offset += parte.length
  }
  return salida
}

export function aBase64(bytes: Uint8Array): string {
  let binario = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binario += String.fromCharCode(bytes[i])
  }
  return btoa(binario)
}

export function desdeBase64(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i)
  }
  return bytes
}

export function bytesDeTexto(texto: string): Uint8Array {
  return codificarTexto(texto)
}
