/**
 * Construcción de tickets de venta para impresora térmica de 58mm.
 *
 * Ancho útil: 32 caracteres en fuente A (12x24 puntos / 384 puntos).
 * Las funciones devuelven texto plano listo para alinearse; la capa nativa
 * (imprimir.ts) traduce las líneas al builder ESC/POS de capacitor-thermal-printer.
 */

export const ANCHO_TICKET = 32

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

export function lineaSeparador(): string {
  return repetir('-', ANCHO_TICKET)
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

export function formatearItem(item: ItemTicket): string[] {
  const cabecera = item.detalle
    ? `${item.nombre} · ${item.detalle}`
    : item.nombre
  const lineas = cortarLineas(cabecera, ANCHO_TICKET - 8)
  const cantidad = `${item.cantidad} x ${item.precio} = ${item.total}`

  const ultima = lineas[lineas.length - 1]
  const espacio = ANCHO_TICKET - ultima.length - 1
  if (espacio >= cantidad.length) {
    return [
      ...lineas.slice(0, -1).map((l) => columnaIzq(l)),
      `${ultima} ${cantidad}`,
    ]
  }

  return [...lineas.map((l) => columnaIzq(l)), columnaDer(cantidad)]
}

export function armarTextoPlano(t: TicketVenta): string {
  const lineas: string[] = []
  lineas.push(centrar(t.nombreLocal))
  lineas.push('')
  lineas.push(centrar(t.fecha))
  lineas.push(centrar(t.numeroVenta))
  lineas.push(lineaSeparador())
  for (const item of t.items) lineas.push(...formatearItem(item))
  lineas.push(lineaSeparador())
  if (t.esCredito) lineas.push(centrar('* CRÉDITO / FIADO *'))
  lineas.push('')
  lineas.push(columnaDer(`TOTAL   ${t.total}`))
  lineas.push(`Metodo: ${t.metodosPago}`)
  if (t.recibido) lineas.push(columnaDer(`Recibido: ${t.recibido}`))
  if (t.cambio) lineas.push(columnaDer(`Cambio: ${t.cambio}`))
  lineas.push('')
  lineas.push('')
  lineas.push(centrar('Gracias por su compra!'))
  lineas.push(centrar('KAHABOX'))
  lineas.push('')
  lineas.push('')
  return lineas.join('\n')
}