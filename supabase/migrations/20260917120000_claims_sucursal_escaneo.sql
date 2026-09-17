-- =============================================================================
-- Kahabox — Migración 0013: claim sucursal_id para el escáner remoto multi-sucursal
-- Fase 0 / piloto. El canal de Realtime del escáner (kahabox:{tenant}:{sala}) no
-- distingue sucursal: dos locales del mismo tenant con "Caja 1" se pisarían. Para
-- eso el JWT necesita saber a qué sucursal pertenece el usuario.
--
-- Se agrega `app_metadata.sucursal_id`:
--   1) en el trigger de registro (nuevos tenant arrancan con su sucursal en el claim)
--   2) backfill idempotente: usuarios cuyo tenant tiene UNA sola sucursal (caso
--      piloto) reciben ese claim. Tenants multi-sucursal quedan sin claim hasta que
--      exista la asignación usuario→sucursal (fuera de alcance hoy).
--
-- Sin claim, el canal se arma igual que antes (kahabox:{tenant}:{sala}); con claim,
-- queda kabahox:{tenant}:{sucursal_id}:{sala} — ver web/src/lib/escaneoRemoto.ts.
-- El claim viaja en el próximo JWT (el frontend lo relee en cada sesión nueva).
-- =============================================================================

-- 1) El trigger de registro ahora guarda también la sucursal creada.
create or replace function public.alta_tenant_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_id uuid;
  sucursal_id uuid;
  nombre_tienda text;
begin
  nombre_tienda := nullif(new.raw_user_meta_data ->> 'nombre_tienda', '');

  -- 1) Tenant nuevo (siempre como trial).
  insert into public.tenants (nombre_comercial, estado, plan)
  values (coalesce(nombre_tienda, 'Mi tienda'), 'trial', 'piloto')
  returning id into tenant_id;

  -- 2) Sucursal principal (regla del modelo: 1 tenant arranca con 1 sucursal).
  insert into public.sucursales (tenant_id, nombre, direccion)
  values (tenant_id, 'Sucursal principal', null)
  returning id into sucursal_id;

  -- 3) El usuario es el dueño.
  insert into public.usuarios_tenant (user_id, tenant_id, rol)
  values (new.id, tenant_id, 'dueño');

  -- 4) Claims en app_metadata → el próximo JWT trae tenant_id, rol y sucursal_id.
  update auth.users
  set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'tenant_id', tenant_id::text,
        'rol', 'dueño',
        'sucursal_id', sucursal_id::text
      )
  where id = new.id;

  return new;
end;
$$;

-- 2) Backfill idempotente: usuarios de tenant con una sola sucursal reciben el claim.
--    Solo si todavía no lo tienen (para no pisar asignaciones futuras).
update auth.users u
set raw_app_meta_data =
    coalesce(u.raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('sucursal_id', s.id::text)
from public.usuarios_tenant ut
join (
  select st.tenant_id, (array_agg(st.id))[1] as id
  from public.sucursales st
  group by st.tenant_id
  having count(*) = 1
) s on s.tenant_id = ut.tenant_id
where ut.user_id = u.id
  and u.raw_app_meta_data ? 'tenant_id'
  and not (u.raw_app_meta_data ? 'sucursal_id');