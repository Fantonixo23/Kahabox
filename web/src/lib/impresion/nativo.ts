/**
 * Puente hacia el plugin nativo Android `KahaboxPrinter`.
 *
 * El plugin (Java, dentro de la app) expone:
 *   * impresión Bluetooth Classic SPP (bytes ESC/POS al puerto)
 *   * servicio en primer plano para que la estación siga viva con la pantalla
 *     apagada (notificación fija + wakelock)
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
  startService(options: { titulo: string; texto: string }): Promise<void>
  stopService(): Promise<void>
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

export async function iniciarServicioImpresion(
  titulo: string,
  texto: string,
): Promise<void> {
  if (!impresoraNativaDisponible()) return
  await KahaboxPrinter.startService({ titulo, texto })
}

export async function detenerServicioImpresion(): Promise<void> {
  if (!impresoraNativaDisponible()) return
  await KahaboxPrinter.stopService()
}
