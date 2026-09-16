import { useEffect, useRef, useState } from 'react'

import type { RealtimeChannel } from '@supabase/supabase-js'

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type EstadoConexion = 'conectando' | 'conectado' | 'error'

export type CajaNumero = 1 | 2 | 3

export type PayloadNuevoProducto = {
  nombre: string
  codigo_barras: string | null
  marca: string | null
  categoria: string | null
  variante: string | null
  sku: string | null
  precio: number
  costo: number | null
  moneda: 'PYG' | 'USD'
  cantidad: number
}

export type PayloadReponer = {
  codigo_barras: string
  cantidad: number
  tipo: 'entrada' | 'salida'
  motivo: string | null
}

const CLAVE_CAJA_ESCANEADOR = 'kahabox:caja-escaneador'

export function salaDeCaja(caja: CajaNumero): string {
  return `demo:caja-${caja}`
}

export function cajaDeUrl(): CajaNumero | null {
  try {
    const n = Number(new URLSearchParams(location.search).get('caja'))
    return n === 1 || n === 2 || n === 3 ? (n as CajaNumero) : null
  } catch {
    return null
  }
}

export function leerCajaEscaneador(): CajaNumero {
  try {
    const n = Number(sessionStorage.getItem(CLAVE_CAJA_ESCANEADOR))
    return n === 1 || n === 2 || n === 3 ? (n as CajaNumero) : 1
  } catch {
    return 1
  }
}

export function guardarCajaEscaneador(caja: CajaNumero) {
  try {
    sessionStorage.setItem(CLAVE_CAJA_ESCANEADOR, String(caja))
  } catch {
    // Sin storage: se mantiene la caja actual en memoria.
  }
}

/**
 * Transporte del escáner remoto.
 *
 * - Modo demo (sin Supabase configurado): relay WebSocket del server de dev
 *   (ruta `/relay`, mismo `npm run dev`). Solo sirve para desarrollo local.
 * - Modo producción (Supabase configurado): Supabase Realtime con broadcast +
 *   presence. El canal se arma por tenant (`app_metadata.tenant_id`) + sala, así
 *   dos tenants distintos del mismo proyecto jamás se ven entre sí. Por eso el
 *   celular tiene que estar logueado con la MISMA cuenta que la Caja.
 *
 * Ambos exponen la misma API hacia las páginas; el salto se hace solo.
 */

type RolPresencia = 'caja' | 'escaneador'

type EstadoPresencia = {
  rol?: RolPresencia
  deviceId?: string
}

type MensajeBroadcast = {
  tipo?: 'codigo' | 'producto' | 'reponer' | 'snapshot'
  deviceId?: string
  sala?: string
  codigo?: string
  producto?: PayloadNuevoProducto | PayloadReponer
  items?: PayloadNuevoProducto[]
}

const REINTENTO_SIN_SESION_MS = 4000

function urlRelay(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/relay`
}

async function tenantIdDeSesion(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const tid = data.session?.user?.app_metadata?.tenant_id
    return typeof tid === 'string' && tid.trim() ? tid : null
  } catch {
    return null
  }
}

function canalRealtime(sala: string, tenantId: string): string {
  return `kahabox:${tenantId}:${sala.trim() || 'caja'}`
}

function contarEscaneadores(
  presencias: Record<string, EstadoPresencia[] | undefined>,
): number {
  let total = 0
  for (const lista of Object.values(presencias)) {
    if (lista?.some((p) => p.rol === 'escaneador')) total += 1
  }
  return total
}

function nuevoEscaneador(sucesos: unknown, propioId: string): boolean {
  if (!Array.isArray(sucesos)) return false
  return (sucesos as EstadoPresencia[]).some(
    (p) => p.rol === 'escaneador' && p.deviceId !== propioId,
  )
}

export function useSalaEscaneo(
  sala: string,
  opciones: {
    onCodigo: (code: string) => void
    onProducto?: (producto: PayloadNuevoProducto) => void
    onReponer?: (reponer: PayloadReponer) => void
    onPedirSnapshot?: () => PayloadNuevoProducto[]
  },
): {
  sala: string
  estado: EstadoConexion
  escaneadoresConectados: number
  sinSesion: boolean
} {
  const { onCodigo, onProducto, onReponer, onPedirSnapshot } = opciones
  const [estado, setEstado] = useState<EstadoConexion>('conectando')
  const [escaneadoresConectados, setEscaneadoresConectados] = useState(0)
  const [sinSesion, setSinSesion] = useState(false)

  const refs = useRef({ onCodigo, onProducto, onReponer, onPedirSnapshot, sala })
  const deviceId = useRef<string>(crypto.randomUUID())

  useEffect(() => {
    refs.current = { onCodigo, onProducto, onReponer, onPedirSnapshot, sala }
  })

  useEffect(() => {
    let activo = true
    let canal: RealtimeChannel | null = null
    let ws: WebSocket | null = null
    let timer: number | undefined
    let retrySesion: number | undefined
    let intento = 0
    let snapshotEnviado = false

    function emitirSnapshot() {
      const items = refs.current.onPedirSnapshot?.() ?? []
      if (items.length === 0) return
      void canal?.send({
        type: 'broadcast',
        event: 'snapshot',
        payload: {
          tipo: 'snapshot',
          deviceId: deviceId.current,
          items,
        } satisfies MensajeBroadcast,
      })
    }

    async function conectarRealtime() {
      const tenant = await tenantIdDeSesion()
      if (!activo) return
      if (!tenant) {
        setSinSesion(true)
        setEstado('conectando')
        retrySesion = window.setTimeout(
          () => void conectarRealtime(),
          REINTENTO_SIN_SESION_MS,
        )
        return
      }
      setSinSesion(false)

      const tema = canalRealtime(refs.current.sala, tenant)
      canal = supabase.channel(tema)
      canal
        .on('broadcast', { event: 'codigo' }, (msg) => {
          const code = (msg.payload as MensajeBroadcast | undefined)?.codigo
          if (typeof code === 'string') refs.current.onCodigo(code)
        })
        .on('broadcast', { event: 'producto' }, (msg) => {
          const payload = (msg.payload as MensajeBroadcast | undefined) ?? {}
          const producto = payload.producto
          if (producto && payload.deviceId !== deviceId.current) {
            refs.current.onProducto?.(producto as PayloadNuevoProducto)
          }
        })
        .on('broadcast', { event: 'reponer' }, (msg) => {
          const payload = (msg.payload as MensajeBroadcast | undefined) ?? {}
          if (payload.producto) {
            refs.current.onReponer?.(payload.producto as PayloadReponer)
          }
        })
        .on('presence', { event: 'sync' }, () => {
          if (!activo || !canal) return
          const presencias = canal.presenceState() as Record<
            string,
            EstadoPresencia[]
          >
          const total = contarEscaneadores(presencias)
          setEscaneadoresConectados(total)
          if (!snapshotEnviado && total > 0) {
            snapshotEnviado = true
            emitirSnapshot()
          }
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          if (!activo) return
          if (nuevoEscaneador(newPresences, deviceId.current)) emitirSnapshot()
        })

      canal.subscribe((status) => {
        if (!activo) return
        if (status === 'SUBSCRIBED') {
          setEstado('conectado')
          void canal?.track({ rol: 'caja', deviceId: deviceId.current })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setEstado('error')
        }
      })
    }

    if (isSupabaseConfigured) {
      void conectarRealtime()
    } else {
      function conectarRelay() {
        ws = new WebSocket(urlRelay())
        ws.onopen = () => {
          intento = 0
          ws?.send(
            JSON.stringify({ tipo: 'unirse', sala: refs.current.sala, rol: 'caja' }),
          )
          if (activo) setEstado('conectado')
        }
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data)) as {
              tipo?: string
              codigo?: unknown
              producto?: unknown
              escaneadores?: unknown
            }
            if (data.tipo === 'codigo' && typeof data.codigo === 'string') {
              refs.current.onCodigo(data.codigo)
            } else if (
              data.tipo === 'producto' &&
              data.producto &&
              typeof data.producto === 'object'
            ) {
              refs.current.onProducto?.(data.producto as PayloadNuevoProducto)
            } else if (
              data.tipo === 'reponer' &&
              data.producto &&
              typeof data.producto === 'object'
            ) {
              refs.current.onReponer?.(data.producto as PayloadReponer)
            } else if (data.tipo === 'pedir_snapshot') {
              const items = refs.current.onPedirSnapshot?.() ?? []
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    tipo: 'snapshot',
                    sala: refs.current.sala.trim(),
                    items,
                  }),
                )
              }
            } else if (
              data.tipo === 'presencia' &&
              typeof data.escaneadores === 'number'
            ) {
              if (activo) setEscaneadoresConectados(data.escaneadores)
            }
          } catch {
            // Mensaje inválido.
          }
        }
        ws.onerror = () => {
          if (activo) setEstado('error')
        }
        ws.onclose = () => {
          if (!activo) return
          setEstado('conectando')
          timer = window.setTimeout(conectarRelay, Math.min(8000, 1000 * 2 ** intento))
          intento += 1
        }
      }
      conectarRelay()
    }

    return () => {
      activo = false
      if (timer) clearTimeout(timer)
      if (retrySesion) clearTimeout(retrySesion)
      ws?.close()
      ws = null
      if (canal) {
        canal.untrack()
        void supabase.removeChannel(canal)
        canal = null
      }
    }
  }, [])

  return { sala, estado, escaneadoresConectados, sinSesion }
}

export function useEscaneadorSala(
  sala: string,
  opciones?: {
    onProducto?: (producto: PayloadNuevoProducto) => void
    onSnapshot?: (items: PayloadNuevoProducto[]) => void
  },
): {
  estado: EstadoConexion
  enviar: (codigo: string) => boolean
  enviarProducto: (producto: PayloadNuevoProducto) => boolean
  reponerStock: (reponer: PayloadReponer) => boolean
  sinSesion: boolean
} {
  const [estado, setEstado] = useState<EstadoConexion>('conectando')
  const [sinSesion, setSinSesion] = useState(false)

  const refs = useRef({ sala, onProducto: opciones?.onProducto, onSnapshot: opciones?.onSnapshot })
  const deviceId = useRef<string>(crypto.randomUUID())
  const canalRef = useRef<RealtimeChannel | null>(null)
  const realListo = useRef(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    refs.current = {
      sala,
      onProducto: opciones?.onProducto,
      onSnapshot: opciones?.onSnapshot,
    }
  })

  useEffect(() => {
    let activo = true
    let canal: RealtimeChannel | null = null
    let ws: WebSocket | null = null
    let timer: number | undefined
    let retrySesion: number | undefined
    let intento = 0

    async function conectarRealtime() {
      const tenant = await tenantIdDeSesion()
      if (!activo) return
      if (!tenant) {
        setSinSesion(true)
        setEstado('conectando')
        retrySesion = window.setTimeout(
          () => void conectarRealtime(),
          REINTENTO_SIN_SESION_MS,
        )
        return
      }
      setSinSesion(false)

      const tema = canalRealtime(refs.current.sala, tenant)
      canal = supabase.channel(tema)
      canalRef.current = canal
      canal
        .on('broadcast', { event: 'producto' }, (msg) => {
          const payload = (msg.payload as MensajeBroadcast | undefined) ?? {}
          const producto = payload.producto
          if (producto && payload.deviceId !== deviceId.current) {
            refs.current.onProducto?.(producto as PayloadNuevoProducto)
          }
        })
        .on('broadcast', { event: 'snapshot' }, (msg) => {
          const payload = (msg.payload as MensajeBroadcast | undefined) ?? {}
          if (payload.deviceId === deviceId.current) return
          if (Array.isArray(payload.items)) {
            refs.current.onSnapshot?.(payload.items as PayloadNuevoProducto[])
          }
        })

      canal.subscribe((status) => {
        if (!activo) return
        if (status === 'SUBSCRIBED') {
          realListo.current = true
          setEstado('conectado')
          void canal?.track({ rol: 'escaneador', deviceId: deviceId.current })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          realListo.current = false
          setEstado('error')
        }
      })
    }

    if (isSupabaseConfigured) {
      void conectarRealtime()
    } else {
      const codigo = refs.current.sala.trim().toUpperCase()
      function conectarRelay() {
        const sock = new WebSocket(urlRelay())
        ws = sock
        wsRef.current = sock
        sock.onopen = () => {
          intento = 0
          sock.send(
            JSON.stringify({
              tipo: 'unirse',
              sala: refs.current.sala.trim(),
              rol: 'escaneador',
            }),
          )
          if (activo) setEstado('conectado')
        }
        sock.onmessage = (ev) => {
          try {
            const data = JSON.parse(String(ev.data)) as {
              tipo?: string
              producto?: unknown
              items?: unknown
            }
            if (
              data.tipo === 'producto' &&
              data.producto &&
              typeof data.producto === 'object'
            ) {
              refs.current.onProducto?.(data.producto as PayloadNuevoProducto)
            } else if (data.tipo === 'snapshot' && Array.isArray(data.items)) {
              refs.current.onSnapshot?.(data.items as PayloadNuevoProducto[])
            }
          } catch {
            // Mensaje inválido.
          }
        }
        sock.onerror = () => {
          if (activo) setEstado('error')
        }
        sock.onclose = () => {
          if (!activo) return
          wsRef.current = null
          setEstado('conectando')
          timer = window.setTimeout(conectarRelay, Math.min(8000, 1000 * 2 ** intento))
          intento += 1
        }
      }
      if (codigo) conectarRelay()
    }

    return () => {
      activo = false
      if (timer) clearTimeout(timer)
      if (retrySesion) clearTimeout(retrySesion)
      ws?.close()
      wsRef.current = null
      if (canal) {
        canal.untrack()
        void supabase.removeChannel(canal)
        canal = null
      }
      canalRef.current = null
      realListo.current = false
    }
  }, [sala])

  function enviar(codigoBarras: string): boolean {
    const c = codigoBarras.trim()
    if (!c) return false
    if (isSupabaseConfigured) {
      const canal = canalRef.current
      if (!canal || !realListo.current) return false
      void canal.send({
        type: 'broadcast',
        event: 'codigo',
        payload: {
          tipo: 'codigo',
          deviceId: deviceId.current,
          sala: refs.current.sala,
          codigo: c,
        } satisfies MensajeBroadcast,
      })
      return true
    }
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(
      JSON.stringify({
        tipo: 'codigo',
        sala: refs.current.sala.trim(),
        codigo: c,
      }),
    )
    return true
  }

  function enviarProducto(producto: PayloadNuevoProducto): boolean {
    if (isSupabaseConfigured) {
      const canal = canalRef.current
      if (!canal || !realListo.current) return false
      void canal.send({
        type: 'broadcast',
        event: 'producto',
        payload: {
          tipo: 'producto',
          deviceId: deviceId.current,
          sala: refs.current.sala,
          producto,
        } satisfies MensajeBroadcast,
      })
      return true
    }
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(
      JSON.stringify({
        tipo: 'producto',
        sala: refs.current.sala.trim(),
        producto,
      }),
    )
    return true
  }

  function reponerStock(reponer: PayloadReponer): boolean {
    if (isSupabaseConfigured) {
      const canal = canalRef.current
      if (!canal || !realListo.current) return false
      void canal.send({
        type: 'broadcast',
        event: 'reponer',
        payload: {
          tipo: 'reponer',
          deviceId: deviceId.current,
          sala: refs.current.sala,
          producto: reponer,
        } satisfies MensajeBroadcast,
      })
      return true
    }
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(
      JSON.stringify({
        tipo: 'reponer',
        sala: refs.current.sala.trim(),
        producto: reponer,
      }),
    )
    return true
  }

  return { estado, enviar, enviarProducto, reponerStock, sinSesion }
}