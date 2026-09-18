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

export type ParametrosServicio = {
  titulo: string
  texto: string
  supabaseUrl: string
  supabaseKey: string
  accessToken: string
  refreshToken: string
  dispositivoId: string
  sucursalId: string
  impresoraDireccion: string
}

export type EstadoServicio = {
  corriendo: boolean
  conectada: boolean
  impresos: number
  ultimoError: string | null
}

export interface KahaboxPrinterPlugin {
  list(): Promise<{ devices: DispositivoBluetooth[] }>
  connect(options: { address: string }): Promise<void>
  print(options: { data: string }): Promise<void>
  disconnect(): Promise<void>
  estado(): Promise<{ connected: boolean; address: string | null }>
  startService(options: ParametrosServicio): Promise<void>
  stopService(): Promise<void>
  estadoServicio(): Promise<EstadoServicio>
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

export async function iniciarServicioImpresion(
  params: ParametrosServicio,
): Promise<void> {
  if (!impresoraNativaDisponible()) return
  await KahaboxPrinter.startService(params)
}

export async function detenerServicioImpresion(): Promise<void> {
  if (!impresoraNativaDisponible()) return
  await KahaboxPrinter.stopService()
}

export async function estadoServicioNativo(): Promise<EstadoServicio | null> {
  if (!impresoraNativaDisponible()) return null
  return await KahaboxPrinter.estadoServicio()
}

export async function versionApp(): Promise<{ build: number; version: string }> {
  if (!esNativo()) return { build: 0, version: '' }
  return await KahaboxPrinter.version()
}

export async function instalarActualizacion(url: string): Promise<void> {
  await KahaboxPrinter.updateApk({ url })
}
