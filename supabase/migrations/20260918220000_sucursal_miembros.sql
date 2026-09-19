-- =============================================================================
-- Kahabox — Migración 0022: sucursal por integrante
--
-- Cada miembro del equipo queda asignado a UNA sucursal. Solo el dueño puede
-- reasignarlo (módulo Mi equipo). La sucursal viaja en el claim
-- `app_metadata.sucursal_id` (lo usa el escáner remoto y el default del front).
--
-- Cambios:
--   1. usuarios_tenant.sucursal_id  (asignación actual del miembro)
--   2. invitaciones.sucursal_id     (sucursal objetivo desde la invitación)
--   3. crear_invitacion(p_nombre, p_rol, p_sucursal_id)
--   4. confirmar_miembro(p_miembro_id, p_sucursal_id)
--   5. set_sucursal_miembro(p_miembro_id, p_sucursal_id)
--   6. listar_miembros() devuelve sucursal_id + sucursal_nombre
--   7. mi_sucursal() → sucursal asignada del usuario logueado
--   8. alta_tenant_al_registrarse setea la sucursal del dueño
--   9. backfill de miembros existentes a la primera sucursal del tenant
-- =============================================================================

alter table public.usuarios_tenant
  add column if not exists sucursal_id uuid
  references public.sucursales (id) on delete set null;

alter table public.invitaciones
  add column if not exists sucursal_id uuid
  references public.sucursales (id) on delete set null;

create index if not exists usuarios_tenant_sucursal_idx
  on public.usuarios_tenant (sucursal_id);

comment on column public.usuarios_tenant.sucursal_id
  is 'Sucursal asignada al integrante. La cambia el dueño; define a qué local opera.';

-- ---------------------------------------------------------------------------
-- Trigger de registro: el dueño también queda en su sucursal principal
-- ---------------------------------------------------------------------------
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
  if coalesce(new.raw_user_meta_data ->> 'invitacion', '') = 'true' then
    return new;
  end if;

  nombre_tienda := nullif(new.raw_user_meta_data ->> 'nombre_tienda', '');

  insert into public.tenants (nombre_comercial, estado, plan, email_contacto)
  values (coalesce(nombre_tienda, 'Mi tienda'), 'pendiente', 'piloto', new.email)
  returning id into tenant_id;

  insert into public.sucursales (tenant_id, nombre, direccion)
  values (tenant_id, 'Sucursal principal', null)
  returning id into sucursal_id;

  insert into public.usuarios_tenant (user_id, tenant_id, rol, sucursal_id)
  values (new.id, tenant_id, 'dueño', sucursal_id);

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

-- ---------------------------------------------------------------------------
-- crear_invitacion con sucursal objetivo
-- ---------------------------------------------------------------------------
drop function if exists public.crear_invitacion(text, text);

create or replace function public.crear_invitacion(
  p_nombre text,
  p_rol text,
  p_sucursal_id uuid default null
)
returns table (id uuid, token text, expira_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_empresa text;
  v_rol text := p_rol;
  v_sucursal uuid;
begin
  if v_tenant is null then
    raise exception 'Sesión sin tenant.';
  end if;
  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede invitar integrantes.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Ingresá el nombre del invitado.';
  end if;
  if v_rol not in ('administrador', 'vendedor') then
    raise exception 'Rol inválido.';
  end if;

  if p_sucursal_id is not null then
    select id into v_sucursal
    from public.sucursales
    where id = p_sucursal_id and tenant_id = v_tenant;
  end if;

  select nombre_comercial into v_empresa
  from public.tenants
  where tenants.id = v_tenant;

  return query
  insert into public.invitaciones (
    tenant_id, empresa_nombre, nombre_invitado, rol, token, creado_por,
    sucursal_id
  )
  values (
    v_tenant,
    coalesce(v_empresa, 'Mi tienda'),
    btrim(p_nombre),
    v_rol,
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    auth.uid(),
    v_sucursal
  )
  returning public.invitaciones.id, public.invitaciones.token,
            public.invitaciones.expira_at;
end;
$$;

grant execute on function public.crear_invitacion(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- listar_miembros con sucursal
-- ---------------------------------------------------------------------------
drop function if exists public.listar_miembros();

create or replace function public.listar_miembros()
returns table (
  id uuid,
  user_id uuid,
  tenant_id uuid,
  rol text,
  estado text,
  nombre text,
  email text,
  created_at timestamptz,
  sucursal_id uuid,
  sucursal_nombre text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede ver el equipo.';
  end if;

  return query
  select ut.id, ut.user_id, ut.tenant_id, ut.rol, ut.estado, ut.nombre,
         u.email::text, ut.created_at,
         ut.sucursal_id, s.nombre
  from public.usuarios_tenant ut
  left join auth.users u on u.id = ut.user_id
  left join public.sucursales s on s.id = ut.sucursal_id
  where ut.tenant_id = public.tenant_id_activo()
  order by ut.created_at desc;
end;
$$;

grant execute on function public.listar_miembros() to authenticated;

-- ---------------------------------------------------------------------------
-- confirmar_miembro con sucursal
-- ---------------------------------------------------------------------------
drop function if exists public.confirmar_miembro(uuid);

create or replace function public.confirmar_miembro(
  p_miembro_id uuid,
  p_sucursal_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_row public.usuarios_tenant%rowtype;
  v_sucursal uuid;
begin
  if v_tenant is null or coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede confirmar integrantes.';
  end if;

  select * into v_row
  from public.usuarios_tenant
  where id = p_miembro_id and tenant_id = v_tenant;

  if not found then
    raise exception 'El integrante no pertenece a esta tienda.';
  end if;
  if v_row.rol = 'dueño' then
    raise exception 'El dueño ya está confirmado.';
  end if;

  -- Sucursal: la elegida, la previa, o la primera del tenant.
  if p_sucursal_id is not null then
    select id into v_sucursal
    from public.sucursales
    where id = p_sucursal_id and tenant_id = v_tenant;
  end if;
  v_sucursal := coalesce(
    v_sucursal,
    v_row.sucursal_id,
    (
      select id from public.sucursales
      where tenant_id = v_tenant
      order by created_at, id
      limit 1
    )
  );

  update public.usuarios_tenant
  set estado = 'activo',
      nombre = coalesce(nullif(btrim(nombre), ''), 'Miembro'),
      sucursal_id = v_sucursal
  where id = p_miembro_id;

  update auth.users
  set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'tenant_id', v_tenant::text,
        'rol', v_row.rol,
        'sucursal_id', v_sucursal::text
      )
  where id = v_row.user_id;
end;
$$;

grant execute on function public.confirmar_miembro(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- set_sucursal_miembro (solo dueño)
-- ---------------------------------------------------------------------------
create or replace function public.set_sucursal_miembro(
  p_miembro_id uuid,
  p_sucursal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_row public.usuarios_tenant%rowtype;
  v_sucursal uuid;
begin
  if v_tenant is null or coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede cambiar la sucursal de un integrante.';
  end if;

  select * into v_row
  from public.usuarios_tenant
  where id = p_miembro_id and tenant_id = v_tenant;

  if not found then
    raise exception 'El integrante no pertenece a esta tienda.';
  end if;

  select id into v_sucursal
  from public.sucursales
  where id = p_sucursal_id and tenant_id = v_tenant;

  if v_sucursal is null then
    raise exception 'La sucursal no pertenece a esta tienda.';
  end if;

  update public.usuarios_tenant
  set sucursal_id = v_sucursal
  where id = p_miembro_id;

  update auth.users
  set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('sucursal_id', v_sucursal::text)
  where id = v_row.user_id;
end;
$$;

grant execute on function public.set_sucursal_miembro(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- mi_sucursal(): sucursal asignada del usuario logueado (default del front)
-- ---------------------------------------------------------------------------
create or replace function public.mi_sucursal()
returns table (sucursal_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select ut.sucursal_id
  from public.usuarios_tenant ut
  where ut.user_id = auth.uid()
  order by ut.created_at desc
  limit 1;
$$;

grant execute on function public.mi_sucursal() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: miembros sin sucursal → primera del tenant
-- ---------------------------------------------------------------------------
with primeras as (
  select tenant_id, (array_agg(id order by created_at, id))[1] as id
  from public.sucursales
  group by tenant_id
)
update public.usuarios_tenant ut
set sucursal_id = p.id
from primeras p
where ut.tenant_id = p.tenant_id
  and ut.sucursal_id is null;
