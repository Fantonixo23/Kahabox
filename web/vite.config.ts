import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { WebSocketServer, type WebSocket } from 'ws'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

/**
 * Relay de sala para el "escáner remoto" (demo local).
 *
 * El celular escanea y reenvía el código a la compu que está en Caja, por un
 * WebSocket del mismo server de dev (ruta /relay). Es solo para desarrollo/demo:
 * en producción este flujo se reemplaza por Supabase Realtime.
 */
function relaySala(): Plugin {
  const salas = new Map<string, Set<{ ws: WebSocket; rol: 'caja' | 'escaneador' }>>()
  const wss = new WebSocketServer({ noServer: true })

  function rolDe(ws: WebSocket, rol: 'caja' | 'escaneador' = 'escaneador') {
    for (const miembros of salas.values()) {
      for (const m of miembros) if (m.ws === ws) m.rol = rol
    }
  }

  function dejarSala(ws: WebSocket) {
    for (const [sala, miembros] of salas) {
      for (const m of miembros) if (m.ws === ws) miembros.delete(m)
      if (miembros.size === 0) salas.delete(sala)
      else transmitirPresencia(sala)
    }
  }

  function transmitirPresencia(sala: string) {
    const miembros = salas.get(sala)
    if (!miembros) return
    let cajas = 0
    let escaneadores = 0
    for (const m of miembros) {
      if (m.rol === 'caja') cajas += 1
      else escaneadores += 1
    }
    const msg = JSON.stringify({ tipo: 'presencia', cajas, escaneadores })
    for (const m of miembros) {
      if (m.ws.readyState === 1) m.ws.send(msg)
    }
  }

  function enviarA(sala: string, rol: 'caja' | 'escaneador', data: unknown) {
    const miembros = salas.get(sala)
    if (!miembros) return
    const msg = JSON.stringify(data)
    for (const m of miembros) {
      if (m.rol === rol && m.ws.readyState === 1) m.ws.send(msg)
    }
  }

  function enviarOtros(sala: string, origen: WebSocket, data: unknown) {
    const miembros = salas.get(sala)
    if (!miembros) return
    const msg = JSON.stringify(data)
    for (const m of miembros) {
      if (m.ws !== origen && m.ws.readyState === 1) m.ws.send(msg)
    }
  }

  return {
    name: 'kahabox-relay',
    configureServer(server) {
      server.httpServer?.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname !== '/relay') return
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.on('message', (raw) => {
            try {
              const data = JSON.parse(raw.toString()) as {
                tipo?: string
                sala?: string
                rol?: 'caja' | 'escaneador'
                codigo?: string
                producto?: Record<string, unknown>
                items?: unknown[]
              }
              if (!data.tipo || typeof data.sala !== 'string') return
              if (data.tipo === 'unirse') {
                rolDe(ws, data.rol)
                if (!salas.has(data.sala)) salas.set(data.sala, new Set())
                salas.get(data.sala)?.add({ ws, rol: data.rol ?? 'escaneador' })
                if (data.rol !== 'caja') {
                  enviarA(data.sala, 'caja', { tipo: 'pedir_snapshot' })
                }
                transmitirPresencia(data.sala)
              } else if (data.tipo === 'codigo' && typeof data.codigo === 'string') {
                enviarA(data.sala, 'caja', { tipo: 'codigo', codigo: data.codigo })
              } else if (
                data.tipo === 'producto' &&
                data.producto &&
                typeof data.producto === 'object'
              ) {
                enviarOtros(data.sala, ws, {
                  tipo: 'producto',
                  producto: data.producto,
                })
              } else if (
                data.tipo === 'reponer' &&
                data.producto &&
                typeof data.producto === 'object'
              ) {
                enviarA(data.sala, 'caja', {
                  tipo: 'reponer',
                  producto: data.producto,
                })
              } else if (
                data.tipo === 'snapshot' &&
                Array.isArray(data.items)
              ) {
                enviarOtros(data.sala, ws, {
                  tipo: 'snapshot',
                  items: data.items,
                })
              } else if (data.tipo === 'pedir_snapshot') {
                enviarA(data.sala, 'caja', { tipo: 'pedir_snapshot' })
              }
            } catch {
              // Mensaje inválido: se ignora.
            }
          })
          ws.on('close', () => dejarSala(ws))
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // HTTPS de desarrollo con certificado autofirmado: necesario para que la
    // cámara (getUserMedia) funcione desde el celular en la red local.
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      manifest: {
        name: 'Kahabox',
        short_name: 'Kahabox',
        description: 'Gestión de stock multi-tenant para PYMES revendedoras',
        theme_color: '#faf6f1',
        background_color: '#faf6f1',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
    }),
    relaySala(),
  ],
  server: {
    // Exponer en la red local para probar desde el celular (https).
    host: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})