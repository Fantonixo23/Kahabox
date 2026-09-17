-- Kahabox — Webhook de nuevos tenants.
-- Equivale al Database Webhook del dashboard: al insertar un tenant dispara
-- supabase_functions.http_request hacia notificar-registro, que valida el
-- header x-kahabox-webhook-secret (mismo valor que el secret WEBHOOK_SECRET
-- de la función) y avisa a Discord con links firmados de aprobación.
-- El body '{}' hace que la plataforma genere el payload (type/table/record)
-- automáticamente.

-- Requiere que los Database Webhooks estén habilitados (schema supabase_functions
-- con la función http_request). Se habilitó vía Management API.

create trigger "webhook_tenants_nuevo"
after insert on "public"."tenants"
for each row
execute function "supabase_functions"."http_request"(
  'https://ilqykdffuwezwhvdjopd.supabase.co/functions/v1/notificar-registro',
  'POST',
  '{"Content-Type":"application/json","x-kahabox-webhook-secret":"a3380152b4b94034ced0177dd9d750c277370f7f2fae9a660a8ea9b3bf14ece2"}',
  '{}',
  '1000'
);