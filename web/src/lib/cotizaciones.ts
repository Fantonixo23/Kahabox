import { CapacitorHttp } from '@capacitor/core'

import type { Moneda } from './format'
import { leerConfig, type Tasas } from './config'
import { esNativo } from './impresion/nativo'

export type { Tasas }

export type Cotizaciones = Tasas & { actualizado_a: string }

/**
 * Cotizaciones del día.
 *
 * Según el modo elegido en Configuración:
 *   * manual: usa exactamente las tasas que cargó el usuario
 *     (cuántos guaraníes vale una unidad de cada moneda).
 *   * automatico: consulta una API pública sin key (open.er-api.com, base USD)
 *     y convierte todo a guaraníes. Si no hay conexión o la API falla, cae a
 *     las tasas manuales para que la caja nunca se quede sin cotización.
 */
export async function obtenerCotizaciones(): Promise<Cotizaciones> {
  const config = leerConfig()
  if (config.cotizacionesModo === 'manual') {
    return {
      ...config.cotizacionesManuales,
      actualizado_a: new Date().toISOString(),
    }
  }
  try {
    const remotas = await buscarCotizacionesAutomaticas()
    return { ...remotas, actualizado_a: new Date().toISOString() }
  } catch {
    return {
      ...config.cotizacionesManuales,
      actualizado_a: new Date().toISOString(),
    }
  }
}

/** Tasas guardadas por el usuario (uñas que usa el modo automático como respaldo). */
export function tasasBase(): Tasas {
  return leerConfig().cotizacionesManuales
}

/**
 * Consulta la cotización en vivo. La API devuelve cuántas unidades de cada
 * moneda valen 1 USD; de ahí se calcula a cuánto está cada moneda en Gs.
 */
export async function buscarCotizacionesAutomaticas(): Promise<Tasas> {
  const datos = (await pedirJson(
    'https://open.er-api.com/v6/latest/USD',
  )) as {
    result?: string
    rates?: Record<string, number>
  }
  if (datos?.result !== 'success') {
    throw new Error('La API de cotizaciones no respondió.')
  }
  const r = datos.rates ?? {}
  const pyg = numeroValido(r.PYG)
  const brl = numeroValido(r.BRL)
  const ars = numeroValido(r.ARS)
  if (!pyg || !brl || !ars) {
    throw new Error('La API no trajo todas las monedas.')
  }
  return {
    PYG: 1,
    USD: pyg,
    BRL: pyg / brl,
    ARS: pyg / ars,
  }
}

async function pedirJson(url: string): Promise<unknown> {
  if (esNativo()) {
    const res = await CapacitorHttp.get({
      url,
      headers: { Accept: 'application/json' },
    })
    return res.data
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as unknown
}

function numeroValido(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
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