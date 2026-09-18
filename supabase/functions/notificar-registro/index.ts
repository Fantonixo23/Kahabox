// Kahabox — notificar-registro
// Recibe el trigger (INSERT en public.tenants) y avisa por Discord con links
// firmados para aprobar/rechazar el alta. Usa embeds: un resumen de la tienda
// y dos bloques tipo boton: Aceptar (azul) y Rechazar (rojo).
// Ademas envia el mismo aviso por email (SMTP, por defecto Gmail) si esta
// configurado; el email es opcional y su fallo no afecta el aviso por Discord.
//
// Secrets:
//   DISCORD_WEBHOOK_URL  (obligatorio) URL del webhook de Discord.
//   APPROVAL_SECRET      (obligatorio) secreto para firmar los links.
//   WEBHOOK_SECRET       (opcional) header x-kahabox-webhook-secret exigido.
//   APPROVAL_FUNCTION_URL (opcional) base publica de aprobar-registro; si no,
//                        se deriva de la URL de la propia request.
//   EMAIL_DESTINO        (opcional) destinatario(s) del aviso, separados por coma.
//   EMAIL_SMTP_USER      (opcional) usuario SMTP (para Gmail: la cuenta @gmail.com).
//   EMAIL_SMTP_PASS      (opcional) password de aplicacion de Gmail (16 caracteres).
//   EMAIL_SMTP_HOST      (opcional) host SMTP, default smtp.gmail.com.
//   EMAIL_SMTP_PORT      (opcional) puerto, default 465 (TLS).

import { SmtpClient } from 'jsr:@std/smtp'

const DISCORD_WEBHOOK_URL = Deno.env.get('DISCORD_WEBHOOK_URL')
const APPROVAL_SECRET = Deno.env.get('APPROVAL_SECRET')
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')
const APPROVAL_FUNCTION_URL = Deno.env.get('APPROVAL_FUNCTION_URL')

const EMAIL_DESTINO = Deno.env.get('EMAIL_DESTINO')
const EMAIL_SMTP_USER = Deno.env.get('EMAIL_SMTP_USER')
const EMAIL_SMTP_PASS = Deno.env.get('EMAIL_SMTP_PASS')
const EMAIL_SMTP_HOST = Deno.env.get('EMAIL_SMTP_HOST') ?? 'smtp.gmail.com'
const EMAIL_SMTP_PORT = Number.isFinite(Number(Deno.env.get('EMAIL_SMTP_PORT')))
  ? Number(Deno.env.get('EMAIL_SMTP_PORT'))
  : 465

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

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type Notificacion = {
  nombre: string
  email: string
  creada: string
  linkAprobar: string
  linkRechazar: string
}

async function enviarEmail(n: Notificacion): Promise<void> {
  const destinos = (EMAIL_DESTINO ?? '')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
  if (!EMAIL_SMTP_USER || !EMAIL_SMTP_PASS || destinos.length === 0) {
    console.warn(
      'Email no configurado: falta EMAIL_SMTP_USER, EMAIL_SMTP_PASS o EMAIL_DESTINO',
    )
    return
  }

  const boton = (href: string, texto: string, fondo: string) => {
    if (!href) return ''
    return `<a href="${href}" style="background:${fondo};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600">${texto}</a>`
  }

  const texto = [
    'Nueva tienda solicitando acceso a Kahabox.',
    '  Tienda: ' + n.nombre,
    '  Email: ' + (n.email || '—'),
    '  Registro: ' + n.creada,
    '',
    'Aprobar: ' + (n.linkAprobar || 'Sin link'),
    'Rechazar: ' + (n.linkRechazar || 'Sin link'),
    '',
    'El link de aprobacion vence en 7 dias.',
  ].join('\r\n')

  const html = [
    '<div style="font-family:Arial,sans-serif;font-size:14px;max-width:520px;margin:auto;padding:20px;background:#faf6f1;border-radius:12px">',
    '  <h2 style="margin:0 0 12px;color:#0c0a09">Nueva tienda solicitando acceso</h2>',
    '  <table style="border-collapse:collapse;margin-bottom:16px">',
    `    <tr><td style="padding:4px 12px 4px 0;color:#78716c">Tienda</td><td style="padding:4px 0;font-weight:600">${esc(n.nombre)}</td></tr>`,
    `    <tr><td style="padding:4px 12px 4px 0;color:#78716c">Email</td><td style="padding:4px 0">${esc(n.email || '—')}</td></tr>`,
    `    <tr><td style="padding:4px 12px 4px 0;color:#78716c">Registro</td><td style="padding:4px 0">${esc(n.creada)}</td></tr>`,
    '  </table>',
    `  <div style="display:flex;gap:12px">${boton(n.linkAprobar, 'Aprobar', '#2563eb')}${boton(n.linkRechazar, 'Rechazar', '#dc2626')}</div>`,
    '  <p style="color:#a8a29e;font-size:12px;margin-top:16px">El link de aprobación vence en 7 días.</p>',
    '</div>',
  ]
    .join('')
    .replace(/\r?\n/g, '\r\n')

  const reemails = destinos.filter((d) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d))
  if (reemails.length === 0) {
    console.warn('EMAIL_DESTINO no contiene direcciones válidas', destinos)
    return
  }

  const client = new SmtpClient()
  try {
    await client.connect({
      hostname: EMAIL_SMTP_HOST,
      port: EMAIL_SMTP_PORT,
      tls: true,
      auth: { username: EMAIL_SMTP_USER, password: EMAIL_SMTP_PASS },
    })
    await client.send({
      from: `Kahabox <${EMAIL_SMTP_USER}>`,
      to: reemails,
      subject: `Nueva tienda: ${n.nombre} — aprobar acceso`,
      content: texto,
      html,
    })
  } finally {
    await client.close()
  }
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

  // Aviso por email: si esta configurado, se envia en paralelo. Un fallo aca
  // no debe impedir que la funcion responda OK (el canal principal es Discord).
  try {
    await enviarEmail({ nombre, email, creada, linkAprobar, linkRechazar })
  } catch (err) {
    console.error('Fallo el envio de email:', err)
  }

  return json('ok')
})