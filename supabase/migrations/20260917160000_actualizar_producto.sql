-- =============================================================================
-- Kahabox — Migración: editar producto desde Stock (RPC actualizar_producto)
--
-- El catálogo productos_maestro solo tiene política de INSERT (RLS), así que el
-- cliente no puede editar nombre/marca/categoría con un UPDATE directo. Esta
-- función (security definer, valida tenant_id_activo()) hace la edición.
--
-- Dos niveles de datos:
--   * stock_tienda    → precio, costo, moneda, sku, variante (propios de la
--                       tienda): siempre editables.
--   * productos_maestro → nombre, marca, categoría (catálogo COMPARTIDO entre
--                       tenants, clave única por código de barras): solo se
--                       editan si la fila la creó esta tienda o si aún no tiene
--                       creador. Así una tienda no pisa el nombre de otra.
--
-- La cantidad de stock NO se toca acá: sigue usando registrar_ajuste, que deja
-- histórico en stock_movimientos y valida que no quede negativo.
-- =============================================================================

create or replace function public.actualizar_producto(
  p_linea_id uuid,
  p_nombre text,
  p_marca text,
  p_categoria text,
  p_sku text,
  p_variante text,
  p_precio numeric,
  p_costo numeric,
  p_moneda text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_producto uuid;
  v_creador uuid;
  v_catalogo_ok boolean;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  if nullif(p_nombre, '') is null then
    raise exception 'El nombre del producto es obligatorio';
  end if;

  if p_moneda not in ('PYG', 'USD') then
    raise exception 'Moneda inválida';
  end if;

  select producto_id into v_producto
    from public.stock_tienda
   where id = p_linea_id
     and tenant_id = j_tenant;

  if v_producto is null then
    raise exception 'La línea de stock no pertenece a tu comercio';
  end if;

  -- Datos propios de la tienda.
  update public.stock_tienda
     set sku = nullif(p_sku, ''),
         variante = nullif(p_variante, ''),
         precio = p_precio,
         costo = p_costo,
         moneda = p_moneda,
         updated_at = now()
   where id = p_linea_id
     and tenant_id = j_tenant;

  -- Datos del catálogo compartido (solo si esta tienda lo creó, o si no tiene
  -- creador registrado).
  select creado_por_tenant_id into v_creador
    from public.productos_maestro
   where id = v_producto;

  v_catalogo_ok := (v_creador is null or v_creador = j_tenant);

  if v_catalogo_ok then
    update public.productos_maestro
       set nombre = p_nombre,
           marca = nullif(p_marca, ''),
           categoria = nullif(p_categoria, '')
     where id = v_producto;
  end if;

  return jsonb_build_object(
    'linea_id', p_linea_id,
    'catalogo_actualizado', v_catalogo_ok
  );
end;
$$;

-- Solo sesión autenticada (validada dentro del RPC por tenant_id_activo()).
revoke all on function public.actualizar_producto(uuid, text, text, text, text, text, numeric, numeric, text) from public;
grant execute on function public.actualizar_producto(uuid, text, text, text, text, text, numeric, numeric, text) to authenticated;
