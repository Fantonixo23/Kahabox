/**
 * Puente hacia el plugin nativo Android `KahaboxPrinter`.
 *
 * El plugin (Java, dentro de la app) expone la impresión Bluetooth Classic SPP
 * (bytes ESC/POS al puerto de la impresora configurada).
 *
 * En la web (PC) estas funciones no están disponibles: `disponible()` da false
 * y la impresión cae al método del navegador.
 */

import { Capacitor, registerPlugin } from '@capacitor/core'

export type TipoDispositivo = 'classic' | 'le' | 'dual' | 'unknown'

export type DispositivoBluetooth = {
  name: string
  address: string
  type: TipoDispositivo
}

export interface KahaboxPrinterPlugin {
  list(): Promise<{ devices: DispositivoBluetooth[] }>
  connect(options: { address: string }): Promise<void>
  print(options: { data: string }): Promise<void>
  disconnect(): Promise<void>
  estado(): Promise<{ connected: boolean; address: string | null }>
  version(): Promise<{ build: number; version: string }>
  updateApk(options: { url: string; sha256?: string }): Promise<void>
}

export const KahaboxPrinter = registerPlugin<KahaboxPrinterPlugin>(
  'KahaboxPrinter',
)

export function esNativo(): boolean {
  return Capacitor.isNativePlatform()
}

export function impresoraNativaDisponible(): boolean {
  return Capacitor.isPluginAvailable('KahaboxPrinter')
}

export async function listarImpresoras(): Promise<DispositivoBluetooth[]> {
  if (!impresoraNativaDisponible()) return []
  const { devices } = await KahaboxPrinter.list()
  return devices
}

export async function imprimirEscPos(base64: string): Promise<void> {
  await KahaboxPrinter.print({ data: base64 })
}

/**
 * Imprime reconectando siempre a la impresora (como hace la prueba de
 * Configuración): evita el socket "fantasma" que queda de una conexión
 * anterior y que el print manda al vacío. Si el primer print falla, reconecta
 * y reintenta una vez.
 */
export async function imprimirConReintento(
  direccion: string,
  base64: string,
): Promise<void> {
  const conectarEImprimir = async () => {
    await KahaboxPrinter.connect({ address: direccion })
    await imprimirEscPos(base64)
  }
  try {
    await conectarEImprimir()
  } catch {
    // Algunas térmicas rechazan la reconexión inmediata: darle un respiro
    // antes del reintento para que suelte el enlace anterior.
    await new Promise((r) => setTimeout(r, 1200))
    await conectarEImprimir()
  }
}

export async function versionApp(): Promise<{ build: number; version: string }> {
  if (!esNativo()) return { build: 0, version: '' }
  return await KahaboxPrinter.version()
}

export async function instalarActualizacion(
  url: string,
  sha256?: string,
): Promise<void> {
  await KahaboxPrinter.updateApk({ url, sha256 })
}
