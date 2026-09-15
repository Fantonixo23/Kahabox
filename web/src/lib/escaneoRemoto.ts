import { useEffect, useRef, useState } from 'react'

export type EstadoConexion = 'conectando' | 'conectado' | 'error'

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
}

const CLAVE_SALA = 'kahabox:sala-escaneo'

const CARACTERES = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generarSala(): string {
  let s = ''
  for (let i = 0; i < 6; i++) {
    s += CARACTERES[Math.floor(Math.random() * CARACTERES.length)]
  }
  return `K-${s}`
}

export function guardarSala(codigo: string) {
  sessionStorage.setItem(CLAVE_SALA, codigo.trim().toUpperCase())
}

export function leerSala(): string {
  return sessionStorage.getItem(CLAVE_SALA) ?? ''
}

export function limpiarSala() {
  sessionStorage.removeItem(CLAVE_SALA)
}

function urlRelay(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/relay`
}

/**
 * Escáner remoto (demo local): la Caja en la compu abre una sala (código K-XXXX)
 * y el celular (página /escaneo) se une a esa sala y le reenvía cada código que
 * escanea. En producción este transporte se reemplaza por Supabase Realtime.
 */
export function useSalaEscaneo(opciones: {
  onCodigo: (code: string) => void
  onProducto?: (producto: PayloadNuevoProducto) => void
  onReponer?: (reponer: PayloadReponer) => void
  onPedirSnapshot?: () => PayloadNuevoProducto[]
}): {
  sala: string
  estado: EstadoConexion
  escaneadoresConectados: number
} {
  const { onCodigo, onProducto, onReponer, onPedirSnapshot } = opciones
  const [sala] = useState(() => {
    const previa = leerSala()
    if (previa) return previa
    const nueva = generarSala()
    guardarSala(nueva)
    return nueva
  })
  const [estado, setEstado] = useState<EstadoConexion>('conectando')
  const [escaneadoresConectados, setEscaneadoresConectados] = useState(0)

  const onCodigoRef = useRef(onCodigo)
  const onProductoRef = useRef(onProducto)
  const onReponerRef = useRef(onReponer)
  const onPedirSnapshotRef = useRef(onPedirSnapshot)
  const salaRef = useRef(sala)

  useEffect(() => {
    onCodigoRef.current = onCodigo
    onProductoRef.current = onProducto
    onReponerRef.current = onReponer
    onPedirSnapshotRef.current = onPedirSnapshot
    salaRef.current = sala
  })

  useEffect(() => {
    let activo = true
    let ws: WebSocket | null = null
    let timer: number | undefined
    let intento = 0

    function conectar() {
      ws = new WebSocket(urlRelay())
      ws.onopen = () => {
        intento = 0
        ws?.send(JSON.stringify({ tipo: 'unirse', sala: salaRef.current, rol: 'caja' }))
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
            onCodigoRef.current(data.codigo)
          } else if (
            data.tipo === 'producto' &&
            data.producto &&
            typeof data.producto === 'object'
          ) {
            onProductoRef.current?.(data.producto as PayloadNuevoProducto)
          } else if (
            data.tipo === 'reponer' &&
            data.producto &&
            typeof data.producto === 'object'
          ) {
            onReponerRef.current?.(data.producto as PayloadReponer)
          } else if (data.tipo === 'pedir_snapshot') {
            const items = onPedirSnapshotRef.current?.()
            if (items && ws?.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  tipo: 'snapshot',
                  sala: salaRef.current.trim(),
                  items,
                }),
              )
            }
          } else if (data.tipo === 'presencia' && typeof data.escaneadores === 'number') {
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
        timer = window.setTimeout(conectar, Math.min(8000, 1000 * 2 ** intento))
        intento += 1
      }
    }

    conectar()
    return () => {
      activo = false
      if (timer) clearTimeout(timer)
      ws?.close()
    }
  }, [])

  return { sala, estado, escaneadoresConectados }
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
} {
  const [estado, setEstado] = useState<EstadoConexion>('conectando')
  const salaRef = useRef(sala)
  const wsRef = useRef<WebSocket | null>(null)
  const onProductoRef = useRef(opciones?.onProducto)
  const onSnapshotRef = useRef(opciones?.onSnapshot)

  useEffect(() => {
    salaRef.current = sala
    onProductoRef.current = opciones?.onProducto
    onSnapshotRef.current = opciones?.onSnapshot
  })

  useEffect(() => {
    let activo = true
    let timer: number | undefined
    let intento = 0
    const codigo = sala.trim().toUpperCase()
    if (!codigo) return

    function conectar() {
      const ws = new WebSocket(urlRelay())
      wsRef.current = ws
      ws.onopen = () => {
        intento = 0
        ws.send(JSON.stringify({ tipo: 'unirse', sala: codigo, rol: 'escaneador' }))
        if (activo) setEstado('conectado')
      }
      ws.onmessage = (ev) => {
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
            onProductoRef.current?.(data.producto as PayloadNuevoProducto)
          } else if (data.tipo === 'snapshot' && Array.isArray(data.items)) {
            onSnapshotRef.current?.(data.items as PayloadNuevoProducto[])
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
        wsRef.current = null
        setEstado('conectando')
        timer = window.setTimeout(conectar, Math.min(8000, 1000 * 2 ** intento))
        intento += 1
      }
    }

    conectar()
    return () => {
      activo = false
      if (timer) clearTimeout(timer)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [sala])

  function enviar(codigoBarras: string): boolean {
    const c = codigoBarras.trim()
    const ws = wsRef.current
    if (!c || !ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ tipo: 'codigo', sala: salaRef.current.trim(), codigo: c }))
    return true
  }

  function enviarProducto(producto: PayloadNuevoProducto): boolean {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(
      JSON.stringify({
        tipo: 'producto',
        sala: salaRef.current.trim(),
        producto,
      }),
    )
    return true
  }

  function reponerStock(reponer: PayloadReponer): boolean {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(
      JSON.stringify({
        tipo: 'reponer',
        sala: salaRef.current.trim(),
        producto: reponer,
      }),
    )
    return true
  }

  return { estado, enviar, enviarProducto, reponerStock }
}