import type { Moneda } from './format'

// Tasas expresadas como: cuántos guaraníes (Gs) vale UNA unidad de la moneda.
// Ej.: { USD: 7850 } → 1 US$ = 7.850 Gs.
export type Tasas = Record<Moneda, number>

export type Cotizaciones = Tasas & { actualizado_a: string }

/**
 * Cotizaciones "en tiempo real".
 *
 * Fase actual (demo local): devuelve cotizaciones aproximadas de referencia,
 * con timestamp de actualización fresco en cada llamada. Al conectar el
 * backend se reemplaza por el proveedor real (tabla cotizaciones en Supabase
 * o Edge Function que consume una API de cambio), manteniendo la misma firma.
 */
export async function obtenerCotizaciones(): Promise<Cotizaciones> {
  return {
    ...tasasBase(),
    actualizado_a: new Date().toISOString(),
  }
}

export function tasasBase(): Tasas {
  return {
    PYG: 1,
    USD: 7850,
    ARS: 8.4,
    BRL: 1420,
  }
}

export function aGs(monto: number, de: Moneda, tasas: Tasas): number {
  return monto * tasas[de]
}

export function desdeGs(montoGs: number, a: Moneda, tasas: Tasas): number {
  return montoGs / tasas[a]
}

export function convertir(
  monto: number,
  de: Moneda,
  a: Moneda,
  tasas: Tasas,
): number {
  return (monto * tasas[de]) / tasas[a]
}