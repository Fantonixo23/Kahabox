-- =============================================================================
-- Kahabox — Migración: anulación de ventas (RPC anular_venta)
--
-- Antes no existía forma de anular una venta ya confirmada. Este RPC (mismo
-- estilo que registrar_venta / registrar_ajuste, security definer con
-- search_path fijo y validación de tenant):
--   * revierte el descuento de stock de cada ítem vendido (devuelve la
--     cantidad a su línea en stock_tienda),
--   * marca la venta como 'anulada' y guarda quién la anuló y cuándo.
-- Es idempotente: anular dos veces no devuelve el stock dos veces.
--
-- Modelo de datos: se agregan dos columnas de auditoría a ventas
-- (anulada_por / anulada_en).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Auditoría de anulación en ventas
-- ---------------------------------------------------------------------------
alter table public.ventas
  add column if not exists anulada_por uuid
    references public.usuarios_tenant (id) on delete set null;
alter table public.ventas
  add column if not exists anulada_en timestamptz;

-- ---------------------------------------------------------------------------
-- 2. RPC anular_venta
--    Devuelve:
--      { venta_id, anulada: true }          primera anulación
--      { venta_id, ya_anulada: true }       reintento (no toca stock de nuevo)
--    Lanza excepción si la venta no existe o no pertenece al tenant.
-- ---------------------------------------------------------------------------
create or replace function public.anular_venta(p_venta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_anulada_por uuid;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  -- La venta debe existir y ser de este tenant.
  if not exists (
    select 1 from public.ventas where id = p_venta_id and tenant_id = j_tenant
  ) then
    raise exception 'Venta no encontrada';
  end if;

  -- Reintento genuino: ya anulada → no devuelve stock por segunda vez.
  if exists (
    select 1 from public.ventas
     where id = p_venta_id and tenant_id = j_tenant and estado = 'anulada'
  ) then
    return jsonb_build_object('venta_id', p_venta_id, 'ya_anulada', true);
  end if;

  -- Devuelve a cada línea de stock la cantidad vendida en esa venta.
  update public.stock_tienda st
     set cantidad = st.cantidad + vi.cantidad,
         updated_at = now()
    from public.venta_items vi
   where vi.venta_id = p_venta_id
     and vi.tenant_id = j_tenant
     and st.id = vi.stock_tienda_id
     and st.tenant_id = j_tenant;

  select id into v_anulada_por
    from public.usuarios_tenant
   where user_id = auth.uid() and tenant_id = j_tenant
   limit 1;

  update public.ventas
     set estado = 'anulada',
         anulada_por = v_anulada_por,
         anulada_en = now()
   where id = p_venta_id and tenant_id = j_tenant;

  return jsonb_build_object('venta_id', p_venta_id, 'anulada', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Permisos: solo sesión autenticada (tenant validado dentro del RPC).
-- ---------------------------------------------------------------------------
revoke all on function public.anular_venta(uuid) from public;
grant execute on function public.anular_venta(uuid) to authenticated;