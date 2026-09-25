export type Moneda = 'PYG' | 'USD' | 'ARS' | 'BRL'

export const MONEDAS: Array<{ codigo: Moneda; etiqueta: string }> = [
  { codigo: 'PYG', etiqueta: 'Guaraníes (Gs)' },
  { codigo: 'USD', etiqueta: 'Dólares (US$)' },
  { codigo: 'ARS', etiqueta: 'Pesos argentinos ($)' },
  { codigo: 'BRL', etiqueta: 'Reales (R$)' },
]

const formato: Record<
  Moneda,
  { simbolo: string; locale: string; decimales: number }
> = {
  PYG: { simbolo: 'Gs', locale: 'es-PY', decimales: 0 },
  USD: { simbolo: 'US$', locale: 'en-US', decimales: 2 },
  ARS: { simbolo: '$', locale: 'es-AR', decimales: 1 },
  BRL: { simbolo: 'R$', locale: 'pt-BR', decimales: 2 },
}

export function formatMoney(saldo: number, moneda: Moneda): string {
  const f = formato[moneda]
  return `${f.simbolo} ${saldo.toLocaleString(f.locale, {
    minimumFractionDigits: f.decimales,
    maximumFractionDigits: f.decimales,
  })}`
}

// Muestra un valor crudo ("3000" o "1234.5") con separador de miles: "3.000",
// "1.234,5". El estado del formulario sigue guardando el valor crudo.
export function formatearMiles(valor: string): string {
  if (!valor) return ''
  const [entero = '', ...resto] = valor.split('.')
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return resto.length === 0 ? conPuntos : `${conPuntos},${resto.join('')}`
}

// Convierte lo que el usuario escribe al valor crudo ("3000", "12.5") que
// espera Number(). El separador se deduce por posición en vez de asumir que el
// punto siempre es de miles: el último símbolo es decimal salvo que le sigan
// exactamente 3 dígitos, en cuyo caso es de miles. Así conviven las dos
// convenciones sin depender de la moneda — "12.50" y "1,234.56" valen 12.5 y
// 1234.56 (dólares), y "45.000" y "1.234,56" valen 45000 y 1234.56
// (guaraníes). Sin esto, escribir "12.50" en un pago en dólares devolvía
// "1250" y cobraba cien veces de más.
export function desformatearMonto(texto: string): string {
  const limpio = texto.replace(/[^\d.,-]/g, '')
  const negativo = limpio.startsWith('-')
  const grupos = limpio.replace(/-/g, '').split(/[.,]/).filter((g) => g !== '')
  if (grupos.length === 0) return negativo ? '-0' : ''

  const ultimo = grupos[grupos.length - 1]
  const esDecimal = grupos.length > 1 && ultimo.length !== 3
  const entero = grupos.slice(0, esDecimal ? -1 : grupos.length).join('')
  const decimal = esDecimal ? ultimo : ''
  const base = Number(entero || '0')

  return `${negativo && (base !== 0 || decimal) ? '-' : ''}${base}${
    decimal ? `.${decimal}` : ''
  }`
}

export function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const UMBRAL_STOCK_BAJO = 5

export type EstadoStock = 'ok' | 'bajo' | 'agotado'

export function estadoStock(cantidad: number): EstadoStock {
  if (cantidad <= 0) return 'agotado'
  if (cantidad <= UMBRAL_STOCK_BAJO) return 'bajo'
  return 'ok'
}