/**
 * Construcción de tickets de venta para impresora térmica.
 *
 * `armarTextoPlano` devuelve el ticket como texto (vista previa y copiar).
 * `armarEscPos` devuelve los bytes ESC/POS reales, que son los que se mandan al
 * puerto de la impresora.
 *
 * Ancho útil por fuente A: 32 columnas en 58mm y 48 en 80mm. Elegí siempre el
 * ancho que coincida con la impresora física: si se arma a 48 columnas pero la
 * impresora es de 58mm, cada línea de 48 caracteres rebasa y se corta.
 *
 * Cada ítem se imprime en dos renglones: el nombre arriba y abajo la cantidad
 * con su precio (izquierda) y el total del ítem (derecha). Así el total se ve
 * siempre y ninguna línea excede las columnas de la impresora.
 */

import * as escpos from './escpos'
import type { Alineacion } from './escpos'

export const ANCHO_58 = 32
export const ANCHO_80 = 48
export const ANCHO_TICKET = ANCHO_58

export function columnasPorAnchoMm(anchoMm: number): number {
  return anchoMm >= 76 ? ANCHO_80 : ANCHO_58
}

export type ItemTicket = {
  nombre: string
  detalle?: string | null
  cantidad: number
  precio: string
  total: string
}

export type TicketVenta = {
  nombreLocal: string
  fecha: string
  numeroVenta: string
  items: ItemTicket[]
  total: string
  metodosPago: string
  recibido?: string
  cambio?: string
  esCredito?: boolean
}

export function repetir(char: string, n: number): string {
  return char.repeat(Math.max(0, n))
}

export function lineaSeparador(ancho = ANCHO_TICKET): string {
  return repetir('-', ancho)
}

export function columnaIzq(texto: string, ancho = ANCHO_TICKET): string {
  return texto.slice(0, ancho).padEnd(ancho, ' ')
}

export function columnaDer(texto: string, ancho = ANCHO_TICKET): string {
  return texto.slice(0, ancho).padStart(ancho, ' ')
}

export function centrar(texto: string, ancho = ANCHO_TICKET): string {
  const t = texto.slice(0, ancho)
  const restante = ancho - t.length
  if (restante <= 0) return t
  const izq = Math.floor(restante / 2)
  return repetir(' ', izq) + t + repetir(' ', restante - izq)
}

export function cortarLineas(texto: string, ancho = ANCHO_TICKET): string[] {
  const lineas: string[] = []
  for (const linea of texto.split('\n')) {
    let resto = linea
    while (resto.length > ancho) {
      lineas.push(resto.slice(0, ancho))
      resto = resto.slice(ancho)
    }
    lineas.push(resto)
  }
  return lineas
}

export function formatearItem(
  item: ItemTicket,
  ancho = ANCHO_TICKET,
): string[] {
  const cabecera = item.detalle
    ? `${item.nombre} · ${item.detalle}`
    : item.nombre
  const lineas = cortarLineas(cabecera, ancho).map((l) => columnaIzq(l, ancho))

  const anchoTotal = Math.min(14, Math.max(1, ancho - 1))
  const cantidad = `${item.cantidad} x ${item.precio}`
  lineas.push(
    columnaIzq(cantidad, Math.max(1, ancho - anchoTotal)) +
      columnaDer(item.total, anchoTotal),
  )
  return lineas
}

export function filaEtiquetaValor(
  etiqueta: string,
  valor: string,
  anchoEtiqueta = 12,
  ancho = ANCHO_TICKET,
): string {
  return (
    columnaIzq(etiqueta, anchoEtiqueta) +
    columnaDer(valor, Math.max(1, ancho - anchoEtiqueta))
  )
}

export function armarTextoPlano(
  t: TicketVenta,
  ancho = ANCHO_TICKET,
): string {
  const lineas: string[] = []
  lineas.push(centrar(t.nombreLocal, ancho))
  lineas.push('')
  lineas.push(centrar(t.fecha, ancho))
  lineas.push(centrar(t.numeroVenta, ancho))
  lineas.push(lineaSeparador(ancho))
  for (const item of t.items) lineas.push(...formatearItem(item, ancho))
  lineas.push(lineaSeparador(ancho))
  if (t.esCredito) lineas.push(centrar('* CRÉDITO / FIADO *', ancho))
  lineas.push('')
  lineas.push(filaEtiquetaValor('TOTAL', t.total, 12, ancho))
  lineas.push(`Metodo: ${t.metodosPago}`)
  if (t.recibido) lineas.push(filaEtiquetaValor('Recibido', t.recibido, 12, ancho))
  if (t.cambio) lineas.push(filaEtiquetaValor('Cambio', t.cambio, 12, ancho))
  lineas.push('')
  lineas.push('')
  lineas.push(centrar('Gracias por su compra!', ancho))
  lineas.push(centrar('KAHABOX', ancho))
  lineas.push('')
  lineas.push('')
  return lineas.join('\n')
}

export type OperacionTicket =
  | {
      tipo: 'texto'
      texto: string
      alineacion?: Alineacion
      negrita?: boolean
      ancho?: number
      alto?: number
    }
  | { tipo: 'separador'; caracter?: string }
  | { tipo: 'alimentar'; lineas: number }
  | { tipo: 'cortar' }

export function armarOperaciones(
  t: TicketVenta,
  ancho = ANCHO_TICKET,
): OperacionTicket[] {
  const ops: OperacionTicket[] = []
  const texto = (
    valor: string,
    extra?: Omit<Extract<OperacionTicket, { tipo: 'texto' }>, 'tipo' | 'texto'>,
  ) => {
    const op: OperacionTicket = { tipo: 'texto', texto: valor, ...extra }
    ops.push(op)
  }

  texto(t.nombreLocal, { alineacion: 'centro' })
  texto('', { alineacion: 'centro' })
  texto(t.fecha, { alineacion: 'centro' })
  texto(t.numeroVenta, { alineacion: 'centro' })
  ops.push({ tipo: 'separador' })
  for (const item of t.items) {
    for (const linea of formatearItem(item, ancho)) texto(linea)
  }
  ops.push({ tipo: 'separador' })
  if (t.esCredito) {
    texto('* CRÉDITO / FIADO *', { alineacion: 'centro', negrita: true })
  }
  texto('')
  // El TOTAL usa fuente doble (ancho 2): la línea debe ocupar la mitad de las
  // columnas para que duplicada entre justa y no rebase la impresora.
  const maxDoble = Math.floor(ancho / 2)
  texto(centrar(`TOTAL ${t.total}`.slice(0, maxDoble), maxDoble), {
    negrita: true,
    ancho: 2,
    alto: 2,
  })
  texto(`Metodo: ${t.metodosPago}`)
  if (t.recibido) texto(filaEtiquetaValor('Recibido', t.recibido, 12, ancho))
  if (t.cambio) texto(filaEtiquetaValor('Cambio', t.cambio, 12, ancho))
  texto('')
  texto('')
  texto('Gracias por su compra!', { alineacion: 'centro' })
  texto('KAHABOX', { alineacion: 'centro' })
  ops.push({ tipo: 'alimentar', lineas: 3 })
  ops.push({ tipo: 'cortar' })
  return ops
}

export function armarEscPos(
  t: TicketVenta,
  ancho = ANCHO_TICKET,
): Uint8Array {
  const partes: Uint8Array[] = [
    escpos.inicializar(),
    escpos.codepage(escpos.CODIFICACION_PC850),
  ]
  let alineacion: Alineacion = 'izq'
  let negrita = false
  let anchoFuente = 1
  let altoFuente = 1

  const escribir = (op: Extract<OperacionTicket, { tipo: 'texto' }>) => {
    const alineacionOp = op.alineacion ?? 'izq'
    if (alineacionOp !== alineacion) {
      partes.push(escpos.alinear(alineacionOp))
      alineacion = alineacionOp
    }
    const negritaOp = op.negrita ?? false
    if (negritaOp !== negrita) {
      partes.push(escpos.negrita(negritaOp))
      negrita = negritaOp
    }
    const anchoOp = op.ancho ?? 1
    const altoOp = op.alto ?? 1
    if (anchoOp !== anchoFuente || altoOp !== altoFuente) {
      partes.push(escpos.tamano(anchoOp, altoOp))
      anchoFuente = anchoOp
      altoFuente = altoOp
    }
    partes.push(escpos.codificarTexto(op.texto))
    partes.push(escpos.nuevaLinea())
  }

  for (const op of armarOperaciones(t, ancho)) {
    if (op.tipo === 'texto') {
      escribir(op)
    } else if (op.tipo === 'separador') {
      escribir({
        tipo: 'texto',
        texto: repetir(op.caracter ?? '-', ancho),
        alineacion: 'izq',
      })
    } else if (op.tipo === 'alimentar') {
      partes.push(escpos.alimentar(op.lineas))
    } else if (op.tipo === 'cortar') {
      partes.push(escpos.cortar())
    }
  }
  return escpos.concatenar(partes)
}

export function armarEscPosBase64(
  t: TicketVenta,
  ancho = ANCHO_TICKET,
): string {
  return escpos.aBase64(armarEscPos(t, ancho))
}

const MM_A_PX = 3.77953

export function armarHtmlTicket(
  t: TicketVenta,
  anchoMm: number,
  ancho = ANCHO_TICKET,
): string {
  const texto = armarTextoPlano(t, ancho)
  const fontPx =
    Math.round((((anchoMm * MM_A_PX) / ancho) / 0.6) * 10) / 10
  const escapar = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Ticket ${t.numeroVenta}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; }
  @page { size: auto; margin: 2mm; }
  .ticket {
    width: ${anchoMm}mm;
    max-width: 100%;
    margin: 0 auto;
    padding: 2mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: ${fontPx}px;
    line-height: 1.35;
    white-space: pre;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    body { background: #fff; }
  }
</style>
</head>
<body>
<pre class="ticket">${escapar(texto)}</pre>
</body>
</html>`
}
