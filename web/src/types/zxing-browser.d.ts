// El paquete @zxing/browser no publica tipos en npm (no existe @types/zxing__browser).
// Declaración mínima con lo que usa el proyecto (BarcodeScanner).
declare module '@zxing/browser' {
  import type { DecodeHintType, Result } from '@zxing/library'

  export interface IScannerControls {
    stop(): void
    switchTorch?(on: boolean): Promise<void>
  }

  export class BrowserMultiFormatReader {
    constructor(hints?: Map<DecodeHintType, unknown> | null | undefined)
    decodeFromVideoDevice(
      deviceId?: string,
      previewElement?: HTMLVideoElement | null,
      callbackFn?: (result: Result | null) => void,
      errMessageFn?: (error: Error) => void,
      videoConstraints?: MediaTrackConstraints,
    ): Promise<IScannerControls>
    static listVideoInputDevices(): Promise<MediaDeviceInfo[]>
  }
}