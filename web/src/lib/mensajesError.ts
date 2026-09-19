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