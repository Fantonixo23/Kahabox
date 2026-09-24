-- =============================================================================
-- Kahabox — Migración 0028: planes comerciales (Básico / Estándar / Pro)
--
-- tenants.plan pasa a ser el plan comercial: 'basico', 'estandar' o 'pro'.
-- El valor 'piloto' (registros anteriores) se mantiene y se TRATA como 'basico',
-- sin tocar datos existentes.
--
-- Límites (NO incluyen al dueño, que siempre es 1):
--   basico   → 1 admin + 2 empleados  + 1 sucursal
--   estandar → 3 admin + 5 empleados  + 2 sucursales
--   pro      → 4 admin + 10 empleados + sucursales ilimitadas
--
-- El enforcement vive en las RPC (única vía de escritura del front). El trigger
-- de sucursales queda alineado con el límite del plan.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1). tenants.plan: constraint
-- ---------------------------------------------------------------------------
alter table public.tenants
  drop constraint if exists tenants_plan_check;

alter table public.tenants
  add constraint tenants_plan_check
  check (plan in ('basico', 'estandar', 'pro', 'piloto'));

comment on column public.tenants.plan
  is 'Plan comercial: basico, estandar o pro. "piloto" (legado) se trata como basico.';

-- ---------------------------------------------------------------------------
-- 2). Helpers: plan_normalizado + limites_de_plan
-- ---------------------------------------------------------------------------
create or replace function public.plan_normalizado(p_plan text)
returns text
language sql
immutable
as $$
  select case coalesce(nullif(btrim(p_plan), ''), 'basico')
    when 'estandar' then 'estandar'
    when 'pro'      then 'pro'
    else 'basico'
  end;
$$;

-- sucursales NULL = sin límite. Los límites de personas NO incluyen al dueño.
create or replace function public.limites_de_plan(p_plan text)
returns table (admins integer, empleados integer, sucursales integer)
language sql
immutable
as $$
  select
    case public.plan_normalizado(p_plan)
      when 'estandar' then 3
      when 'pro'      then 4
      else 1
    end,
    case public.plan_normalizado(p_plan)
      when 'estandar' then 5
      when 'pro'      then 10
      else 2
    end,
    case public.plan_normalizado(p_plan)
      when 'pro'      then null
      when 'estandar' then 2
      else 1
    end;
$$;

-- ---------------------------------------------------------------------------
-- 3). RPCs del front: mi_plan() y limites_plan()
-- ---------------------------------------------------------------------------
create or replace function public.mi_plan()
returns table (plan text)
language sql
stable
security definer
set search_path = public
as $$
  select public.plan_normalizado(t.plan)
  from public.tenants t
  where t.id = public.tenant_id_activo();
$$;

grant execute on function public.mi_plan() to authenticated;

create or replace function public.limites_plan()
returns table (plan text, admins integer, empleados integer, sucursales integer)
language sql
stable
security definer
set search_path = public
as $$
  select public.plan_normalizado(t.plan), l.admins, l.empleados, l.sucursales
  from public.tenants t
  cross join lateral public.limites_de_plan(t.plan) l
  where t.id = public.tenant_id_activo();
$$;

grant execute on function public.limites_plan() to authenticated;

-- ---------------------------------------------------------------------------
-- 4). Cupo de equipo en crear_invitacion (cuenta activos + pendientes)
-- ---------------------------------------------------------------------------
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
  v_plan text;
  v_limite integer;
  v_usados integer;
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

  select public.plan_normalizado(t.plan) into v_plan
  from public.tenants t
  where t.id = v_tenant;

  -- Plantilla por rol según plan (admins/empleados no incluyen al dueño).
  if v_rol = 'administrador' then
    select l.admins into v_limite from public.limites_de_plan(v_plan) l;
  else
    select l.empleados into v_limite from public.limites_de_plan(v_plan) l;
  end if;

  select count(*) into v_usados
  from (
    select 1 from public.usuarios_tenant ut
    where ut.tenant_id = v_tenant and ut.rol = v_rol
      and ut.estado in ('activo', 'pendiente')
    union all
    select 1 from public.invitaciones i
    where i.tenant_id = v_tenant and i.rol = v_rol
      and i.estado in ('pendiente', 'registrado')
  ) cupos;

  if v_usados >= v_limite then
    raise exception 'Tu plan % permite % % (ya tenés %). Para sumar más, actualizá a un plan superior.',
      v_plan, v_limite,
      case when v_rol = 'administrador' then 'administrador(es)' else 'empleado(s)' end,
      v_usados;
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
-- 5). set_rol_miembro: no promover más admins de los que permite el plan
-- ---------------------------------------------------------------------------
create or replace function public.set_rol_miembro(p_miembro_id uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_row public.usuarios_tenant%rowtype;
  v_plan text;
  v_limite integer;
  v_admins integer;
begin
  if v_tenant is null or coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede cambiar roles.';
  end if;
  if p_rol not in ('administrador', 'vendedor') then
    raise exception 'Rol inválido.';
  end if;

  select * into v_row
  from public.usuarios_tenant
  where id = p_miembro_id and tenant_id = v_tenant;

  if not found then
    raise exception 'El integrante no pertenece a esta tienda.';
  end if;
  if v_row.rol = 'dueño' then
    raise exception 'No se puede cambiar el rol del dueño.';
  end if;

  -- Al promover a administrador hay que respetar el cupo de admins del plan.
  if p_rol = 'administrador' and v_row.rol <> 'administrador' then
    select public.plan_normalizado(t.plan) into v_plan
    from public.tenants t
    where t.id = v_tenant;

    select l.admins into v_limite from public.limites_de_plan(v_plan) l;

    select count(*) into v_admins
    from public.usuarios_tenant
    where tenant_id = v_tenant and rol = 'administrador' and estado = 'activo'
      and id <> p_miembro_id;

    if v_admins >= v_limite then
      raise exception 'Tu plan % permite % administrador(es) en total. Para sumar más, actualizá a un plan superior.',
        v_plan, v_limite;
    end if;
  end if;

  update public.usuarios_tenant
  set rol = p_rol
  where id = p_miembro_id;

  update auth.users
  set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('rol', p_rol)
  where id = v_row.user_id;
end;
$$;

grant execute on function public.set_rol_miembro(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6). Cupo de sucursales según plan (crear_sucursal + trigger)
-- ---------------------------------------------------------------------------
create or replace function public.sucursales_plan_limite()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_limite integer;
begin
  if new.tenant_id is null then
    return new;
  end if;

  select l.sucursales into v_limite
  from public.tenants t
  cross join lateral public.limites_de_plan(t.plan) l
  where t.id = new.tenant_id;

  if v_limite is not null and (
    select count(*) from public.sucursales where tenant_id = new.tenant_id
  ) >= v_limite then
    raise exception 'Tu plan permite hasta % sucursal(es). Para crear más, actualizá al plan Pro.',
      v_limite;
  end if;
  return new;
end;
$$;

-- El nombre ordena DESPUÉS de sucursales_tenant (que completa tenant_id del JWT).
drop trigger if exists sucursales_tenant_max on public.sucursales;
drop trigger if exists sucursales_tenant_plan_limite on public.sucursales;
create trigger sucursales_tenant_plan_limite before insert on public.sucursales
  for each row execute function public.sucursales_plan_limite();

create or replace function public.crear_sucursal(
  p_nombre text,
  p_direccion text default null,
  p_telefono text default null
)
returns table (id uuid, nombre text, direccion text, telefono text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_total integer;
  v_limite integer;
begin
  if v_tenant is null then
    raise exception 'Sesión sin tienda.';
  end if;
  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede crear sucursales.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Ingresá el nombre de la sucursal.';
  end if;

  select count(*) into v_total
  from public.sucursales
  where tenant_id = v_tenant;

  select l.sucursales into v_limite
  from public.tenants t
  cross join lateral public.limites_de_plan(t.plan) l
  where t.id = v_tenant;

  if v_limite is not null and v_total >= v_limite then
    raise exception 'Tu plan permite hasta % sucursal(es). Para crear más, actualizá al plan Pro.',
      v_limite;
  end if;

  return query
  insert into public.sucursales (tenant_id, nombre, direccion, telefono)
  values (
    v_tenant,
    btrim(p_nombre),
    nullif(btrim(coalesce(p_direccion, '')), ''),
    nullif(btrim(coalesce(p_telefono, '')), '')
  )
  returning public.sucursales.id, public.sucursales.nombre,
            public.sucursales.direccion, public.sucursales.telefono;
end;
$$;

grant execute on function public.crear_sucursal(text, text, text) to authenticated;