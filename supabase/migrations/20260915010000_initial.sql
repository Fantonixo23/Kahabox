-- =============================================================================
-- Kahabox — Migración 0001: modelo de datos inicial (multi-tenant + RLS)
-- Fase 0 del plan. Regla de oro: toda tabla operativa lleva tenant_id.
-- Excepto productos_maestro, que es el catálogo compartido entre tenants.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. tenants
-- ---------------------------------------------------------------------------
create table public.tenants (
  id               uuid primary key default gen_random_uuid(),
  nombre_comercial text not null,
  estado           text not null default 'trial' check (estado in ('activo', 'suspendido', 'trial')),
  plan             text not null default 'piloto',
  created_at       timestamptz not null default now()
);

comment on table public.tenants is 'Cada tienda/cliente del SaaS. Una fila por tenant.';

-- ---------------------------------------------------------------------------
-- 2. usuarios_tenant  (relación usuario ↔ tenant ↔ rol)
-- ---------------------------------------------------------------------------
create table public.usuarios_tenant (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  rol        text not null default 'vendedor' check (rol in ('dueño', 'vendedor')),
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id)
);

create index on public.usuarios_tenant (tenant_id);
create index on public.usuarios_tenant (user_id);

-- ---------------------------------------------------------------------------
-- 3. productos_maestro  (catálogo COMPARTIDO entre todos los tenants, sin tenant_id)
-- ---------------------------------------------------------------------------
create table public.productos_maestro (
  id                   uuid primary key default gen_random_uuid(),
  codigo_barras        text unique,
  nombre               text not null,
  marca                text,
  categoria            text,
  foto_url             text,
  creado_por_tenant_id uuid references public.tenants (id),
  created_at           timestamptz not null default now()
);

create index on public.productos_maestro (lower(nombre));
create index on public.productos_maestro (marca);

comment on table public.productos_maestro
  is 'Catálogo maestro compartido. Sin tenant_id a propósito (solo lectura para cada tenant).';

-- ---------------------------------------------------------------------------
-- 4. sucursales  (por tenant; cada tenant nuevo arranca con una sucursal principal)
-- ---------------------------------------------------------------------------
create table public.sucursales (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  nombre     text not null,
  direccion  text,
  created_at timestamptz not null default now()
);

create index on public.sucursales (tenant_id);

-- ---------------------------------------------------------------------------
-- 5. stock_tienda  (por tenant; con moneda y índice único parcial)
-- ---------------------------------------------------------------------------
create table public.stock_tienda (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sucursal_id uuid references public.sucursales (id) on delete set null,
  producto_id uuid not null references public.productos_maestro (id),
  sku         text,
  variante    text,
  precio      numeric(14, 2) not null,
  costo       numeric(14, 2),
  moneda      text not null default 'PYG' check (moneda in ('PYG', 'USD')),
  cantidad    integer not null default 0 check (cantidad >= 0),
  updated_at  timestamptz not null default now()
);

create index on public.stock_tienda (tenant_id);
create index on public.stock_tienda (producto_id);
create index on public.stock_tienda (sucursal_id);

-- Una misma línea (producto + variante + sucursal) no puede duplicarse dentro del tenant.
-- sku y variante son nullable → COALESCE.
-- sucursal_id también se cubre: en Fase 0 es NULL (un solo local), y como Postgres
-- trata NULLs como distintos en índices únicos, se usa COALESCE(sucursal_id, tenant_id):
-- el id del propio tenant hace de valor centinela y nunca choca con una sucursal real.
create unique index stock_tienda_unico on public.stock_tienda
  (tenant_id, coalesce(sucursal_id, tenant_id), producto_id, coalesce(sku, ''), coalesce(variante, ''));

-- ---------------------------------------------------------------------------
-- 6. ventas  (por tenant)
-- ---------------------------------------------------------------------------
create table public.ventas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sucursal_id uuid references public.sucursales (id) on delete set null,
  vendedor_id uuid references public.usuarios_tenant (id) on delete set null,
  total       numeric(14, 2) not null default 0,
  estado      text not null default 'pendiente_sync' check (estado in ('pendiente_sync', 'confirmada', 'anulada')),
  created_at  timestamptz not null default now()
);

create index on public.ventas (tenant_id);
create index on public.ventas (vendedor_id);

-- ---------------------------------------------------------------------------
-- 7. venta_items  (por tenant; tenant_id denormalizado para RLS directa, sin join con ventas)
-- ---------------------------------------------------------------------------
create table public.venta_items (
  id                uuid primary key default gen_random_uuid(),
  venta_id          uuid not null references public.ventas (id) on delete cascade,
  stock_tienda_id   uuid references public.stock_tienda (id),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  cantidad          integer not null check (cantidad > 0),
  precio_unitario   numeric(14, 2) not null
);

create index on public.venta_items (venta_id);
create index on public.venta_items (tenant_id);

-- ---------------------------------------------------------------------------
-- 8. Triggers utilitarios
-- ---------------------------------------------------------------------------
-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger stock_tienda_touch
  before update on public.stock_tienda
  for each row execute function public.set_updated_at();

-- tenant_id actual del usuario logueado, leído del JWT.
-- En Supabase el custom claim vive bajo `app_metadata` en el token
-- (raw_app_meta_data de auth.users), NO en la raíz. El wrapper
-- `(select auth.jwt())` hace que se evalúe una sola vez por consulta.
create or replace function public.tenant_id_activo()
returns uuid
language sql
stable
as $$
  select ( (select auth.jwt()) -> 'app_metadata' ->> 'tenant_id' )::uuid;
$$;

-- tenant_id desde el JWT (custom claim) cuando el cliente no lo manda.
-- Nunca se confía ciegamente en el campo del frontend: RLS valida igual (with check).
create or replace function public.set_tenant_id_from_jwt()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  jwt_tenant uuid;
begin
  begin
    jwt_tenant := public.tenant_id_activo();
  exception when others then
    jwt_tenant := null;
  end;

  if jwt_tenant is not null then
    new.tenant_id := jwt_tenant;
  end if;
  return new;
end;
$$;

create trigger usuarios_tenant_tenant before insert on public.usuarios_tenant
  for each row execute function public.set_tenant_id_from_jwt();
create trigger sucursales_tenant before insert on public.sucursales
  for each row execute function public.set_tenant_id_from_jwt();
create trigger stock_tienda_tenant before insert on public.stock_tienda
  for each row execute function public.set_tenant_id_from_jwt();
create trigger ventas_tenant before insert on public.ventas
  for each row execute function public.set_tenant_id_from_jwt();
create trigger venta_items_tenant before insert on public.venta_items
  for each row execute function public.set_tenant_id_from_jwt();

-- ---------------------------------------------------------------------------
-- 9. Row Level Security (patrón tenant_isolation)
-- ---------------------------------------------------------------------------
alter table public.tenants          enable row level security;
alter table public.usuarios_tenant  enable row level security;
alter table public.sucursales       enable row level security;
alter table public.stock_tienda     enable row level security;
alter table public.ventas           enable row level security;
alter table public.venta_items      enable row level security;

-- tenants: cada usuario autenticado puede leer SOLO su propio tenant
create policy tenants_own on public.tenants
  for select
  using (id = public.tenant_id_activo());

-- usuarios_tenant: full crud dentro del propio tenant
create policy usuarios_tenant_isolation on public.usuarios_tenant
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

-- sucursales
create policy sucursales_isolation on public.sucursales
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

-- stock_tienda
create policy stock_tienda_isolation on public.stock_tienda
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

-- ventas
create policy ventas_isolation on public.ventas
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

-- venta_items
create policy venta_items_isolation on public.venta_items
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

-- productos_maestro: lectura para cualquier autenticado, escritura controlada
create policy productos_lectura on public.productos_maestro
  for select using (auth.role() = 'authenticated');
create policy productos_escritura on public.productos_maestro
  for insert with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 10. Columnas sensibles: costo solo para rol dueño (vía vistas, no vía RLS)
-- ---------------------------------------------------------------------------
-- RLS filtra filas, no columnas. Para ocultar `costo` al rol vendedor se usan
-- vistas que filtran también por tenant_id del JWT (el dueño de la vista ignora RLS).
-- Y además se revoca el SELECT directo sobre la tabla base al rol authenticated.

create or replace view public.stock_tienda_vendedor as
  select id, tenant_id, sucursal_id, producto_id, sku, variante, precio, moneda, cantidad, updated_at
  from public.stock_tienda
  where tenant_id = public.tenant_id_activo();

create or replace view public.stock_tienda_dueno as
  select id, tenant_id, sucursal_id, producto_id, sku, variante, precio, costo, moneda, cantidad, updated_at
  from public.stock_tienda
  where tenant_id = public.tenant_id_activo();

-- El rol vendedor (identificado por JWT rol='vendedor') consume stock_tienda_vendedor.
-- El rol dueño consume stock_tienda_dueno. Nadie consulta la tabla base directo.
revoke select on public.stock_tienda from authenticated;
grant select on public.stock_tienda_vendedor to authenticated;
grant select on public.stock_tienda_dueno to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Storage: fotos de productos (bucket compartido legible, escritura por tenant)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

create policy "productos_lectura_publica" on storage.objects
  for select using (bucket_id = 'productos');

create policy "productos_escritura_propia" on storage.objects
  for insert
  with check (
    bucket_id = 'productos'
    and (storage.foldername(name))[1] = public.tenant_id_activo()::text
  );

-- ---------------------------------------------------------------------------
-- Nota sobre claims + tenant_id en el JWT
-- ---------------------------------------------------------------------------
-- auth.users se crea con service role desde la Edge Function de invitación
-- (registro del dueño / creación de vendedor), O — en piloto — directamente por
-- signup web vía trigger (ver migración 20260915020000_registro_auto.sql).
-- En ambos casos se setea en raw_app_meta_data: { "tenant_id", "rol" }.
-- NUNCA setear con la key del cliente y NUNCA en raw_user_meta_data (el usuario
-- puede modificarla sola). El claim queda bajo `app_metadata` en el JWT y se lee
-- con el helper public.tenant_id_activo() / (select auth.jwt()) -> 'app_metadata'.