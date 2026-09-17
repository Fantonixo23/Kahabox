import { createClient } from 'npm:@supabase/supabase-js@2'

const APPROVAL_SECRET = Deno.env.get('APPROVAL_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const ACCIONES = {
  aprobar: 'trial',
  rechazar: 'rechazado',
} as const

const ICONOS: Record<string, string> = {
  check: `
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <circle class="anillo" cx="40" cy="40" r="36" stroke="#16a34a" stroke-width="6"/>
      <path class="marca" d="M24 41 L35 52 L56 29" stroke="#16a34a" stroke-width="7"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  x: `
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <circle class="anillo" cx="40" cy="40" r="36" stroke="#dc2626" stroke-width="6"/>
      <path class="marca" d="M28 28 L52 52 M52 28 L28 52" stroke="#dc2626" stroke-width="7"
        stroke-linecap="round"/>
    </svg>`,
  clock: `
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <circle class="anillo" cx="40" cy="40" r="36" stroke="#d97706" stroke-width="6"/>
      <path class="marca" d="M40 24 V40 L50 47" stroke="#d97706" stroke-width="7"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  alert: `
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path class="anillo" d="M40 10 L68 66 H12 Z" stroke="#dc2626" stroke-width="6"
        stroke-linejoin="round"/>
      <path class="marca" d="M40 34 V50" stroke="#dc2626" stroke-width="7"
        stroke-linecap="round"/>
      <circle cx="40" cy="60" r="3.5" fill="#dc2626"/>
    </svg>`,
  info: `
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <circle class="anillo" cx="40" cy="40" r="36" stroke="#2563eb" stroke-width="6"/>
      <path class="marca" d="M40 36 V54" stroke="#2563eb" stroke-width="7"
        stroke-linecap="round"/>
      <circle cx="40" cy="27" r="3.5" fill="#2563eb"/>
    </svg>`,
}

function pagina(
  tipo: keyof typeof ICONOS,
  titulo: string,
  detalle: string,
  accion?: string,
) {
  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${titulo} - Kahabox</title>
    <style>
      :root { --verde: #16a34a; --rojo: #dc2626; --ambar: #d97706;
        --azul: #2563eb; }
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100svh; display: grid; place-items: center;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        background:
          radial-gradient(1200px 600px at 15% -10%, #dcfce7 0%, transparent 55%),
          radial-gradient(1000px 500px at 110% 0%, #fef9c3 0%, transparent 50%),
          linear-gradient(160deg, #0f172a 0%, #1e293b 60%, #0f172a 100%);
        color: #0f172a;
      }
      .scrim { min-height: 100svh; width: 100%; display: grid;
        place-items: center; padding: 24px;
        background: rgba(2,6,23,.45); }
      .card { position: relative; width: 100%; max-width: 440px;
        background: #fff; border-radius: 24px; padding: 44px 36px 36px;
        text-align: center; box-shadow: 0 30px 80px rgba(0,0,0,.45);
        animation: subir .5s cubic-bezier(.2,.9,.3,1.2) both; }
      @keyframes subir { from { opacity: 0; transform: translateY(24px) scale(.96); }
        to { opacity: 1; transform: none; } }
      .marca-card { position: absolute; top: -22px; left: 50%;
        transform: translateX(-50%); font-weight: 800; letter-spacing: .5px;
        font-size: 13px; color: #fff; background: #0f172a;
        padding: 6px 14px; border-radius: 999px; }
      .icono { width: 88px; height: 88px; margin: 8px auto 18px; }
      .icono svg { width: 100%; height: 100%; }
      .anillo { fill: none; stroke-dasharray: 240; stroke-dashoffset: 240;
        animation: dibujar 1s .15s ease-out forwards; }
      .marca  { fill: none; stroke-dasharray: 80; stroke-dashoffset: 80;
        animation: dibujar .5s .8s ease-out forwards; }
      @keyframes dibujar { to { stroke-dashoffset: 0; } }
      h1 { margin: 0 0 10px; font-size: 26px; font-weight: 800;
        letter-spacing: -0.5px; line-height: 1.2; }
      .nombre { display: block; font-size: 15px; font-weight: 700;
        color: #64748b; text-transform: uppercase; letter-spacing: 1.5px;
        margin-bottom: 12px; }
      p { margin: 0 auto 26px; max-width: 320px; color: #475569;
        font-size: 15px; line-height: 1.55; }
      .acciones { display: flex; gap: 10px; justify-content: center;
        flex-wrap: wrap; }
      .btn { appearance: none; border: none; cursor: pointer;
        font: inherit; font-weight: 700; font-size: 14px;
        padding: 12px 22px; border-radius: 12px; transition: transform .15s,
        box-shadow .15s; }
      .btn:hover { transform: translateY(-1px); }
      .btn-primario { color: #fff;
        background: linear-gradient(180deg, #22c55e, #16a34a);
        box-shadow: 0 10px 24px rgba(22,163,74,.4); }
      .btn-secundario { color: #334155; background: #f1f5f9; }
      a.btn { text-decoration: none; }
      .foot { margin-top: 22px; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="scrim">
      <div class="card">
        <span class="marca-card">Kahabox</span>
        <div class="icono">${ICONOS[tipo]}</div>
        <h1>${titulo}</h1>
        ${accion ? `<span class="nombre">${accion}</span>` : ''}
        <p>${detalle}</p>
        <div class="acciones">
          <a class="btn btn-primario" href="https://kahabox.netlify.app">Ir a Kahabox</a>
          <button class="btn btn-secundario" type="button" onclick="window.close()">Cerrar</button>
        </div>
        <div class="foot">Aviso generado por Kahabox</div>
      </div>
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
    return pagina('info', 'Metodo no soportado', 'Este link se abre en el navegador.')
  }

  if (!APPROVAL_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Faltan secretos (APPROVAL_SECRET / SUPABASE_*)')
    return pagina('alert', 'Error de configuracion', 'Contacta al administrador.')
  }

  const url = new URL(req.url)
  const tenant = url.searchParams.get('tenant') ?? ''
  const accion = url.searchParams.get('accion') ?? ''
  const expRaw = url.searchParams.get('exp') ?? ''
  const firma = url.searchParams.get('firma') ?? ''

  const exp = Number(expRaw)
  const estadoDestino = ACCIONES[accion as keyof typeof ACCIONES]

  if (!tenant || !estadoDestino || !Number.isFinite(exp) || !firma) {
    return pagina('alert', 'Link invalido', 'Este link no es valido o esta incompleto.')
  }

  const now = Math.floor(Date.now() / 1000)
  if (exp < now) {
    return pagina('clock', 'Link vencido', 'Este link de aprobacion vencio. Entra al registro desde Kahabox.')
  }

  const mensaje = `${tenant}:${accion}:${exp}`
  if (!(await firmaValida(APPROVAL_SECRET, mensaje, firma))) {
    return pagina('alert', 'Link incorrecto', 'La firma de este link no coincide.')
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: fila } = await supabase
    .from('tenants')
    .select('id, estado, nombre_comercial')
    .eq('id', tenant)
    .maybeSingle()

  if (!fila) {
    return pagina(
      'info',
      'No disponible',
      'Este comercio ya no aparece en el sistema. Si el link ya fue usado, pedi uno nuevo por Discord.',
    )
  }

  const nombre = String(fila.nombre_comercial ?? 'El comercio')
    .trim()
    .toUpperCase()

  const yaProcesado = fila.estado === estadoDestino
  if (!yaProcesado) {
    const { error } = await supabase
      .from('tenants')
      .update({ estado: estadoDestino })
      .eq('id', tenant)
    if (error) {
      console.error(`Error al cambiar estado: ${error.message}`)
      return pagina(
        'alert',
        'Ocurrio un error',
        `${accion === 'aprobar' ? 'No se pudo aprobar' : 'No se pudo rechazar'} el registro. Intentalo de nuevo mas tarde.`,
      )
    }
  }

  if (estadoDestino === 'trial') {
    return pagina(
      'check',
      yaProcesado ? 'YA ESTABA APROBADA' : 'FUE ACEPTADA EXITOSAMENTE',
      yaProcesado
        ? 'Esta tienda ya estaba habilitada. Su dueno ya puede operar.'
        : 'La tienda quedo habilitada y su dueno ya puede empezar a operar en Kahabox.',
      nombre,
    )
  }
  return pagina(
    'x',
    yaProcesado ? 'YA ESTABA RECHAZADA' : 'FUE RECHAZADA',
    yaProcesado
      ? 'Esta tienda ya habia sido rechazada anteriormente.'
      : 'El registro quedo rechazado. El dueno vera ese estado al iniciar sesion.',
    nombre,
  )
})