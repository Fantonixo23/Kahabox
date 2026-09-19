import type { RolApp } from '@/lib/config'
import {
  cancelarInvitacionMock,
  confirmarMiembroMock,
  crearInvitacionMock,
  getMockInvitaciones,
  getMockMiembros,
  miEstadoEquipoMock,
  obtenerInvitacionMock,
  quitarMiembroMock,
  rechazarMiembroMock,
  setRolMiembroMock,
  type InvitacionPublica,
} from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type MiembroDetalle = {
  id: string
  userId: string
  rol: RolApp
  estado: 'activo' | 'pendiente' | 'rechazado'
  nombre: string | null
  email: string | null
  alta: string
}

export type InvitacionDetalle = {
  id: string
  nombre: string
  rol: 'administrador' | 'vendedor'
  estado: 'pendiente' | 'registrado' | 'cancelada'
  empresa: string
  creadaAt: string
  expiraAt: string
  token: string
}

export type ResultadoUnirse =
  | { estado: 'registrado'; empresa: string; nombre: string }
  | { estado: 'email_en_uso' }

// ---------- listado e invitación ----------

export async function listarMiembros(): Promise<MiembroDetalle[]> {
  if (!isSupabaseConfigured) {
    return getMockMiembros().map((m) => ({
      id: m.id,
      userId: m.user_id,
      rol: m.rol,
      estado: m.estado,
      nombre: m.nombre,
      email: m.user_id === '99999999-9999-4999-9999-999999999999' ? 'demo@kahabox.com' : null,
      alta: m.created_at,
    }))
  }
  const { data, error } = await supabase.rpc('listar_miembros')
  if (error) throw new Error(error.message)
  return (data ?? []).map((fila) => ({
    id: fila.id,
    userId: fila.user_id,
    rol: fila.rol,
    estado: fila.estado,
    nombre: fila.nombre,
    email: fila.email,
    alta: fila.created_at,
  }))
}

export async function listarInvitaciones(): Promise<InvitacionDetalle[]> {
  if (!isSupabaseConfigured) {
    return getMockInvitaciones().map((inv) => ({
      id: inv.id,
      nombre: inv.nombre_invitado,
      rol: inv.rol,
      estado: inv.estado,
      empresa: inv.empresa_nombre,
      creadaAt: inv.created_at,
      expiraAt: inv.expira_at,
      token: inv.token,
    }))
  }
  const { data, error } = await supabase
    .from('invitaciones')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((inv) => ({
    id: inv.id,
    nombre: inv.nombre_invitado,
    rol: inv.rol,
    estado: inv.estado,
    empresa: inv.empresa_nombre,
    creadaAt: inv.created_at,
    expiraAt: inv.expira_at,
    token: inv.token,
  }))
}

export async function crearInvitacion(
  nombre: string,
  rol: 'administrador' | 'vendedor',
): Promise<{ id: string; token: string }> {
  if (!isSupabaseConfigured) {
    const creada = crearInvitacionMock({ nombre, rol })
    return { id: creada.id, token: creada.token }
  }
  const { data, error } = await supabase.rpc('crear_invitacion', {
    p_nombre: nombre,
    p_rol: rol,
  })
  if (error) throw new Error(error.message)
  const fila = data?.[0]
  if (!fila) throw new Error('No se pudo generar la invitación.')
  return { id: fila.id, token: fila.token }
}

export async function cancelarInvitacion(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    cancelarInvitacionMock(id)
    return
  }
  const { error } = await supabase
    .from('invitaciones')
    .update({ estado: 'cancelada' })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------- página pública de bienvenida ----------

export async function obtenerInvitacion(token: string): Promise<InvitacionPublica | null> {
  if (!isSupabaseConfigured) return obtenerInvitacionMock(token)
  const { data, error } = await supabase.rpc('obtener_invitacion', { p_token: token })
  if (error) throw new Error(error.message)
  return data?.[0] ?? null
}

export async function unirseInvitacion(
  token: string,
  email: string,
  password: string,
  nombre?: string,
): Promise<ResultadoUnirse> {
  if (!isSupabaseConfigured) {
    // Demo: simulamos el alta pendiente.
    await new Promise((r) => setTimeout(r, 600))
    const invitacion = obtenerInvitacionMock(token)
    if (!invitacion) throw new Error('La invitación no es válida.')
    return {
      estado: 'registrado',
      empresa: invitacion.empresa_nombre ?? 'Kaha Demo',
      nombre: invitacion.nombre_invitado ?? '',
    }
  }

  // Revalidamos el token a último momento: puede vencer entre el load y el submit.
  const vigente = await obtenerInvitacion(token)
  if (!vigente) {
    throw new Error('La invitación venció o ya fue usada. Pedile al dueño que te envíe un link nuevo.')
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { invitacion: token, nombre: nombre?.trim() || vigente.nombre_invitado },
    },
  })

  if (error) {
    if (/already\s+registered|already\s+exists|user\s+already/i.test(error.message)) {
      return { estado: 'email_en_uso' }
    }
    throw new Error(error.message)
  }

  // Con confirmación por email habilitada, Supabase NO devuelve sesión ni error
  // para el caso "email ya existe": devuelve un usuario con identidades vacías.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { estado: 'email_en_uso' }
  }

  return {
    estado: 'registrado',
    empresa: vigente.empresa_nombre ?? '',
    nombre: vigente.nombre_invitado ?? '',
  }
}

// ---------- confirmación / roles ----------

export async function confirmarMiembro(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    confirmarMiembroMock(id)
    return
  }
  const { error } = await supabase.rpc('confirmar_miembro', { p_miembro_id: id })
  if (error) throw new Error(error.message)
}

export async function rechazarMiembro(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    rechazarMiembroMock(id)
    return
  }
  const { error } = await supabase.rpc('rechazar_miembro', { p_miembro_id: id })
  if (error) throw new Error(error.message)
}

export async function setRolMiembro(id: string, rol: 'administrador' | 'vendedor'): Promise<void> {
  if (!isSupabaseConfigured) {
    setRolMiembroMock(id, rol)
    return
  }
  const { error } = await supabase.rpc('set_rol_miembro', { p_miembro_id: id, p_rol: rol })
  if (error) throw new Error(error.message)
}

export async function quitarMiembro(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    quitarMiembroMock(id)
    return
  }
  const { error } = await supabase.rpc('quitar_miembro', { p_miembro_id: id })
  if (error) throw new Error(error.message)
}

export async function miEstadoEquipo(): Promise<'activo' | 'pendiente' | 'rechazado' | null> {
  if (!isSupabaseConfigured) return miEstadoEquipoMock()
  const { data, error } = await supabase.rpc('mi_estado_equipo')
  if (error) {
    // Sin lectura (ej. miembro sin tenant todavía o error de red): el gate no bloquea.
    return null
  }
  return data?.[0]?.estado ?? null
}

// ---------- helpers de presentación ----------

export function linkInvitacion(token: string): string {
  return `${window.location.origin}/unirme?invitacion=${token}`
}

export function mensajeWhatsApp(nombre: string, empresa: string, link: string): string {
  return `Hola! ${nombre}, ${empresa} quiere que formes parte del equipo! Sumate acá: ${link}`
}

export function urlWhatsApp(mensaje: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensaje)}`
}