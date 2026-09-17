// Cliente del terminal POS Bancard (SmartPOS / CajaPOS Android).
// Protocolo REST local v1.5.0 — doc "Integración CAJA POS - Android 2.0".
// El terminal escucha HTTP plano en http://IP:PUERTO dentro de la LAN de la caja.

export type MedioBancard =
  | 'qr'
  | 'debito'
  | 'contado'
  | 'cuotas'
  | 'qr_pix'
  | 'extraccion_qr'
  | 'canje'
  | 'canje_qr'
  | 'billetera'

export const NOMBRE_MEDIO_BANCARD: Record<MedioBancard, string> = {
  qr: 'QR',
  debito: 'Débito',
  contado: 'Contado',
  cuotas: 'Cuotas',
  qr_pix: 'QR PIX',
  extraccion_qr: 'Extracción QR',
  canje: 'Canje',
  canje_qr: 'Canje QR',
  billetera: 'Billetera',
}

export type ResultadoPos = {
  nroBoleta?: string | number
  codigoAutorizacion?: string | number
  issuerId?: string
  codigoComercio?: string | number
  nombreTarjeta?: string
  mensajeDisplay?: string
  pan?: string
  nombreCliente?: string
  montoVuelto?: number
  saldo?: number
  montoExtraccion?: number
  montoComision?: number
  montoRs?: number
  bin?: string
  nsu?: string
  listado?: Array<Record<string, unknown>>
  [clave: string]: unknown
}

type PasoIntermedio = {
  bin: string
  nsu: string
}

const TIMEOUT_ECO_MS = 5000
const TIMEOUT_OPERACION_MS = 90000

export function posBaseUrl(ip: string, puerto: string): string {
  const ipLimpia = ip.trim()
  const puertoLimpio = puerto.trim()
  if (!ipLimpia) throw new PosError('No configuraste la IP del POS Bancard.')
  if (!/^\d+$/.test(puertoLimpio)) {
    throw new PosError('El puerto del POS Bancard debe ser numérico.')
  }
  return `http://${ipLimpia}:${puertoLimpio}`
}

export class PosError extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'PosError'
  }
}

function mensajeErrorApi(status: number, cuerpo: unknown): string {
  if (cuerpo && typeof cuerpo === 'object' && 'message' in cuerpo) {
    const msg = String((cuerpo as { message?: unknown }).message ?? '')
    if (msg.trim()) return msg
  }
  if (status === 400) return 'La operación fue rechazada por el POS.'
  if (status === 500) return 'El POS reportó un error interno.'
  return `El POS respondió con código ${status}.`
}

async function fetchPos(
  baseUrl: string,
  endpoint: string,
  cuerpo: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs)
  try {
    const respuesta = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      // text/plain a propósito: evita el preflight OPTIONS (CORS). Los
      // terminales reales no responden OPTIONS y cortan la conexión; con
      // text/plain el cuerpo igual se lee como JSON.
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal,
    })
    const texto = await respuesta.text()
    let json: unknown
    try {
      json = texto ? JSON.parse(texto) : null
    } catch {
      json = null
    }
    if (respuesta.status === 400 || respuesta.status === 500) {
      throw new PosError(mensajeErrorApi(respuesta.status, json))
    }
    return { status: respuesta.status, body: json }
  } catch (error) {
    if (error instanceof PosError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new PosError(
        `El POS no respondió dentro del tiempo de espera (${Math.round(timeoutMs / 1000)} s).`,
      )
    }
    throw new PosError(
      `No se pudo conectar al POS (${baseUrl}). Revisá que el terminal esté encendido y en la misma red.`,
    )
  } finally {
    clearTimeout(temporizador)
  }
}

// Verificación de conexión (ping del terminal).
export async function probarConexionPos(
  ip: string,
  puerto: string,
): Promise<boolean> {
  const base = posBaseUrl(ip, puerto)
  const res = await fetchPos(base, '/pos/eco', { eco: 1 }, TIMEOUT_ECO_MS)
  if (res.status !== 200 || !res.body || typeof res.body !== 'object') {
    throw new PosError('El POS no reconoció la solicitud de verificación.')
  }
  return true
}

async function validarPrimerPaso(res: { status: number; body: unknown }): Promise<PasoIntermedio> {
  const cuerpo = res.body as Record<string, unknown> | null
  if (!cuerpo || typeof cuerpo !== 'object') {
    throw new PosError('El POS no devolvió los datos esperados.')
  }
  const bin = String(cuerpo.bin ?? '')
  const nsu = String(cuerpo.nsu ?? '')
  if (!bin || !nsu) throw new PosError('El POS no devolvió datos de la operación.')
  return { bin, nsu }
}

// Tarjeta (débito / contado / cuotas): flujo de 2 pasos
// (venta-ux / venta/debito / venta/credito -> descuento).
export async function cobrarTarjetaPos(
  ip: string,
  puerto: string,
  medio: 'debito' | 'contado' | 'cuotas',
  montoGs: number,
  facturaNro: number,
  cuotas = 0,
  plan = 0,
): Promise<ResultadoPos> {
  const base = posBaseUrl(ip, puerto)
  let primerPaso: { status: number; body: unknown }

  if (medio === 'debito') {
    primerPaso = await fetchPos(
      base,
      '/pos/venta/debito',
      { facturaNro },
      TIMEOUT_OPERACION_MS,
    )
  } else if (medio === 'cuotas') {
    primerPaso = await fetchPos(
      base,
      '/pos/venta-ux',
      { facturaNro, monto: montoGs, cuotas, plan },
      TIMEOUT_OPERACION_MS,
    )
  } else {
    primerPaso = await fetchPos(
      base,
      '/pos/venta-ux',
      { facturaNro, monto: montoGs },
      TIMEOUT_OPERACION_MS,
    )
  }

  const intermedio = await validarPrimerPaso(primerPaso)
  const segundo = await fetchPos(
    base,
    '/pos/descuento',
    { bin: intermedio.bin, nsu: intermedio.nsu, monto: montoGs },
    TIMEOUT_OPERACION_MS,
  )
  if (segundo.status !== 200 || !segundo.body || typeof segundo.body !== 'object') {
    throw new PosError('El POS no completó la operación de descuento.')
  }
  return segundo.body as ResultadoPos
}

// QR: respuesta directa en un solo paso.
export async function cobrarQrPos(
  ip: string,
  puerto: string,
  montoGs: number,
  facturaNro: number,
  montoVuelto = 0,
  promotions?: unknown[],
): Promise<ResultadoPos> {
  const base = posBaseUrl(ip, puerto)
  const cuerpo: Record<string, unknown> = {
    facturaNro,
    monto: montoGs,
    montoVuelto,
  }
  if (promotions && promotions.length > 0) cuerpo.promotions = promotions
  const res = await fetchPos(base, '/pos/venta-qr', cuerpo, TIMEOUT_OPERACION_MS)
  if (res.status !== 200 || !res.body || typeof res.body !== 'object') {
    throw new PosError('El POS no devolvió el resultado del pago QR.')
  }
  return res.body as ResultadoPos
}

export async function ventaQrPixPos(
  ip: string,
  puerto: string,
  montoGs: number,
  facturaNro: number,
  pixPayerCpf: string,
  pixPayerPhone: string,
): Promise<ResultadoPos> {
  const base = posBaseUrl(ip, puerto)
  const res = await fetchPos(
    base,
    '/pos/venta-qr-pix',
    { facturaNro, monto: montoGs, pix_payer_cpf: pixPayerCpf, pix_payer_phone: pixPayerPhone },
    TIMEOUT_OPERACION_MS,
  )
  if (res.status !== 200 || !res.body || typeof res.body !== 'object') {
    throw new PosError('El POS no devolvió el resultado del pago QR PIX.')
  }
  return res.body as ResultadoPos
}

export async function extraccionQrPos(
  ip: string,
  puerto: string,
  montoGs: number,
): Promise<ResultadoPos> {
  const base = posBaseUrl(ip, puerto)
  const res = await fetchPos(base, '/pos/extraccion-qr', { monto: montoGs }, TIMEOUT_OPERACION_MS)
  if (res.status !== 200 || !res.body || typeof res.body !== 'object') {
    throw new PosError('El POS no devolvió el resultado de la extracción QR.')
  }
  return res.body as ResultadoPos
}

export async function ventaCanjePos(
  ip: string,
  puerto: string,
  montoGs: number,
  facturaNro: number,
  viaQr = false,
): Promise<ResultadoPos> {
  const base = posBaseUrl(ip, puerto)
  const endpoint = viaQr ? '/pos/venta-canje-qr' : '/pos/venta-canje'
  const res = await fetchPos(base, endpoint, { facturaNro, monto: montoGs }, TIMEOUT_OPERACION_MS)
  if (res.status !== 200 || !res.body || typeof res.body !== 'object') {
    throw new PosError('El POS no devolvió el resultado del canje.')
  }
  return res.body as ResultadoPos
}

export async function ventaBilleteraPos(
  ip: string,
  puerto: string,
  montoGs: number,
  facturaNro: number,
  billetera: string,
  cuenta: string,
): Promise<ResultadoPos> {
  const base = posBaseUrl(ip, puerto)
  const res = await fetchPos(
    base,
    '/pos/venta-billetera',
    { facturaNro, monto: montoGs, billetera, cuenta },
    TIMEOUT_OPERACION_MS,
  )
  if (res.status !== 200 || !res.body || typeof res.body !== 'object') {
    throw new PosError('El POS no devolvió el resultado de la billetera.')
  }
  return res.body as ResultadoPos
}

export async function consultarAnulacionesPos(
  ip: string,
  puerto: string,
  nroBoleta = '0',
  cantRegistro = 10,
): Promise<ResultadoPos> {
  const base = posBaseUrl(ip, puerto)
  const res = await fetchPos(
    base,
    '/pos/consulta-anulacion',
    { nroBoleta, cantRegistro },
    TIMEOUT_ECO_MS,
  )
  if (res.status !== 200 || !res.body || typeof res.body !== 'object') {
    throw new PosError('El POS no devolvió el listado de boletas.')
  }
  return res.body as ResultadoPos
}

export async function anularBoletaPos(
  ip: string,
  puerto: string,
  nroBoleta: string,
): Promise<ResultadoPos> {
  const base = posBaseUrl(ip, puerto)
  const res = await fetchPos(base, '/pos/anulacion', { nroBoleta }, TIMEOUT_OPERACION_MS)
  if (res.status !== 200 || !res.body || typeof res.body !== 'object') {
    throw new PosError('El POS no devolvió el resultado de la anulación.')
  }
  return res.body as ResultadoPos
}