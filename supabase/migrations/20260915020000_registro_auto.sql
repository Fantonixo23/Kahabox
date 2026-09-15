-- =============================================================================
-- Kahabox — Migración 0002: registro del dueño (alta automática del tenant)
-- Fase 0 / piloto. Cuando un usuario nuevo confirma su email (auth.users insertado
-- con email_confirmed_at), se crea su tenant, la sucursal principal, su rol dueño
-- y los claims tenant_id + rol en raw_app_meta_data (van al JWT → RLS activa).
-- Revisión futura (Fase 3): reemplazable por una Edge Function de onboarding
-- / invitación del dueño con cobro. Como es trial, el superadmin puede suspender.
-- =============================================================================

create or replace function public.alta_tenant_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_id uuid;
  nombre_tienda text;
begin
  -- Nombre de la tienda viene en user_metadata (llegó del form de registro).
  nombre_tienda := nullif(new.raw_user_meta_data ->> 'nombre_tienda', '');

  -- 1) Tenant nuevo (siempre como trial).
  insert into public.tenants (nombre_comercial, estado, plan)
  values (coalesce(nombre_tienda, 'Mi tienda'), 'trial', 'piloto')
  returning id into tenant_id;

  -- 2) Sucursal principal (regla del modelo: 1 tenant arranca con 1 sucursal).
  insert into public.sucursales (tenant_id, nombre, direccion)
  values (tenant_id, 'Sucursal principal', null);

  -- 3) El usuario es el dueño.
  insert into public.usuarios_tenant (user_id, tenant_id, rol)
  values (new.id, tenant_id, 'dueño');

  -- 4) Claims en app_metadata → el próximo JWT trae tenant_id y rol.
  update auth.users
  set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('tenant_id', tenant_id::text, 'rol', 'dueño')
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists alta_tenant_al_registrarse on auth.users;

create trigger alta_tenant_al_registrarse
  after insert on auth.users
  for each row execute function public.alta_tenant_al_registrarse();

-- Nota: el trigger corre en cada INSERT en auth.users (signup, alta manual por
-- Studio/API admin). Es el comportamiento deseado en piloto: cada cuenta nueva
-- es un tenant trial propio.