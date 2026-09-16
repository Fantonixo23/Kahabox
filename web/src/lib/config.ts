import { useSyncExternalStore } from 'react'

export type CertificadoSifen = {
  nombre: string
  tamano: number
  tipo: string
  base64: string | null
}

export type ConfigApp = {
  nombreNegocio: string
  sifenActivo: boolean
  sifenRuc: string
  certificado: CertificadoSifen | null
  modulosOcultos: string[]
}

export type Modulo = { ruta: string; label: string; corto: string }

export const MODULOS: Modulo[] = [
  { ruta: '/app/caja', label: 'Caja', corto: 'Caja' },
  { ruta: '/app/stock', label: 'Stock', corto: 'Stock' },
  { ruta: '/app/ventas', label: 'Ventas', corto: 'Ventas' },
  { ruta: '/app/proveedores', label: 'Proveedores', corto: 'Prov.' },
  {
    ruta: '/app/pagos-proveedores',
    label: 'Pagos a proveedores',
    corto: 'Pagos',
  },
  { ruta: '/app/equipo', label: 'Mi equipo', corto: 'Equipo' },
  { ruta: '/app/reportes', label: 'Reportes', corto: 'Reportes' },
]

const CLAVE = 'kahabox:config'
const CLAVE_MODULOS_OCULTOS = 'kahabox:modulos-ocultos'

function configInicial(): ConfigApp {
  return {
    nombreNegocio: '',
    sifenActivo: false,
    sifenRuc: '',
    certificado: null,
    modulosOcultos: leerModulosOcultos(),
  }
}

function leerModulosOcultos(): string[] {
  try {
    const raw = localStorage.getItem(CLAVE_MODULOS_OCULTOS)
    if (!raw) return []
    const lista = JSON.parse(raw) as string[]
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

let config = configInicial()
const listeners = new Set<() => void>()

function guardar() {
  try {
    localStorage.setItem(
      CLAVE,
      JSON.stringify({
        nombreNegocio: config.nombreNegocio,
        sifenActivo: config.sifenActivo,
        sifenRuc: config.sifenRuc,
        certificado: config.certificado,
      }),
    )
    localStorage.setItem(
      CLAVE_MODULOS_OCULTOS,
      JSON.stringify(config.modulosOcultos),
    )
  } catch {
    // Sin storage: la configuración vive en memoria.
  }
}

export function leerConfig(): ConfigApp {
  return config
}

export function actualizarConfig(patch: Partial<ConfigApp>) {
  config = { ...config, ...patch }
  if (patch.modulosOcultos !== undefined) {
    config.modulosOcultos = patch.modulosOcultos
  }
  guardar()
  listeners.forEach((l) => l())
}

export function nombreNegocio(): string {
  return config.nombreNegocio.trim() || 'KAHABOX'
}

export function useConfig(): ConfigApp {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    leerConfig,
    leerConfig,
  )
}