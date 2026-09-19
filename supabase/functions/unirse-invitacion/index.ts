import { createClient } from 'npm:@supabase/supabase-js@2'

// ---------------------------------------------------------------
// unirse-invitacion: alta de un empleado invitado por el dueño.
//
// Flujo: el dueño genera la invitación en "Mi equipo" y comparte el link
// /unirme?invitacion=<token>. El invitado pone email + contraseña. Esta
// función crea la cuenta (password + email confirmado), lo vincula al tenant
// con estado 'pendiente' y marca la invitación como 'registrado'. Recién
// cuando el dueño lo confirma (confirmar_miembro) recibe los claims de
// acceso. Mientras tanto el JWT NO trae tenant_id, así que no ve nada.
//
// secretos: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ---------------------------------------------------------------

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Método no permitido.' }, 405)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Faltan secretos SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    return json(
      { ok: false, error: 'Error de configuración del servidor. Contactá al administrador.' },
      500,
    )
  }

  let body: { token?: unknown; email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'Pedido inválido.' }, 400)
  }

  const token = String(body?.token ?? '').trim()
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')

  if (!token || !/^[a-f0-9]{24,64}$/.test(token)) {
    return json({ ok: false, error: 'El link de invitación no es válido.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: 'Ingresá un email válido.' })
  }
  if (password.length < 6) {
    return json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: invitacion, error: errInvitacion } = await supabase
    .from('invitaciones')
    .select('id, tenant_id, empresa_nombre, nombre_invitado, rol, estado, expira_at')
    .eq('token', token)
    .maybeSingle()

  if (errInvitacion) {
    console.error(`Error al leer invitación: ${errInvitacion.message}`)
    return json({ ok: false, error: 'No pudimos validar la invitación. Intentá de nuevo.' }, 500)
  }
  if (!invitacion) {
    return json({
      ok: false,
      error: 'La invitación no existe o el link no es correcto. Pedile al dueño un link nuevo.',
    })
  }
  if (invitacion.estado !== 'pendiente') {
    return json({
      ok: false,
      error: 'Esta invitación ya fue procesada. Pedile al dueño un link nuevo.',
    })
  }
  if (new Date(invitacion.expira_at).getTime() < Date.now()) {
    return json({
      ok: false,
      error: 'Esta invitación venció. Pedile al dueño un link nuevo.',
    })
  }

  const { data: usuario, error: errCrear } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      invitacion: 'true',
      nombre: invitacion.nombre_invitado,
    },
    app_metadata: { rol: invitacion.rol },
  })

  if (errCrear) {
    // Detectar el caso "email ya registrado" para dar un mensaje útil.
    if (/already|exists|registered/i.test(String(errCrear.message))) {
      return json({
        ok: false,
        error: 'Ese email ya tiene una cuenta en Kahabox. Probá con otro correo.',
      })
    }
    console.error(`Error al crear usuario: ${errCrear.message}`)
    return json({ ok: false, error: 'No pudimos crear tu cuenta. Intentá de nuevo más tarde.' }, 500)
  }

  const { error: errMiembro } = await supabase.from('usuarios_tenant').insert({
    user_id: usuario.user.id,
    tenant_id: invitacion.tenant_id,
    rol: invitacion.rol,
    estado: 'pendiente',
    nombre: invitacion.nombre_invitado,
  })
  if (errMiembro) {
    console.error(`Error al vincular miembro: ${errMiembro.message}`)
    return json({ ok: false, error: 'No pudimos completar el alta. Intentá de nuevo más tarde.' }, 500)
  }

  const { error: errMarca } = await supabase
    .from('invitaciones')
    .update({ estado: 'registrado' })
    .eq('id', invitacion.id)
  if (errMarca) {
    console.error(`Error al marcar invitación: ${errMarca.message}`)
  }

  return json({
    ok: true,
    empresa: invitacion.empresa_nombre,
    nombre: invitacion.nombre_invitado,
  })
})