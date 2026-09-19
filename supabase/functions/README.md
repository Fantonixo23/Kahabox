# Edge Functions (Deno)

Lógica que no debe vivir en el cliente. Se ejecutan en Supabase con runtime Deno.

## Priorizadas por fase

- **Fase 0**: registro del dueño + creación del primer tenant (`crear_tenant`):
  inserta en `auth.users` con service role y setea en `auth.users.app_metadata`
  los claims `{ tenant_id, rol }`. Sin esto el frontend no tiene `tenant_id` en el JWT.
- **Fase 1**: invitación de vendedor (magic link + alta en `usuarios_tenant`).
- **Fase 2**: `confirmar_venta` — valida stock con `UPDATE` atómico
  (`where cantidad >= :n`, rechazo si rowCount = 0) y dispara Realtime.
- **Fase 4**: comprobante SIFEN al confirmar una venta.

## Funciones existentes

- **`aprobar-registro`**: valida links firmados (HMAC con `APPROVAL_SECRET`) y
  aprueba/rechaza un tenant nuevo (`GET` con query params).
- **`notificar-registro`**: trigger de `tenants` → avisa por Discord + email con
  los links firmados de aprobación.
- **`unirse-invitacion`** (Fase 1, lista): alta de un empleado invitado por el
  dueño. `POST { token, email, password }` con service role: crea el usuario
  (`email_confirm: true`, `app_metadata.rol`, `user_metadata.invitacion='true'`
  para que el trigger `alta_tenant_al_registrarse` NO cree un tenant nuevo),
  lo vincula en `usuarios_tenant` con `estado='pendiente'` y marca la
  invitación como `registrado`. El acceso real se activa cuando el dueño llama
  `confirmar_miembro` (que carga los claims en `auth.users.app_metadata`).
  Secrets requeridos: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Convenciones

- Nuevas funciones: `supabase functions new <nombre>` y `supabase functions deploy <nombre>`.
- Solo importan dependencias desde `jsr:` / `esm.sh`. Nunca la service role key en el frontend.
- Los claims `tenant_id` y `rol` se leen en el JWT, nunca de campos que mande el cliente.