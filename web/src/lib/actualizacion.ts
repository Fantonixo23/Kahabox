/**
 * Auto-update de la app Android.
 *
 * La web (PC) se actualiza sola porque Netlify sirve siempre el último build.
 * La app de Android lleva la web adentro (bundle compilado), así que para
 * actualizarla se descarga el APK nuevo desde la URL fija y se instala solo.
 *
 * El APK y este metadata (kahabox-caja.json) se publican juntos en el último
 * GitHub Release; Netlify los expone en URLs fijas.
 */

import { CapacitorHttp } from '@capacitor/core'

import { esNativo, instalarActualizacion, versionApp } from '@/lib/impresion/nativo'

export type InfoActualizacion = {
  versionCode: number
  versionName: string
  fecha: string
  url: string
}

const URL_METADATA = 'https://kahabox.netlify.app/kahabox-caja.json'

export async function versionInstalada(): Promise<string | null> {
  if (!esNativo()) return null
  try {
    const v = await versionApp()
    return v.version || null
  } catch {
    return null
  }
}

/** Busca la última versión publicada. Devuelve null si no hay, o lanza si hubo error. */
export async function buscarActualizacion(): Promise<InfoActualizacion | null> {
  if (!esNativo()) return null
  const res = await CapacitorHttp.get({
    url: URL_METADATA,
    headers: { Accept: 'application/json' },
  })
  const data = parseMetadata(res.data)
  if (!data || typeof data.versionCode !== 'number') {
    throw new Error('Metadatos de versión inválidos.')
  }
  const info = data as InfoActualizacion
  const v = await versionApp()
  return info.versionCode > v.build ? info : null
}

/**
 * GitHub sirve los assets del Release con content-type `application/octet-stream`,
 * así que CapacitorHttp puede devolver el JSON como string en vez de objeto.
 */
function parseMetadata(data: unknown): Partial<InfoActualizacion> | null {
  if (data && typeof data === 'object') {
    return data as Partial<InfoActualizacion>
  }
  if (typeof data === 'string' && data.trim()) {
    try {
      return JSON.parse(data) as Partial<InfoActualizacion>
    } catch {
      return null
    }
  }
  return null
}

/** Descarga e instala el APK nuevo (abre el instalador de Android). */
export async function actualizarApp(url: string): Promise<void> {
  await instalarActualizacion(url)
}

export function fechaLegible(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}