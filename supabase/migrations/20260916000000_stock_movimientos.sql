-- =============================================================================
-- Kahabox — Migración 0004: stock_movimientos (histórico de reposición y transferencias)
-- Fase 0 / piloto. Cada ajuste de entrada/salida y cada transferencia entre
-- sucursales genera un movimiento (uno por sucursal afectada). Es append-only:
-- nadie borra ni edita; el stock real se mantiene en stock_tienda.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. stock_movimientos
-- ---------------------------------------------------------------------------
create table public.stock_movimientos (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  sucursal_id         uuid references public.sucursales (id) on delete set null,
  linea_id            uuid references public.stock_tienda (id) on delete set null,
  producto_nombre     text not null,
  codigo_barras       text,
  sku                 text,
  tipo                text not null check (tipo in ('entrada', 'salida', 'transferencia_origen', 'transferencia_destino')),
  cantidad            integer not null, -- positiva = entró, negativa = salió
  motivo              text,
  ref_sucursal_id     uuid references public.sucursales (id) on delete set null,
  ref_sucursal_nombre text,
  created_by          uuid references public.usuarios_tenant (id) on delete set null,
  created_at          timestamptz not null default now()
);

create index on public.stock_movimientos (tenant_id);
create index on public.stock_movimientos (sucursal_id, created_at desc);
create index on public.stock_movimientos (linea_id);

-- ---------------------------------------------------------------------------
-- 2. tenant_id desde el JWT en inserts
-- ---------------------------------------------------------------------------
create trigger stock_movimientos_tenant before insert on public.stock_movimientos
  for each row execute function public.set_tenant_id_from_jwt();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security (mismo patrón tenant_isolation que el resto)
-- ---------------------------------------------------------------------------
alter table public.stock_movimientos enable row level security;

create policy stock_movimientos_isolation on public.stock_movimientos
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());