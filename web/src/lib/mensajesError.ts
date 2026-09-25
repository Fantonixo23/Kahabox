const ERRORES_EN_ESPANOL: Array<[RegExp, string]> = [
  [
    /invalid login credentials|invalid email or password/i,
    'Credenciales inválidas. Verificá tu email y contraseña e intentá de nuevo.',
  ],
  [
    /email not confirmed|email address not confirmed|email is not verified/i,
    'Tu email todavía no está verificado. Revisá tu casilla y clickeá el link de confirmación.',
  ],
  [
    /user already registered|already exists|user already/i,
    'Ese email ya tiene una cuenta. Entrá con tu contraseña o recuperala.',
  ],
  [
    /password should be at least 6 characters/i,
    'La contraseña debe tener al menos 6 caracteres.',
  ],
  [
    /new password should be different from the old password/i,
    'La nueva contraseña debe ser distinta de la anterior.',
  ],
  [/user not found|no user found/i, 'No existe una cuenta con ese email.'],
  [
    /rate limit exceeded|too many requests/i,
    'Muchos intentos seguidos. Esperá unos minutos y volvé a intentar.',
  ],
  [/signups not allowed/i, 'El registro no está habilitado.'],
  [
    /only request this once after 60 seconds/i,
    'Ya pediste el link recién. Esperá un minuto y volvé a intentar.',
  ],
  [/jwt expired|token has expired|expired.*link/i, 'El link expiró. Volvé a pedirlo desde la pantalla de acceso.'],
  [
    /failed to fetch|could not establish connection|network error/i,
    'No se pudo conectar con el servidor. Chequeá tu conexión a internet y probá de nuevo.',
  ],
]

/** Traduce a español los mensajes de error de Supabase que ve el usuario. */
export function mensajeErrorSupabase(mensaje: string): string {
  for (const [patron, texto] of ERRORES_EN_ESPANOL) {
    if (patron.test(mensaje)) return texto
  }
  return mensaje
}

/** Detecta (sobre el mensaje crudo) que el email todavía no fue confirmado. */
export function esErrorEmailNoConfirmado(mensaje: string): boolean {
  return /email not confirmed|email address not confirmed|email is not verified/i.test(
    mensaje,
  )
}

/**
 * Saca el mensaje legible de un error, sea cual sea su forma. supabase-js no
 * lanza objetos Error: tira un PostgrestError plano ({code, message, details,
 * hint}), así que `e instanceof Error` da false y el mensaje se perdía. Eso
 * importaba porque los raise exception de Postgres llegan como P0001 con HTTP
 * 400 y su message es lo único que dice qué validación falló — un not-null o un
 * check se leen como ruido si no se muestra.
 */
export function mensajeDeError(e: unknown, porDefecto = 'Ocurrió un error.'): string {
  if (typeof e === 'string') {
    const s = e.trim()
    return s === '' ? porDefecto : mensajeErrorSupabase(s)
  }
  if (e === null || typeof e !== 'object') return porDefecto

  const causa = e as { message?: unknown; details?: unknown; error?: unknown }
  for (const campo of [causa.message, causa.details, causa.error]) {
    if (typeof campo === 'string' && campo.trim() !== '') {
      return mensajeErrorSupabase(campo.trim())
    }
  }
  return porDefecto
}