// Kahabox — notificar-registro
// Recibe el trigger (INSERT en public.tenants) y avisa por Discord con links
// firmados para aprobar/rechazar el alta. Usa embeds: un resumen de la tienda
// y dos bloques tipo boton: Aceptar (azul) y Rechazar (rojo).
//
// Secrets:
//   DISCORD_WEBHOOK_URL  (obligatorio) URL del webhook de Discord.
//   APPROVAL_SECRET      (obligatorio) secreto para firmar los links.
//   WEBHOOK_SECRET       (opcional) header x-kahabox-webhook-secret exigido.
//   APPROVAL_FUNCTION_URL (opcional) base publica de aprobar-registro; si no,
//                        se deriva de la URL de la propia request.

const DISCORD_WEBHOOK_URL = Deno.env.get('DISCORD_WEBHOOK_URL')
const APPROVAL_SECRET = Deno.env.get('APPROVAL_SECRET')
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')
const APPROVAL_FUNCTION_URL = Deno.env.get('APPROVAL_FUNCTION_URL')

const EXPIRACION_SEG = 7 * 24 * 60 * 60 // 7 días

function json(data: BodyInit, init?: ResponseInit) {
  return new Response(data, { status: 200, ...init })
}

function fechaLegible(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-PY', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

// HMAC-SHA256 en hex (Web Crypto de Deno).
async function firmar(secreto: string, mensaje: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const firma = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(mensaje),
  )
  return Array.from(new Uint8Array(firma))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json('Método no soportado', { status: 405 })
  }

  if (WEBHOOK_SECRET && req.headers.get('x-kahabox-webhook-secret') !== WEBHOOK_SECRET) {
    return json('No autorizado', { status: 401 })
  }

  if (!DISCORD_WEBHOOK_URL) {
    return json('Falta DISCORD_WEBHOOK_URL', { status: 500 })
  }
  if (!APPROVAL_SECRET) {
    return json('Falta APPROVAL_SECRET', { status: 500 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json('Payload inválido')
  }

  const { type, table, record } = (body ?? {}) as {
    type?: string
    table?: string
    record?: Record<string, unknown> | null
  }

  if (type !== 'INSERT' || table !== 'tenants' || !record) {
    // No es un alta de tenant: nada que avisar.
    return json('ok')
  }

  const nombre = String(record.nombre_comercial ?? 'Mi tienda')
  const email = String(record.email_contacto ?? '')
  const creada = fechaLegible(String(record.created_at ?? ''))
  const tenantId = String(record.id ?? '')

  // Base pública de aprobar-registro (mismo proyecto que esta función).
  let base: string
  try {
    const u = new URL(req.url)
    base = APPROVAL_FUNCTION_URL
      ? APPROVAL_FUNCTION_URL.replace(/\/$/, '')
      : `${u.origin}/functions/v1/aprobar-registro`
  } catch {
    base = APPROVAL_FUNCTION_URL ?? ''
  }

  const exp = Math.floor(Date.now() / 1000) + EXPIRACION_SEG

  const linkAprobar = tenantId
    ? `${base}?tenant=${encodeURIComponent(tenantId)}&accion=aprobar&exp=${exp}&firma=${await firmar(APPROVAL_SECRET, `${tenantId}:aprobar:${exp}`)}`
    : ''
  const linkRechazar = tenantId
    ? `${base}?tenant=${encodeURIComponent(tenantId)}&accion=rechazar&exp=${exp}&firma=${await firmar(APPROVAL_SECRET, `${tenantId}:rechazar:${exp}`)}`
    : ''

  const embeds = [
    {
      color: 0x0ea5e9,
      title: 'Nueva tienda solicitando acceso',
      fields: [
        { name: 'Tienda', value: nombre, inline: true },
        { name: 'Email', value: email || '—', inline: true },
        { name: 'Registro', value: creada, inline: true },
      ],
      timestamp: new Date().toISOString(),
    },
    {
      color: 0x2563eb,
      title: 'Aprobar',
      description: linkAprobar ? `[**Aceptar**](${linkAprobar})` : 'Sin link',
    },
    {
      color: 0xdc2626,
      title: 'Rechazar',
      description: linkRechazar ? `[**Rechazar**](${linkRechazar})` : 'Sin link',
    },
  ]

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Kahabox', embeds }),
  })

  if (!res.ok) {
    const texto = await res.text()
    console.error(`Discord respondio ${res.status}: ${texto}`)
    return json('Error al notificar a Discord', { status: 502 })
  }

  return json('ok')
})