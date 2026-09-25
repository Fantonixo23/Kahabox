/**
 * Puente hacia QZ Tray (impresora termica en la PC).
 *
 * QZ Tray es un programa local que escucha en un WebSocket y recibe los bytes
 * ESC/POS para mandarlos silenciosos a la impresora (sin dialogo, sin driver).
 * La seguridad se resuelve con el certificado autofirmado propio:
 *   - El certificado (publico) se sirve desde /qz/digital-certificate.txt.
 *   - La firma de cada pedido la hace la Edge Function `firmar-qz` en el
 *     servidor, con la clave privada que jamas llega al navegador.
 */

import qz from 'qz-tray'

import { supabase } from '@/lib/supabase'

const CERTIFICADO_URL = '/qz/digital-certificate.txt'

let configurado = false

/** Configura la seguridad solo una vez (algoritmo, certificado y firma). */
function configurarQz(): void {
  if (configurado) return
  qz.security.setSignatureAlgorithm('SHA512')
  qz.security.setCertificatePromise(async () => {
    const res = await fetch(CERTIFICADO_URL)
    if (!res.ok) {
      throw new Error('No se pudo leer el certificado de QZ de la app.')
    }
    return res.text()
  })
  qz.security.setSignaturePromise(async (toSign) => {
    const { data, error } = await supabase.functions.invoke('firmar-qz', {
      body: { toSign },
    })
    if (error) throw error
    if (typeof data !== 'string') {
      throw new Error('La funcion firmar-qz respondio mal.')
    }
    return data
  })
  configurado = true
}

/**
 * Conecta con QZ Tray si no hay una conexion viva. Reconecta siempre que el
 * socket este caido, igual patron que `imprimirConReintento` para Bluetooth.
 */
export async function conectarQz(): Promise<void> {
  configurarQz()
  if (qz.websocket.isActive()) return
  try {
    await qz.websocket.disconnect()
  } catch {
    // No habia conexion previa que cortar: continua.
  }
  await qz.websocket.connect()
}

/** Devuelve si QZ Tray esta instalado, corriendo y conectado. Nunca lanza. */
export async function qzDisponible(): Promise<boolean> {
  configurarQz()
  if (qz.websocket.isActive()) return true
  try {
    await qz.websocket.connect()
    return true
  } catch {
    return false
  }
}

/**
 * Registra un callback para el momento en que QZ Tray se cierra a mitad de
 * turno. Devuelve una funcion para desregistrarlo.
 */
export function vigilarQz(alCerrado: () => void): () => void {
  configurarQz()
  qz.websocket.setClosedCallbacks([alCerrado])
  return () => qz.websocket.setClosedCallbacks([])
}

/** Lista los nombres de impresoras que ve QZ Tray (el exacto de caja). */
export async function listarImpresorasQz(): Promise<string[]> {
  await conectarQz()
  return await qz.printers.find()
}

/**
 * Manda bytes ESC/POS (en base64) a la impresora elegida. La decodificacion
 * de base64 y el envio son responsabilidad de QZ Tray: llega tal cual al
 * puerto, silencioso y con corte automatico.
 */
export async function imprimirRawQz(
  impresora: string,
  base64: string,
): Promise<void> {
  await conectarQz()
  await qz.print(
    [
      {
        data: base64,
        type: 'raw',
        format: 'base64',
        flavor: 'base64',
        encoding: 'CP850',
      },
    ],
    impresora,
  )
}