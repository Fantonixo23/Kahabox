// Kahabox — aprobar-registro
// Endpoint GET invocado desde los links firmados del aviso de Discord.
// Valida la firma (HMAC-SHA256 con APPROVAL_SECRET) y la expiración, actualiza
// tenants.estado (aprobar → 'trial', rechazar → 'rechazado') con service role y
// devuelve una página HTML simple de confirmación. Idempotente.
//
// Secrets:
//   APPROVAL_SECRET (obligatorio) mismo valor que usa notificar-registro.

import { createClient } from 'npm:@supabase/supabase-js@2'

const APPROVAL_SECRET = Deno.env.get('APPROVAL_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const ACCIONES = {
  aprobar: 'trial',
  rechazar: 'rechazado',
} as const

function pagina(emoji: string, titulo: string, detalle: string) {
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titulo} — Kahabox</title>
    <style>
      body { margin: 0; min-height: 100svh; display: grid; place-items: center;
        font-family: system-ui, sans-serif; background: #f6f5f2; color: #1c1917; }
      .card { text-align: center; background: #fff; padding: 40px 32px;
        border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); max-width: 380px; }
      .emoji { font-size: 48px; }
      h1 { font-size: 20px; margin: 12px 0 8px; }
      p { margin: 0; font-size: 14px; color: #57534e; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="emoji">${emoji}</div>
      <h1>${titulo}</h1>
      <p>${detalle}</p>
    </div>
  </body>
</html>`
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function firmaValida(
  secreto: string,
  mensaje: string,
  firmaHex: string,
): Promise<boolean> {
  if (!/^[0-9a-fA-F]+$/.test(firmaHex)) return false
  const firmaBytes = new Uint8Array(
    (firmaHex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
  )
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secreto),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    return await crypto.subtle.verify(
      'HMAC',
      key,
      firmaBytes,
      new TextEncoder().encode(mensaje),
    )
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return pagina('ℹ️', 'Método no soportado', 'Este link se abre en el navegador.')
  }

  if (!APPROVAL_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Faltan secretos (APPROVAL_SECRET / SUPABASE_*)')
    return pagina('⚠️', 'Error de configuración', 'Contactá al administrador.')
  }

  const url = new URL(req.url)
  const tenant = url.searchParams.get('tenant') ?? ''
  const accion = url.searchParams.get('accion') ?? ''
  const expRaw = url.searchParams.get('exp') ?? ''
  const firma = url.searchParams.get('firma') ?? ''

  const exp = Number(expRaw)
  const estadoDestino = ACCIONES[accion as keyof typeof ACCIONES]

  if (!tenant || !estadoDestino || !Number.isFinite(exp) || !firma) {
    return pagina('⚠️', 'Link inválido', 'Este link no es válido o está incompleto.')
  }

  const now = Math.floor(Date.now() / 1000)
  if (exp < now) {
    return pagina('⏰', 'Link vencido', 'Este link de aprobación expiró. Entrá al registro desde Kahabox.')
  }

  const mensaje = `${tenant}:${accion}:${exp}`
  if (!(await firmaValida(APPROVAL_SECRET, mensaje, firma))) {
    return pagina('🚫', 'Link incorrecto', 'La firma de este link no coincide.')
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: fila } = await supabase
    .from('tenants')
    .select('id, estado')
    .eq('id', tenant)
    .maybeSingle()

  if (!fila) {
    return pagina('🕳️', 'No encontrado', 'Ese comercio no existe en el sistema.')
  }

  const yaProcesado = fila.estado === estadoDestino
  if (!yaProcesado) {
    const { error } = await supabase
      .from('tenants')
      .update({ estado: estadoDestino })
      .eq('id', tenant)
    if (error) {
      console.error(`Error al cambiar estado: ${error.message}`)
      return pagina('⚠️', 'Error', `${accion === 'aprobar' ? 'No se pudo aprobar' : 'No se pudo rechazar'} el registro. Intentalo de nuevo.`)
    }
  }

  if (estadoDestino === 'trial') {
    return pagina(
      '✅',
      yaProcesado ? 'Ya estaba aprobada' : 'Aprobada',
      'La tienda quedó habilitada. ¡Su dueño ya puede empezar a operar!',
    )
  }
  return pagina(
    '🚫',
    yaProcesado ? 'Ya estaba rechazada' : 'Rechazada',
    'El registro quedó rechazado. El dueño verá ese estado al entrar.',
  )
})