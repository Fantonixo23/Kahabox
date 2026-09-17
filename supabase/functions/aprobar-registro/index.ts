import { createClient } from 'npm:@supabase/supabase-js@2'

const APPROVAL_SECRET = Deno.env.get('APPROVAL_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? 'https://kahabox.netlify.app').replace(
  /\/$/,
  '',
)

const ACCIONES = {
  aprobar: 'trial',
  rechazar: 'rechazado',
} as const

// Redirige al frontend (/aprobado), que muestra la pantalla de confirmación
// con el diseño de la app. La función nunca sirve HTML: valida y cambia estado.
function redirect(resultado: string, extra?: { n?: string; m?: string }) {
  const params = new URLSearchParams({ r: resultado })
  if (extra?.n) params.set('n', extra.n)
  if (extra?.m) params.set('m', extra.m)
  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_BASE_URL}/aprobado?${params.toString()}` },
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
    return redirect('error', { m: 'Este link se abre en el navegador.' })
  }

  if (!APPROVAL_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Faltan secretos (APPROVAL_SECRET / SUPABASE_*)')
    return redirect('error', { m: 'Error de configuracion. Contacta al administrador.' })
  }

  const url = new URL(req.url)
  const tenant = url.searchParams.get('tenant') ?? ''
  const accion = url.searchParams.get('accion') ?? ''
  const expRaw = url.searchParams.get('exp') ?? ''
  const firma = url.searchParams.get('firma') ?? ''

  const exp = Number(expRaw)
  const estadoDestino = ACCIONES[accion as keyof typeof ACCIONES]

  if (!tenant || !estadoDestino || !Number.isFinite(exp) || !firma) {
    return redirect('error', { m: 'Este link no es valido o esta incompleto.' })
  }

  const now = Math.floor(Date.now() / 1000)
  if (exp < now) {
    return redirect('error', { m: 'Este link de aprobacion vencio. Pedi uno nuevo por Discord.' })
  }

  const mensaje = `${tenant}:${accion}:${exp}`
  if (!(await firmaValida(APPROVAL_SECRET, mensaje, firma))) {
    return redirect('error', { m: 'La firma de este link no coincide.' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: fila } = await supabase
    .from('tenants')
    .select('id, estado, nombre_comercial')
    .eq('id', tenant)
    .maybeSingle()

  if (!fila) {
    return redirect('error', {
      m: 'Este comercio ya no aparece en el sistema. Si el link ya fue usado, pedi uno nuevo por Discord.',
    })
  }

  const nombre = String(fila.nombre_comercial ?? 'El comercio').trim().toUpperCase()

  const yaProcesado = fila.estado === estadoDestino
  if (!yaProcesado) {
    const { error } = await supabase
      .from('tenants')
      .update({ estado: estadoDestino })
      .eq('id', tenant)
    if (error) {
      console.error(`Error al cambiar estado: ${error.message}`)
      return redirect('error', {
        m: `${accion === 'aprobar' ? 'No se pudo aprobar' : 'No se pudo rechazar'} el registro. Intentalo de nuevo mas tarde.`,
      })
    }
  }

  if (estadoDestino === 'trial') {
    return redirect(yaProcesado ? 'ya-aceptada' : 'aceptada', { n: nombre })
  }
  return redirect(yaProcesado ? 'ya-rechazada' : 'rechazada', { n: nombre })
})