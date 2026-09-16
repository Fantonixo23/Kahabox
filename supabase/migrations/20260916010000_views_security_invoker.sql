-- =============================================================================
-- Kahabox — Migración 0005: vistas de stock con SECURITY INVOKER
-- Elimina el aviso "Security Definer View" del dashboard de Supabase.
--
-- Con SECURITY INVOKER la RLS de stock_tienda se aplica siempre (aislamiento
-- por tenant real: cada usuario solo ve sus filas). Antes eran SECURITY DEFINER
-- (ejecutaban como postgres, saltando RLS) y dependían del WHERE explícito.
--
-- Esto exige que `authenticated` tenga SELECT sobre las columnas que usan las
-- vistas, incluida `costo`. El aislamiento sigue siendo por tenant vía RLS.
-- (Nota: la distinción dueño/vendedor para ocultar `costo` era por vista, no por
-- rol de DB — todos los usuarios entran como `authenticated`. Si se quiere
-- ocultar costo al vendedor de verdad, es un TODO de fase 2 vía función y
-- ajuste del frontend; hoy el frontend usa stock_tienda_dueno para todos.)
-- =============================================================================

create or replace view public.stock_tienda_vendedor
with (security_invoker = true) as
  select id, tenant_id, sucursal_id, producto_id, sku, variante, precio, moneda, cantidad, updated_at
  from public.stock_tienda
  where tenant_id = public.tenant_id_activo();

create or replace view public.stock_tienda_dueno
with (security_invoker = true) as
  select id, tenant_id, sucursal_id, producto_id, sku, variante, precio, costo, moneda, cantidad, updated_at
  from public.stock_tienda
  where tenant_id = public.tenant_id_activo();

-- El rol authenticated necesita SELECT sobre las columnas que las vistas usan.
grant select on public.stock_tienda to authenticated;
grant select on public.stock_tienda_vendedor to authenticated;
grant select on public.stock_tienda_dueno to authenticated;