// Cliente de la API pública "TU RUC" (tuRUC) que expone el padrón de la DNIT.
// Doc: https://turuc.com.py/swagger-ui/index.html
//
//   GET /api/contribuyente?ruc=<RUC o documento>  → un contribuyente exacto
//   GET /api/contribuyente/search?search=<q>&page=0 → lista por nombre/RUC/documento
//   GET /api/contribuyente/entidad-publica?ruc=<...> → datos extra (dirección,
//                                                      teléfono, correo, web)
//
// La API permite CORS (`access-control-allow-origin: *`), así que en la web se
// consulta directo desde el navegador. En Android el WebView sí aplica CORS, por
// eso se usa CapacitorHttp igual que en cotizaciones.

import { CapacitorHttp } from '@capacitor/core'

import { esNativo } from './impresion/nativo'

export type ContribuyenteDnit = {
  doc: number
  razonSocial: string
  dv: number
  ruc: string
  estado: string
  esPersonaJuridica: boolean
  esEntidadPublica: boolean
}

/**
 * Datos de contacto que la DNIT solo publica para las entidades públicas. Para
 * una persona física o jurídica común la API no expone teléfono ni dirección.
 */
export type EntidadPublicaDnit = {
  razonSocial: string
  telefono: string
  direccion: string
  correo: string
  paginaWeb: string
}

export class DnitError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'DnitError'
  }
}

const BASE = 'https://turuc.com.py'
const TIMEOUT_MS = 12000

/** El endpoint de búsqueda exige entre 3 y 50 caracteres. */
export const MIN_CARACTERES_DNIT = 3

/**
 * Busca contribuyentes por nombre, RUC o número de documento. Devuelve una lista
 * acotada (la primera página) ideal para un autocompletado.
 */
export async function buscarContribuyentesDnit(
  consulta: string,
  signal?: AbortSignal,
): Promise<ContribuyenteDnit[]> {
  const q = consulta.trim()
  if (q.length < MIN_CARACTERES_DNIT) return []
  const url = `${BASE}/api/contribuyente/search?search=${encodeURIComponent(
    q.slice(0, 50),
  )}&page=0`
  const json = await pedirJson(url, signal)
  const lista = (json as { data?: { contribuyentes?: unknown } })?.data
    ?.contribuyentes
  if (!Array.isArray(lista)) return []
  return lista.map(mapearContribuyente)
}

/**
 * Consulta un contribuyente exacto por RUC (con o sin dígito verificador) o por
 * número de documento. Devuelve `null` si no existe.
 */
export async function consultarRucDnit(
  ruc: string,
): Promise<ContribuyenteDnit | null> {
  const valor = ruc.trim()
  if (!valor) return null
  const url = `${BASE}/api/contribuyente?ruc=${encodeURIComponent(valor)}`
  const json = await pedirJson(url)
  const dato = (json as { data?: unknown })?.data
  if (!dato || typeof dato !== 'object') return null
  return mapearContribuyente(dato)
}

/**
 * Consulta una entidad pública por RUC o documento y devuelve sus datos de
 * contacto. Devuelve `null` si no existe.
 */
export async function consultarEntidadPublicaDnit(
  ruc: string,
): Promise<EntidadPublicaDnit | null> {
  const valor = ruc.trim()
  if (!valor) return null
  const url = `${BASE}/api/contribuyente/entidad-publica?ruc=${encodeURIComponent(
    valor,
  )}`
  const json = await pedirJson(url)
  const dato = (json as { data?: unknown })?.data
  if (!dato || typeof dato !== 'object') return null
  const d = dato as Record<string, unknown>
  return {
    razonSocial: String(d.razonSocial ?? '').trim(),
    telefono: String(d.telefono ?? '').trim(),
    direccion: String(d.direccion ?? '').trim(),
    correo: String(d.correo ?? '').trim(),
    paginaWeb: String(d.paginaWeb ?? '').trim(),
  }
}

function mapearContribuyente(valor: unknown): ContribuyenteDnit {
  const c = (valor ?? {}) as Record<string, unknown>
  return {
    doc: Number(c.doc) || 0,
    razonSocial: String(c.razonSocial ?? '').trim(),
    dv: Number(c.dv) || 0,
    ruc: String(c.ruc ?? '').trim(),
    estado: String(c.estado ?? '').trim(),
    esPersonaJuridica: c.esPersonaJuridica === true,
    esEntidadPublica: c.esEntidadPublica === true,
  }
}

async function pedirJson(url: string, signal?: AbortSignal): Promise<unknown> {
  if (esNativo()) {
    const res = await CapacitorHttp.get({
      url,
      headers: { Accept: 'application/json' },
    })
    if (res.status >= 400) throw new DnitError(mensajeHttp(res.status, res.data))
    return res.data
  }

  const controlador = new AbortController()
  const abortar = () => controlador.abort()
  if (signal) {
    if (signal.aborted) controlador.abort()
    else signal.addEventListener('abort', abortar, { once: true })
  }
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controlador.signal,
    })
    const texto = await res.text()
    let json: unknown = null
    try {
      json = texto ? JSON.parse(texto) : null
    } catch {
      json = null
    }
    if (!res.ok) throw new DnitError(mensajeHttp(res.status, json))
    return json
  } catch (error) {
    if (error instanceof DnitError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new DnitError('La consulta a la DNIT tardó demasiado. Probá de nuevo.')
    }
    throw new DnitError('No se pudo consultar la DNIT. Revisá tu conexión.')
  } finally {
    clearTimeout(temporizador)
    if (signal) signal.removeEventListener('abort', abortar)
  }
}

function mensajeHttp(status: number, cuerpo: unknown): string {
  const msg =
    cuerpo && typeof cuerpo === 'object'
      ? String((cuerpo as { message?: unknown }).message ?? '').trim()
      : ''
  if (msg) return msg
  if (status === 400) return 'La consulta a la DNIT no es válida.'
  return `La DNIT respondió con código ${status}.`
}
