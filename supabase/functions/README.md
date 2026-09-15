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

## Convenciones

- Nuevas funciones: `supabase functions new <nombre>` y `supabase functions deploy <nombre>`.
- Solo importan dependencias desde `jsr:` / `esm.sh`. Nunca la service role key en el frontend.
- Los claims `tenant_id` y `rol` se leen en el JWT, nunca de campos que mande el cliente.