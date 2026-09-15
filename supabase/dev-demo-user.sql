-- Kahabox — Setup del usuario demo local
-- PEGAR en Supabase Studio → SQL Editor (local: http://localhost:54323)
--
-- Requisito previo: Authentication → Users → Add user
--   email:    dueno@demo.com
--   password: demo1234
-- Si usás otro email, adaptalo en las dos sentencias.

-- 1) Guardá tenant_id + rol como custom claims del JWT (quedan bajo app_metadata).
--    Sin esto, RLS devuelve vacío: tenant_id_activo() da NULL.
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"tenant_id":"11111111-1111-1111-1111-111111111111","rol":"dueño"}'::jsonb,
    email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'dueno@demo.com';

-- 2) Alta como miembro del equipo (rol dueño) para que aparezca en "Mi equipo".
insert into public.usuarios_tenant (user_id, tenant_id, rol)
select u.id, '11111111-1111-1111-1111-111111111111'::uuid, 'dueño'
from auth.users u
where u.email = 'dueno@demo.com'
on conflict (user_id, tenant_id) do nothing;

-- 3) (Validación) El JWT nuevo debe traer el claim:
select id, email,
       raw_app_meta_data ->> 'tenant_id' as tenant_id,
       raw_app_meta_data ->> 'rol' as rol
from auth.users
where email = 'dueno@demo.com';