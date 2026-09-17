-- =============================================================================
-- Kahabox — Migración: registro con aprobación del superadmin
-- Cambios:
--   1. tenants.estado admite 'pendiente' y 'rechazado'.
--   2. tenants.email_contacto (para el webhook + consola de admin).
--   3. alta_tenant_al_registrarse: el tenant nuevo nace 'pendiente' y guarda el email.
--   4. public.superadmins + helper public.es_superadmin().
--   5. Policies: los superadmins leen/actualizan todos los tenants.
--   6. Bootstrap del founder (superadmin) por email.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Estado del tenant: suma 'pendiente' y 'rechazado'
-- ---------------------------------------------------------------------------
alter table public.tenants
  drop constraint tenants_estado_check;

alter table public.tenants
  add constraint tenants_estado_check
  check (estado in ('pendiente', 'trial', 'activo', 'suspendido', 'rechazado'));

-- ---------------------------------------------------------------------------
-- 2) Email de contacto del tenant (el webhook y la consola admin lo necesitan)
--    Existe en auth.users, se denormaliza acá para leerlo con RLS normal.
-- ---------------------------------------------------------------------------
alter table public.tenants
  add column email_contacto text;

-- Backfill de los tenants existentes con el email del dueño.
update public.tenants t
set email_contacto = (
  select u.email
  from auth.users u
  join public.usuarios_tenant ut on ut.user_id = u.id
  where ut.tenant_id = t.id
  limit 1
)
where t.email_contacto is null;

-- ---------------------------------------------------------------------------
-- 3) Trigger de alta: tenant 'pendiente' + email_contacto
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
  -- Nombre de la tienda viene en user_metadata (llegó del form de registro).
  nombre_tienda := nullif(new.raw_user_meta_data ->> 'nombre_tienda', '');

  -- 1) Tenant nuevo: queda 'pendiente' hasta que el superadmin lo apruebe.
  insert into public.tenants (nombre_comercial, estado, plan, email_contacto)
  values (coalesce(nombre_tienda, 'Mi tienda'), 'pendiente', 'piloto', new.email)
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

-- ---------------------------------------------------------------------------
-- 4) superadmins + es_superadmin()
-- ---------------------------------------------------------------------------
create table if not exists public.superadmins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.superadmins
  is 'Cuentas con acceso a la consola de admin (aprobar registros, administrar tenants).';

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

comment on function public.es_superadmin()
  is '¿El usuario logueado está en superadmins? (security definer: ignora RLS).';

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
alter table public.superadmins enable row level security;

-- Cada usuario puede leer su propia fila de superadmins (si existe).
create policy superadmins_own on public.superadmins
  for select
  using (user_id = auth.uid());

-- tenants: los superadmins pueden leer todos (además de la policy propia).
create policy tenants_admin_select on public.tenants
  for select
  using (public.es_superadmin());

-- tenants: los superadmins pueden actualizar cualquier tenant (cambiar estado...).
create policy tenants_admin_update on public.tenants
  for update
  using (public.es_superadmin())
  with check (public.es_superadmin());

-- ---------------------------------------------------------------------------
-- 6) Bootstrap del founder
--    Si el usuario todavía no existe en auth.users al aplicar la migración,
--    la fila no se inserta: hay que crearla a mano en Supabase Studio
--    (public.superadmins → Nueva fila) cuando la cuenta ya exista.
-- ---------------------------------------------------------------------------
insert into public.superadmins (user_id)
select id
from auth.users
where email = 'juampabloportillo22@gmail.com'
on conflict (user_id) do nothing;