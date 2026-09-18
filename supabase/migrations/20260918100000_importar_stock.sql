-- =============================================================================
-- Kahabox — Migración: importar_stock (importación masiva desde Excel/CSV)
-- Upsert por fila sobre el catálogo compartido + líneas de stock de una
-- sucursal. Solo el rol dueño puede ejecutarlo.
--   * maestro:  por codigo_barras → si no, por (nombre, marca, categoria)
--               exacto/insensible → si no, lo crea.
--   * línea:    por clave única (tenant, sucursal, producto, sku, variante).
--               Si existe → UPDATE precio/costo/moneda/cantidad (cantidad SET,
--               no suma). Si no → INSERT.
--   * historial: un stock_movimientos solo cuando la cantidad realmente cambia
--               (tipo entrada/salida según el signo del delta), con motivo
--               "Importación desde Excel".
-- Cada fila corre en su propio bloque: una fila inválida no tumba el lote.
-- Resultado: { creados, actualizados, sin_cambios, errores: [{fila, motivo}] }
-- =============================================================================

create or replace function public.importar_stock(
  p_sucursal_id uuid,
  p_filas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_fila jsonb;
  v_error jsonb;
  v_errores jsonb := '[]'::jsonb;
  v_nombre text;
  v_codigo text;
  v_marca text;
  v_categoria text;
  v_sku text;
  v_variante text;
  v_moneda text;
  v_precio numeric;
  v_costo numeric;
  v_cantidad integer;
  v_prev_cantidad integer;
  v_maestro uuid;
  v_linea uuid;
  v_delta integer;
  v_creados integer := 0;
  v_actualizados integer := 0;
  v_sin_cambios integer := 0;
  v_i integer;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede importar stock';
  end if;

  if jsonb_typeof(p_filas) <> 'array' then
    return jsonb_build_object('creados', 0, 'actualizados', 0, 'sin_cambios', 0, 'errores', jsonb_build_array(jsonb_build_object('fila', -1, 'motivo', 'p_filas debe ser un array')));
  end if;

  for v_i in 0 .. jsonb_array_length(p_filas) - 1 loop
    v_fila := p_filas -> v_i;
    begin
      v_nombre := trim(coalesce(v_fila ->> 'nombre', ''));
      if v_nombre = '' then
        v_errores := v_errores || jsonb_build_object('fila', v_i + 1, 'motivo', 'Falta el nombre');
        continue;
      end if;

      v_codigo := nullif(trim(coalesce(v_fila ->> 'codigo', '')), '');
      v_marca  := nullif(trim(coalesce(v_fila ->> 'marca', '')), '');
      v_categoria := nullif(trim(coalesce(v_fila ->> 'categoria', '')), '');
      v_sku    := nullif(trim(coalesce(v_fila ->> 'sku', '')), '');
      v_variante := nullif(trim(coalesce(v_fila ->> 'variante', '')), '');
      v_moneda := coalesce(v_fila ->> 'moneda', 'PYG');
      if v_moneda not in ('PYG', 'USD') then
        v_moneda := 'PYG';
      end if;

      v_precio := coalesce((v_fila ->> 'precio')::numeric, 0);
      if v_precio < 0 then
        v_errores := v_errores || jsonb_build_object('fila', v_i + 1, 'motivo', 'Precio negativo');
        continue;
      end if;
      if (v_fila ->> 'costo') is null then
        v_costo := null;
      else
        v_costo := (v_fila ->> 'costo')::numeric;
        if v_costo < 0 then
          v_errores := v_errores || jsonb_build_object('fila', v_i + 1, 'motivo', 'Costo negativo');
          continue;
        end if;
      end if;

      v_cantidad := floor(coalesce((v_fila ->> 'cantidad')::numeric, 0));
      if v_cantidad < 0 then
        v_errores := v_errores || jsonb_build_object('fila', v_i + 1, 'motivo', 'Cantidad negativa');
        continue;
      end if;

      -- 1. Maestro
      v_maestro := null;
      if v_codigo is not null then
        select id into v_maestro
          from public.productos_maestro
         where codigo_barras = v_codigo;
      end if;

      if v_maestro is null then
        select id into v_maestro
          from public.productos_maestro
         where lower(nombre) = lower(v_nombre)
           and coalesce(lower(marca), '') = coalesce(lower(v_marca), '')
           and coalesce(lower(categoria), '') = coalesce(lower(v_categoria), '')
         order by created_at asc
         limit 1;
      end if;

      if v_maestro is null then
        insert into public.productos_maestro
          (id, codigo_barras, nombre, marca, categoria, creado_por_tenant_id)
        values
          (gen_random_uuid(), v_codigo, v_nombre, v_marca, v_categoria, j_tenant)
        returning id into v_maestro;
      else
        update public.productos_maestro
           set nombre = v_nombre,
               marca = coalesce(v_marca, marca),
               categoria = coalesce(v_categoria, categoria),
               codigo_barras = coalesce(codigo_barras, v_codigo)
         where id = v_maestro;
      end if;

      -- 2. Línea de stock
      select id into v_linea
        from public.stock_tienda
       where tenant_id = j_tenant
         and coalesce(sucursal_id, j_tenant) = coalesce(p_sucursal_id, j_tenant)
         and producto_id = v_maestro
         and coalesce(sku, '') = coalesce(v_sku, '')
         and coalesce(variante, '') = coalesce(v_variante, '');

      if v_linea is null then
        insert into public.stock_tienda
          (id, tenant_id, sucursal_id, producto_id, sku, variante, precio, costo, moneda, cantidad, updated_at)
        values
          (gen_random_uuid(), j_tenant, p_sucursal_id, v_maestro, v_sku, v_variante,
           v_precio, v_costo, v_moneda, v_cantidad, now())
        returning id into v_linea;

        v_creados := v_creados + 1;
        if v_cantidad > 0 then
          insert into public.stock_movimientos
            (id, tenant_id, sucursal_id, linea_id, producto_nombre, codigo_barras, sku,
             tipo, cantidad, motivo, created_at)
          values
            (gen_random_uuid(), j_tenant, p_sucursal_id, v_linea, v_nombre, v_codigo,
             v_sku, 'entrada', v_cantidad, 'Importación desde Excel', now());
        end if;
      else
        select cantidad into v_prev_cantidad from public.stock_tienda where id = v_linea;

        update public.stock_tienda
           set precio = v_precio,
               costo = v_costo,
               moneda = v_moneda,
               cantidad = v_cantidad,
               updated_at = now()
         where id = v_linea;

        if v_prev_cantidad = v_cantidad then
          v_sin_cambios := v_sin_cambios + 1;
        else
          v_actualizados := v_actualizados + 1;
          v_delta := v_cantidad - v_prev_cantidad;
          insert into public.stock_movimientos
            (id, tenant_id, sucursal_id, linea_id, producto_nombre, codigo_barras, sku,
             tipo, cantidad, motivo, created_at)
          values
            (gen_random_uuid(), j_tenant, p_sucursal_id, v_linea, v_nombre, v_codigo,
             v_sku, case when v_delta < 0 then 'salida' else 'entrada' end, v_delta,
             'Importación desde Excel', now());
        end if;
      end if;

    exception when others then
      v_error := jsonb_build_object(
        'fila', v_i + 1,
        'motivo', left(coalesce(sqlerrm, 'Error'), 160)
      );
      v_errores := v_errores || v_error;
    end;
  end loop;

  return jsonb_build_object(
    'creados', v_creados,
    'actualizados', v_actualizados,
    'sin_cambios', v_sin_cambios,
    'errores', v_errores
  );
end;
$$;

revoke all on function public.importar_stock(uuid, jsonb) from public;
grant execute on function public.importar_stock(uuid, jsonb) to authenticated;