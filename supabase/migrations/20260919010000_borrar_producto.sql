-- =============================================================================
-- Kahabox — Migración: borrar producto del stock (RPC borrar_producto)
--
-- Borra UNA línea de stock (la de la sucursal seleccionada). No borra el
-- maestro del catálogo compartido ni las líneas de otras sucursales.
--
-- Reglas:
--   * Solo el dueño (mismo criterio que importar_stock).
--   * La línea debe pertenecer al comercio activo.
--   * Si ya tiene ventas registradas (venta_items), se bloquea para no romper
--     el historial (la FK venta_items.stock_tienda_id ya lo impide por sí sola).
--
-- El trigger auditoria_trigger() captura el DELETE de stock_tienda como
-- 'eliminar' con el snapshot "antes" (no se marca origen, a propósito).
-- =============================================================================

create or replace function public.borrar_producto(
  p_linea_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_producto uuid;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede borrar productos';
  end if;

  select producto_id into v_producto
    from public.stock_tienda
   where id = p_linea_id
     and tenant_id = j_tenant;

  if v_producto is null then
    raise exception 'La línea de stock no pertenece a tu comercio';
  end if;

  if exists (
    select 1
      from public.venta_items
     where stock_tienda_id = p_linea_id
  ) then
    raise exception 'No se puede borrar: este producto ya tiene ventas registradas';
  end if;

  delete from public.stock_tienda
   where id = p_linea_id
     and tenant_id = j_tenant;

  return jsonb_build_object('linea_id', p_linea_id, 'borrado', true);
end;
$$;

revoke all on function public.borrar_producto(uuid) from public;
grant execute on function public.borrar_producto(uuid) to authenticated;