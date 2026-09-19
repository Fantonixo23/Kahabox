# Edge Functions (Deno)

Lógica que no debe vivir en el cliente. Se ejecutan en Supabase con runtime Deno.

## Priorizadas por fase

- **Fase 0**: registro del dueño + creación del primer tenant (`crear_tenant`):
  inserta en `auth.users` con service role y setea en `auth.users.app_metadata`
  los claims `{ tenant_id, rol }`. Sin esto el frontend no tiene `tenant_id` en el JWT.
- **Fase 1**: invitación de vendedor (magic link + alta en `usuarios_tenant`).
- **Fase 2**: `confirmar_venta` — valida stock con `UPDATE` atómico
  (`where cantidad >= :n`, rechazo si rowCount = 0) y dispara Realtime.

## Funciones existentes

- **`aprobar-registro`**: valida links firmados (HMAC con `APPROVAL_SECRET`) y
  aprueba/rechaza un tenant nuevo (`GET` con query params).
- **`notificar-registro`**: trigger de `tenants` → avisa por Discord + email con
  los links firmados de aprobación.

> Nota: `unirse-invitacion` (alta de empleados invitados) NUNCA se desplegó:
> se reemplazó por triggers 100% SQL (migración `20260918170000_...`) que
> validan el token y vinculan al invitado como `pendiente` cuando el front
> llama `auth.signUp` con `user_metadata.invitacion = <token>`. No requiere CLI.

## Convenciones

- Nuevas funciones: `supabase functions new <nombre>` y `supabase functions deploy <nombre>`.
- Solo importan dependencias desde `jsr:` / `esm.sh`. Nunca la service role key en el frontend.
- Los claims `tenant_id` y `rol` se leen en el JWT, nunca de campos que mande el cliente.