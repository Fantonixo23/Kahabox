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
  updateApk(options: { url: string }): Promise<void>
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

export async function versionApp(): Promise<{ build: number; version: string }> {
  if (!esNativo()) return { build: 0, version: '' }
  return await KahaboxPrinter.version()
}

export async function instalarActualizacion(url: string): Promise<void> {
  await KahaboxPrinter.updateApk({ url })
}
