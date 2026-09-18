import { useSyncExternalStore } from 'react'

import type { Moneda } from '@/lib/format'

export type CertificadoSifen = {
  nombre: string
  tamano: number
  tipo: string
  base64: string | null
}

export type AnchoTicketPc = 88 | 58

export type MetodoImpresion = 'estacion' | 'navegador'

export type CajaNumero = 1 | 2 | 3

export type Tema = 'claro' | 'oscuro'

export type EstacionImpresion = {
  activa: boolean
  dispositivoId: string
  impresoraNombre: string
  impresoraDireccion: string
  sucursalId: string | null
}

export type ConfigApp = {
  nombreNegocio: string
  sifenActivo: boolean
  sifenRuc: string
  certificado: CertificadoSifen | null
  bancardActivo: boolean
  bancardIp: string
  bancardPuerto: string
  anchoTicketPc: AnchoTicketPc
  cajaNumero: CajaNumero
  metodoImpresion: MetodoImpresion
  estacionImpresion: EstacionImpresion
  modulosOcultos: string[]
  monedasActivas: Moneda[]
  monedaPrincipal: Moneda
  tema: Tema
}

const MONEDAS_DEFAULT: Moneda[] = ['PYG', 'USD', 'ARS', 'BRL']

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

function nuevoDispositivoId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `est-${Date.now().toString(36)}`
  }
}

function estacionInicial(): EstacionImpresion {
  return {
    activa: false,
    dispositivoId: nuevoDispositivoId(),
    impresoraNombre: '',
    impresoraDireccion: '',
    sucursalId: null,
  }
}

function configInicial(): ConfigApp {
  const guardada = leerConfigGuardada()
  const { estacionImpresion: estacionGuardada, ...resto } = guardada
  const config: ConfigApp = {
    nombreNegocio: '',
    sifenActivo: false,
    sifenRuc: '',
    certificado: null,
    bancardActivo: false,
    bancardIp: '',
    bancardPuerto: '9000',
    anchoTicketPc: 88,
    cajaNumero: 1,
    metodoImpresion: 'navegador',
    modulosOcultos: leerModulosOcultos(),
    monedasActivas: MONEDAS_DEFAULT,
    monedaPrincipal: 'PYG',
    tema: 'claro',
    ...resto,
    estacionImpresion: {
      ...estacionInicial(),
      ...(estacionGuardada ?? {}),
      dispositivoId: estacionGuardada?.dispositivoId || nuevoDispositivoId(),
    },
  }
  aplicarTema(config.tema)
  return config
}

function aplicarTema(tema: Tema) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', tema === 'oscuro')
}

function leerConfigGuardada(): Partial<ConfigApp> {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return {}
    const datos = JSON.parse(raw) as Partial<ConfigApp>
    // El certificado SIFEN (.p12/.pfx) NO se persiste: es la clave privada de
    // la firma digital del comercio y no debe quedar en texto plano en el
    // storage del navegador. Solo vive en memoria durante la sesión (y se
    // vuelve a cargar cada vez que haga falta firmar en el futuro).
    delete datos.certificado
    // Migración: el ancho de ticket angosto pasó de 44mm a 58mm.
    if (Number(datos.anchoTicketPc) === 44) datos.anchoTicketPc = 58
    if (Array.isArray(datos.monedasActivas)) {
      datos.monedasActivas = datos.monedasActivas.filter((m): m is Moneda =>
        MONEDAS_DEFAULT.includes(m as Moneda),
      )
    } else {
      delete datos.monedasActivas
    }
    return datos
  } catch {
    return {}
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
        bancardActivo: config.bancardActivo,
        bancardIp: config.bancardIp,
        bancardPuerto: config.bancardPuerto,
        anchoTicketPc: config.anchoTicketPc,
        cajaNumero: config.cajaNumero,
        metodoImpresion: config.metodoImpresion,
        estacionImpresion: config.estacionImpresion,
        monedasActivas: config.monedasActivas,
        monedaPrincipal: config.monedaPrincipal,
        tema: config.tema,
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
  if (patch.tema !== undefined) {
    aplicarTema(patch.tema)
  }
  guardar()
  listeners.forEach((l) => l())
}

export function actualizarEstacionImpresion(
  patch: Partial<EstacionImpresion>,
) {
  actualizarConfig({
    estacionImpresion: { ...config.estacionImpresion, ...patch },
  })
}

export function nombreNegocio(): string {
  return config.nombreNegocio.trim() || 'KAHABOX'
}

// Divisas que el usuario dejó habilitadas en Configuración. Si por algún
// motivo quedan todas fuera, se cae a la lista completa para no romper selects.
export function monedasActivas(): Moneda[] {
  return config.monedasActivas.length > 0
    ? config.monedasActivas
    : MONEDAS_DEFAULT
}

export function monedaPrincipal(): Moneda {
  return monedasActivas().includes(config.monedaPrincipal)
    ? config.monedaPrincipal
    : monedasActivas()[0]
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