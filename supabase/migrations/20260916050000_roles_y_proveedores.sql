-- =============================================================================
-- Kahabox — Migración 0009: rol real por vista + proveedores conectados al JWT
-- Fase 2 del TODO que quedó anotado en la migración de vistas: ocultar `costo`
-- de verdad al rol vendedor. Se agrega el helper rol_activo() (lee el claim
-- app_metadata.rol del JWT) y las vistas quedan gateadas por rol:
--   * stock_tienda_dueno    → solo rol dueño (expone costo)
--   * stock_tienda_vendedor → solo rol vendedor (sin costo)
-- Se mantiene SECURITY INVOKER: el aislamiento por tenant sigue vía RLS.
--
-- Además se conecta proveedores y pagos_proveedores al multi-tenant:
--   * trigger set_tenant_id_from_jwt en ambas tablas (el front no manda
--     tenant_id; sin esto el INSERT fallaría RLS with check).
--   * la política de pagos_proveedores valida que el proveedor referenciado
--     pertenezca al mismo tenant (sin esto un UUID de otro tenant adivinado
--     pasaría el with check de la propia fila).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper del rol activo (claim app_metadata.rol del JWT)
-- ---------------------------------------------------------------------------
create or replace function public.rol_activo()
returns text
language sql
stable
as $$
  select ( (select auth.jwt()) -> 'app_metadata' ->> 'rol' )::text;
$$;

-- ---------------------------------------------------------------------------
-- 2. Vistas de stock gateadas por rol
-- ---------------------------------------------------------------------------
drop view if exists public.stock_tienda_dueno;
drop view if exists public.stock_tienda_vendedor;

create or replace view public.stock_tienda_vendedor
with (security_invoker = true) as
  select id, tenant_id, sucursal_id, producto_id, sku, variante, precio, moneda, cantidad, updated_at
  from public.stock_tienda
  where tenant_id = public.tenant_id_activo()
    and public.rol_activo() = 'vendedor';

create or replace view public.stock_tienda_dueno
with (security_invoker = true) as
  select id, tenant_id, sucursal_id, producto_id, sku, variante, precio, costo, moneda, cantidad, updated_at
  from public.stock_tienda
  where tenant_id = public.tenant_id_activo()
    and public.rol_activo() = 'dueño';

grant select on public.stock_tienda_vendedor to authenticated;
grant select on public.stock_tienda_dueno to authenticated;

-- ---------------------------------------------------------------------------
-- 3. proveedores / pagos_proveedores → multi-tenant
-- ---------------------------------------------------------------------------
create trigger proveedores_tenant before insert on public.proveedores
  for each row execute function public.set_tenant_id_from_jwt();

create trigger pagos_proveedores_tenant before insert on public.pagos_proveedores
  for each row execute function public.set_tenant_id_from_jwt();

create index if not exists pagos_proveedores_fecha_idx
  on public.pagos_proveedores (fecha desc);

drop policy if exists pagos_proveedores_mi_tenant on public.pagos_proveedores;
create policy pagos_proveedores_mi_tenant on public.pagos_proveedores
  for all
  to authenticated
  using (tenant_id = public.tenant_id_activo())
  with check (
    tenant_id = public.tenant_id_activo()
    and exists (
      select 1 from public.proveedores p
      where p.id = proveedor_id
        and p.tenant_id = public.tenant_id_activo()
    )
  );