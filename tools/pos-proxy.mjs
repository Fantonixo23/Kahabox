#!/usr/bin/env node
// Proxy CORS local para el terminal POS Bancard (uso en navegador de PC).
//
// El terminal físico Bancard no envía la cabecera `Access-Control-Allow-Origin`,
// así que el navegador bloquea la lectura de la respuesta (aunque la operación
// sí se ejecute en el POS). La app Android no lo necesita (usa CapacitorHttp).
//
// Uso:
//   node pos-proxy.mjs                # reenvía a http://127.0.0.1:9000
//   node pos-proxy.mjs 8999           # puerto local distinto
//   POS_TARGET=http://192.168.0.50:9000 node pos-proxy.mjs
//
// Después, en Configuración -> POS Bancard, IP: 127.0.0.1, Puerto: 8999.

import { createServer } from 'node:http'

const PUERTO_LOCAL = Number(process.argv[2] ?? process.env.POS_PROXY_PORT ?? 8999)
const OBJETIVO = process.env.POS_TARGET ?? 'http://127.0.0.1:9000'

const servidor = createServer((req, res) => {
  const url = new URL(req.url ?? '/', OBJETIVO)
  const destinoUrl = `${OBJETIVO}${url.pathname}${url.search}`

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cabecerasCors())
    res.end()
    return
  }

  const pedido = fetch(destinoUrl, {
    method: req.method,
    headers: {
      'Content-Type': req.headers['content-type'] ?? 'text/plain',
    },
    body: req.method === 'POST' || req.method === 'PUT' ? req : undefined,
  })

  pedido
    .then((respuesta) => {
      res.writeHead(respuesta.status, cabecerasCors({ 'Content-Type': 'application/json' }))
      respuesta.body?.pipe(res)
    })
    .catch((e) => {
      console.error(`[pos-proxy] error reenviando a ${destinoUrl}:`, e.message)
      res.writeHead(502, cabecerasCors({ 'Content-Type': 'application/json' }))
      res.end(JSON.stringify({ statusCode: 502, message: 'No se pudo alcanzar el POS.' }))
    })
})

function cabecerasCors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  }
}

servidor.listen(PUERTO_LOCAL, () => {
  console.log(`pos-proxy escuchando en http://127.0.0.1:${PUERTO_LOCAL} -> ${OBJETIVO}`)
})

servidor.on('clientError', (_req, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
})