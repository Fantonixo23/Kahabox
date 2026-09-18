-- =============================================================================
-- Kahabox — Migración 0016: clientes + cuentas por cobrar
-- Directorio de clientes y el seguimiento del crédito (fiado):
--   * clientes  → ficha maestra del cliente (nombre, RUC, cédula, contacto…)
--   * deudas    → créditos dados al cliente (opcionalmente ligados a una venta)
--   * cobros    → pagos recibidos del cliente
-- La deuda pendiente se calcula: Σ deudas − Σ cobros (según la moneda).
-- Replica el patrón de proveedores/pagos_proveedores: tenant por JWT con el
-- trigger set_tenant_id_from_jwt() (el front no manda tenant_id) y RLS con
-- with check que valida que el cliente referenciado sea del mismo tenant.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- clientes
-- ---------------------------------------------------------------------------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nombre text not null,
  tipo text not null default 'fisica' check (tipo in ('fisica', 'juridica')),
  ruc text,
  cedula text,
  telefono text,
  email text,
  direccion text,
  ciudad text,
  notas text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.clientes enable row level security;

create policy "clientes_mi_tenant" on public.clientes
  for all
  to authenticated
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

-- ---------------------------------------------------------------------------
-- deudas (crédito dado al cliente)
-- ---------------------------------------------------------------------------
create table public.deudas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  venta_id uuid references public.ventas (id) on delete set null,
  fecha date not null default current_date,
  vencimiento date,
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'PYG' check (moneda in ('PYG', 'USD', 'ARS', 'BRL')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.deudas enable row level security;

create policy "deudas_mi_tenant" on public.deudas
  for all
  to authenticated
  using (tenant_id = public.tenant_id_activo())
  with check (
    tenant_id = public.tenant_id_activo()
    and exists (
      select 1 from public.clientes c
      where c.id = cliente_id
        and c.tenant_id = public.tenant_id_activo()
    )
  );

-- ---------------------------------------------------------------------------
-- cobros (pagos recibidos del cliente)
-- ---------------------------------------------------------------------------
create table public.cobros (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  fecha date not null default current_date,
  concepto text,
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'PYG' check (moneda in ('PYG', 'USD', 'ARS', 'BRL')),
  metodo text not null default 'efectivo' check (metodo in ('efectivo', 'pos', 'transferencia')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cobros enable row level security;

create policy "cobros_mi_tenant" on public.cobros
  for all
  to authenticated
  using (tenant_id = public.tenant_id_activo())
  with check (
    tenant_id = public.tenant_id_activo()
    and exists (
      select 1 from public.clientes c
      where c.id = cliente_id
        and c.tenant_id = public.tenant_id_activo()
    )
  );

-- ---------------------------------------------------------------------------
-- Triggers de tenant (función existente).
-- ---------------------------------------------------------------------------
create trigger clientes_tenant before insert on public.clientes
  for each row execute function public.set_tenant_id_from_jwt();

create trigger deudas_tenant before insert on public.deudas
  for each row execute function public.set_tenant_id_from_jwt();

create trigger cobros_tenant before insert on public.cobros
  for each row execute function public.set_tenant_id_from_jwt();

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------
create index clientes_tenant_id_idx on public.clientes (tenant_id);
create index clientes_ruc_idx on public.clientes (tenant_id, ruc)
  where ruc is not null;
create index deudas_cliente_fecha_idx on public.deudas (cliente_id, fecha desc);
create index deudas_vencimiento_idx on public.deudas (vencimiento)
  where vencimiento is not null;
create index cobros_cliente_fecha_idx on public.cobros (cliente_id, fecha desc);