-- Proveedores y pagos a proveedores
-- Registro de proveedores y de los pagos (egresos) hechos a cada uno.
-- La deuda pendiente por compras se modela en una fase posterior (módulo de
-- compras); por ahora los pagos funcionan como libro de egresos por proveedor.

create table proveedores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  nombre text not null,
  ruc text,
  telefono text,
  email text,
  direccion text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table proveedores enable row level security;

-- El claim tenant_id vive en app_metadata del JWT (ver 20260915010000_initial.sql).
-- Usar el helper tenant_id_activo(), no (auth.jwt() -> 'tenant_id') directo.
create policy "proveedores_mi_tenant" on proveedores
  for all
  to authenticated
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

create table pagos_proveedores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  proveedor_id uuid not null references proveedores (id) on delete cascade,
  fecha date not null default current_date,
  concepto text,
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'PYG' check (moneda in ('PYG', 'USD', 'ARS', 'BRL')),
  metodo text not null default 'efectivo' check (metodo in ('efectivo', 'tarjeta', 'transferencia')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table pagos_proveedores enable row level security;

create policy "pagos_proveedores_mi_tenant" on pagos_proveedores
  for all
  to authenticated
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

create index pagos_proveedores_proveedor_fecha_idx
  on pagos_proveedores (proveedor_id, fecha desc);