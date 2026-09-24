-- =============================================================================
-- Kahabox - Migracion 0029: consola de administracion (superadmin)
--
-- 1) superadmins + es_superadmin(): accesos del administrador de Kahabox.
-- 2) Bloqueo de clientes: al poner tenants.estado = 'suspendido', el tenant se
--    corta en TODO el backend. El corte es total (lectura + escritura) y vive
--    en un solo punto: tenant_id_activo() devuelve NULL cuando el tenant esta
--    suspendido. Como esa funcion se usa en todas las politicas RLS, en los
--    triggers de tenant y en todas las RPC, un cliente suspendido no puede
--    leer ni escribir nada.
-- 3) mi_estado_tenant(): lee el estado del tenant SIN la regla de bloqueo,
--    para que la app muestre la pantalla "subscripcion vencida".
-- 4) RPC de admin: listar_tenants_admin, admin_cambiar_estado, admin_cambiar_plan.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1). superadmins + es_superadmin()
-- ---------------------------------------------------------------------------
drop table if exists public.superadmins;

create table public.superadmins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.superadmins
  is 'Cuentas con acceso a la consola de admin (panel de clientes/licencias).';

create or replace function public.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.superadmins where user_id = auth.uid()
  );
$$;

grant execute on function public.es_superadmin() to authenticated;

alter table public.superadmins enable row level security;

-- Cada usuario puede leer su propia fila de superadmins (si existe).
create policy superadmins_own on public.superadmins
  for select
  using (user_id = auth.uid());

-- Bootstrap del administrador.
insert into public.superadmins (user_id)
select id
from auth.users
where email = 'juampabloportillo22@gmail.com'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2). Bloqueo: helper + tenant_id_activo() condicional
-- ---------------------------------------------------------------------------
-- Lee el estado del tenant del usuario logueado ignorando RLS (la usa
-- tenant_id_activo dentro de politicas/triggers).
create or replace function public.tenant_suspendido()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenants t
    where t.id = ((select auth.jwt()) -> 'app_metadata' ->> 'tenant_id')::uuid
      and t.estado = 'suspendido'
  );
$$;

-- Punto unico de corte: si el tenant esta suspendido no hay tenant_id activo.
create or replace function public.tenant_id_activo()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.tenant_suspendido() then null
    else ((select auth.jwt()) -> 'app_metadata' ->> 'tenant_id')::uuid
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3). mi_estado_tenant(): estado real (sin la regla de bloqueo), para la
--     pantalla de "subscripcion vencida" y el flujo de aprobacion.
-- ---------------------------------------------------------------------------
create or replace function public.mi_estado_tenant()
returns table (estado text)
language sql
stable
security definer
set search_path = public
as $$
  select t.estado
  from public.tenants t
  where t.id = ((select auth.jwt()) -> 'app_metadata' ->> 'tenant_id')::uuid;
$$;

grant execute on function public.mi_estado_tenant() to authenticated;

-- ---------------------------------------------------------------------------
-- 4). RPC de la consola de admin
-- ---------------------------------------------------------------------------
create or replace function public.listar_tenants_admin()
returns table (
  id              uuid,
  nombre_comercial text,
  email_contacto  text,
  estado          text,
  plan            text,
  integrantes     bigint,
  creada          timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador de Kahabox puede ver el panel.';
  end if;

  return query
  select t.id, t.nombre_comercial, t.email_contacto, t.estado,
         public.plan_normalizado(t.plan),
         (select count(*) from public.usuarios_tenant ut where ut.tenant_id = t.id),
         t.created_at
  from public.tenants t
  order by creada desc;
end;
$$;

grant execute on function public.listar_tenants_admin() to authenticated;

create or replace function public.admin_cambiar_estado(
  p_tenant_id uuid,
  p_estado   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador de Kahabox puede cambiar estados.';
  end if;
  if p_estado not in ('pendiente', 'trial', 'activo', 'suspendido', 'rechazado') then
    raise exception 'Estado no valido.';
  end if;

  update public.tenants
  set estado = p_estado
  where id = p_tenant_id;

  if not found then
    raise exception 'La tienda no existe.';
  end if;
end;
$$;

grant execute on function public.admin_cambiar_estado(uuid, text) to authenticated;

create or replace function public.admin_cambiar_plan(
  p_tenant_id uuid,
  p_plan     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador de Kahabox puede cambiar planes.';
  end if;
  if p_plan not in ('basico', 'estandar', 'pro') then
    raise exception 'Plan no valido.';
  end if;

  update public.tenants
  set plan = p_plan
  where id = p_tenant_id;

  if not found then
    raise exception 'La tienda no existe.';
  end if;
end;
$$;

grant execute on function public.admin_cambiar_plan(uuid, text) to authenticated;