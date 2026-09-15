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