// Kahabox — notificar-registro
// Recibe el Database Webhook de public.tenants (INSERT) y avisa por Discord
// para que el superadmin apruebe el alta desde la consola /app/admin.
//
// Secrets:
//   DISCORD_WEBHOOK_URL  (obligatorio) URL del webhook de Discord.
//   APP_BASE_URL         (opcional) URL del frontend, ej. https://kahabox.netlify.app
//   WEBHOOK_SECRET       (opcional) si se configura, la función exige que el
//                        webhook mande el header `x-kahabox-webhook-secret`.

const DISCORD_WEBHOOK_URL = Deno.env.get('DISCORD_WEBHOOK_URL')
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/, '')
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

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
  const email = String(record.email_contacto ?? record.created_at ?? '')
  const creada = fechaLegible(String(record.created_at ?? ''))

  const adminUrl = APP_BASE_URL ? `${APP_BASE_URL}/app/admin` : '/app/admin'
  const extraUrl = APP_BASE_URL
    ? ''
    : '\n(Configurá APP_BASE_URL para el link directo)'

  const discord = {
    username: 'Kahabox',
    content: [
      '**🆕 Nueva tienda solicitando acceso**',
      `**Nombre:** ${nombre}`,
      email ? `**Email:** ${email}` : '',
      `**Registro:** ${creada}`,
      `→ Revisar: ${adminUrl}${extraUrl}`,
    ]
      .filter(Boolean)
      .join('\n'),
  }

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(discord),
  })

  if (!res.ok) {
    const texto = await res.text()
    console.error(`Discord respondio ${res.status}: ${texto}`)
    return json('Error al notificar a Discord', { status: 502 })
  }

  return json('ok')
})