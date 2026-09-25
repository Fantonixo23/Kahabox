/** Tipos minimos del paquete qz-tray: no trae una declaracion ESM usada */
declare module 'qz-tray' {
  export type QzPrintData = {
    data: string
    type: 'raw'
    format: 'base64'
    flavor: 'base64'
    encoding?: string
    spool?: boolean
    options?: Record<string, unknown>
  }

  export interface QzSecurity {
    setSignatureAlgorithm(algoritmo: string): void
    setCertificatePromise(
      handler: (opciones: unknown) => Promise<string>,
    ): void
    setSignaturePromise(factory: (toSign: string) => Promise<string>): void
  }

  export interface QzWebsocket {
    connect(opciones?: unknown): Promise<void>
    disconnect(): Promise<void>
    isActive(): boolean
    setClosedCallbacks(callbacks: Array<() => void>): void
  }

  export interface QzPrinters {
    find(): Promise<string[]>
  }

  export interface QzApi {
    getVersion(): Promise<string>
  }

  export interface Qz {
    security: QzSecurity
    websocket: QzWebsocket
    printers: QzPrinters
    api: QzApi
    version: string
    print(
      datos: QzPrintData[] | QzPrintData,
      impresora?: string,
      config?: Record<string, unknown>,
    ): Promise<void>
  }

  const qz: Qz
  export default qz
}