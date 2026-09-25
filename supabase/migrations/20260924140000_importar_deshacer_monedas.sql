-- =============================================================================
-- Kahabox - Migracion 0031: moneda completa en stock + deshacer importaciones
--
--  1). stock_tienda.moneda pasa de PYG/USD a PYG/USD/ARS/BRL (va de la mano
--      con el selector de divisa del import de Excel: solo etiqueta el precio,
--      no convierte ni cotiza).
--  2). Tabla importaciones_detalle: antes/despues de cada linea que toca una
--      importacion (necesaria para deshacer).
--  3). importar_stock graba el detalle de cada fila (vale para imports hechos
--      despues de aplicar esta migracion).
--  4). RPC anular_importacion: revierte un lote completo (solo el dueno),
--      con movimientos compensatorios y auditoria.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1). Moneda completa en stock_tienda
-- ---------------------------------------------------------------------------
alter table public.stock_tienda
  drop constraint if exists stock_tienda_moneda_check;

alter table public.stock_tienda
  add constraint stock_tienda_moneda_check
  check (moneda in ('PYG', 'USD', 'ARS', 'BRL'));

comment on column public.stock_tienda.moneda
  is 'Divisa del precio/costo: PYG, USD, ARS o BRL (sin conversion automatica).';

-- ---------------------------------------------------------------------------
-- 2). Detalle de cada importacion (para deshacer)
-- ---------------------------------------------------------------------------
create table if not exists public.importaciones_detalle (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id) on delete cascade,
  lote_id                uuid not null,
  linea_id               uuid,
  producto_id            uuid not null,
  maestro_creado         boolean not null default false,
  maestro_nombre_antes   text,
  maestro_marca_antes    text,
  maestro_categoria_antes text,
  cantidad_antes         integer,
  cantidad_despues       integer,
  precio_antes           numeric,
  precio_despues         numeric,
  costo_antes            numeric,
  costo_despues          numeric,
  moneda_antes           text,
  moneda_despues         text not null default 'PYG',
  creada                 boolean not null default false,
  created_at             timestamptz not null default now()
);

create index if not exists importaciones_detalle_lote_idx
  on public.importaciones_detalle (tenant_id, lote_id);
create index if not exists importaciones_detalle_linea_idx
  on public.importaciones_detalle (tenant_id, linea_id);

alter table public.importaciones_detalle enable row level security;

comment on table public.importaciones_detalle
  is 'Snapshot antes/despues de cada linea tocada por una importacion. Solo lo escriben/leen funciones security definer.';

-- ---------------------------------------------------------------------------
-- 3). importar_stock: registra el detalle y acepta las 4 divisas
-- ---------------------------------------------------------------------------
create or replace function public.importar_stock(
  p_sucursal_id uuid,
  p_filas jsonb,
  p_lote_id uuid default null,
  p_dispositivo text default null
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
  v_cant_antes integer;
  v_precio_antes numeric;
  v_costo_antes numeric;
  v_moneda_antes text;
  v_cant_numeric numeric;
  v_linea_creada boolean;
  v_maestro_creado boolean;
  v_m_nombre_antes text;
  v_m_marca_antes text;
  v_m_categoria_antes text;
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
    raise exception 'Sesion invalida o sin comercio asignado';
  end if;

  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueno puede importar stock';
  end if;

  if jsonb_typeof(p_filas) <> 'array' then
    return jsonb_build_object('creados', 0, 'actualizados', 0, 'sin_cambios', 0, 'errores', jsonb_build_array(jsonb_build_object('fila', -1, 'motivo', 'p_filas debe ser un array')));
  end if;

  if p_sucursal_id is null then
    select id into p_sucursal_id
      from public.sucursales
     where tenant_id = j_tenant
     order by created_at asc, id asc
     limit 1;
  elsif not exists (
    select 1
      from public.sucursales
     where id = p_sucursal_id
       and tenant_id = j_tenant
  ) then
    raise exception 'La sucursal destino no pertenece a tu comercio. Revisa los datos y volve a importar.';
  end if;

  perform set_config('kahabox.origen', 'importar', true);

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
      if v_moneda not in ('PYG', 'USD', 'ARS', 'BRL') then
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
      v_maestro_creado := false;
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
        v_maestro_creado := true;
      else
        select nombre, marca, categoria
          into v_m_nombre_antes, v_m_marca_antes, v_m_categoria_antes
          from public.productos_maestro
         where id = v_maestro;

        update public.productos_maestro
           set nombre = v_nombre,
               marca = coalesce(v_marca, marca),
               categoria = coalesce(v_categoria, categoria),
               codigo_barras = coalesce(codigo_barras, v_codigo)
         where id = v_maestro;
      end if;

      -- 2. Linea de stock
      select id into v_linea
        from public.stock_tienda
       where tenant_id = j_tenant
         and coalesce(sucursal_id, j_tenant) = coalesce(p_sucursal_id, j_tenant)
         and producto_id = v_maestro
         and coalesce(sku, '') = coalesce(v_sku, '')
         and coalesce(variante, '') = coalesce(v_variante, '');

      v_linea_creada := false;
      v_cant_antes := null;
      v_precio_antes := null;
      v_costo_antes := null;
      v_moneda_antes := null;

      if v_linea is null then
        insert into public.stock_tienda
          (id, tenant_id, sucursal_id, producto_id, sku, variante, precio, costo, moneda, cantidad, updated_at)
        values
          (gen_random_uuid(), j_tenant, p_sucursal_id, v_maestro, v_sku, v_variante,
           v_precio, v_costo, v_moneda, v_cantidad, now())
        returning id into v_linea;

        v_creados := v_creados + 1;
        v_linea_creada := true;
        if v_cantidad > 0 then
          insert into public.stock_movimientos
            (id, tenant_id, sucursal_id, linea_id, producto_nombre, codigo_barras, sku,
             tipo, cantidad, motivo, created_at)
          values
            (gen_random_uuid(), j_tenant, p_sucursal_id, v_linea, v_nombre, v_codigo,
             v_sku, 'entrada', v_cantidad, 'Importacion desde Excel', now());
        end if;
      else
        select cantidad, precio, costo, moneda
          into v_cant_antes, v_precio_antes, v_costo_antes, v_moneda_antes
          from public.stock_tienda
         where id = v_linea;

        update public.stock_tienda
           set precio = v_precio,
               costo = v_costo,
               moneda = v_moneda,
               cantidad = v_cantidad,
               updated_at = now()
         where id = v_linea;

        if v_cant_antes = v_cantidad then
          v_sin_cambios := v_sin_cambios + 1;
        else
          v_actualizados := v_actualizados + 1;
          v_delta := v_cantidad - v_cant_antes;
          insert into public.stock_movimientos
            (id, tenant_id, sucursal_id, linea_id, producto_nombre, codigo_barras, sku,
             tipo, cantidad, motivo, created_at)
          values
            (gen_random_uuid(), j_tenant, p_sucursal_id, v_linea, v_nombre, v_codigo,
             v_sku, case when v_delta < 0 then 'salida' else 'entrada' end, v_delta,
             'Importacion desde Excel', now());
        end if;
      end if;

      -- 3. Detalle para poder deshacer
      insert into public.importaciones_detalle
        (tenant_id, lote_id, linea_id, producto_id, maestro_creado,
         maestro_nombre_antes, maestro_marca_antes, maestro_categoria_antes,
         cantidad_antes, cantidad_despues, precio_antes, precio_despues,
         costo_antes, costo_despues, moneda_antes, moneda_despues, creada)
      values
        (j_tenant, p_lote_id, v_linea, v_maestro, v_maestro_creado,
         v_m_nombre_antes, v_m_marca_antes, v_m_categoria_antes,
         v_cant_antes, v_cantidad, v_precio_antes, v_precio,
         v_costo_antes, v_costo, v_moneda_antes, v_moneda, v_linea_creada);

    exception when others then
      v_error := jsonb_build_object(
        'fila', v_i + 1,
        'motivo', left(coalesce(sqlerrm, 'Error'), 160)
      );
      v_errores := v_errores || v_error;
    end;
  end loop;

  perform public.auditar(
    p_entidad        => 'stock_tienda',
    p_comando        => 'importar',
    p_entidad_nombre => 'Importacion de stock',
    p_despues        => jsonb_build_object(
      'creados', v_creados,
      'actualizados', v_actualizados,
      'sin_cambios', v_sin_cambios,
      'errores', jsonb_array_length(v_errores),
      'filas', jsonb_array_length(p_filas)
    ),
    p_lote_id        => p_lote_id,
    p_dispositivo    => p_dispositivo,
    p_descripcion    => 'Importo ' || jsonb_array_length(p_filas) || ' productos desde Excel'
  );

  return jsonb_build_object(
    'creados', v_creados,
    'actualizados', v_actualizados,
    'sin_cambios', v_sin_cambios,
    'errores', v_errores
  );
end;
$$;

grant execute on function public.importar_stock(uuid, jsonb, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4). Deshacer una importacion completa (por lote)
-- ---------------------------------------------------------------------------
create or replace function public.anular_importacion(
  p_lote_id uuid,
  p_dispositivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_ts_lote timestamptz;
  v_reg record;
  v_restauradas integer := 0;
  v_eliminadas integer := 0;
  v_saltadas integer := 0;
  v_ya_revertida boolean;
  v_existe_linea boolean;
  v_tiene_ventas boolean;
  v_otras integer;
  v_delta integer;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesion invalida o sin comercio asignado';
  end if;

  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueno puede deshacer importaciones';
  end if;

  if p_lote_id is null then
    raise exception 'Falta el lote de importacion';
  end if;

  -- Idempotente: un lote ya deshecho no se vuelve a tocar.
  select exists (
    select 1
      from public.auditoria
     where tenant_id = j_tenant
       and comando = 'anular_importacion'
       and lote_id = p_lote_id
  ) into v_ya_revertida;

  if v_ya_revertida then
    return jsonb_build_object('restauradas', 0, 'eliminadas', 0, 'saltadas', 0, 'revertida', true);
  end if;

  select min(created_at) into v_ts_lote
    from public.importaciones_detalle
   where tenant_id = j_tenant
     and lote_id = p_lote_id;

  if v_ts_lote is null then
    raise exception 'Este lote no tiene detalle para deshacer (las importaciones hechas antes de habilitar esta funcion no se pueden deshacer)';
  end if;

  perform set_config('kahabox.origen', 'anular_importacion', true);

  for v_reg in
    select i.*
      from public.importaciones_detalle i
     where i.tenant_id = j_tenant
       and i.lote_id = p_lote_id
  loop
    select exists (
      select 1 from public.stock_tienda where id = v_reg.linea_id
    ) into v_existe_linea;

    if not v_existe_linea then
      continue;
    end if;

    -- Si la linea ya se vendio luego del lote, no se deshace (seria ambiguo).
    select exists (
      select 1
        from public.venta_items vi
        join public.stock_tienda st on st.id = vi.stock_tienda_id
       where st.id = v_reg.linea_id
         and vi.created_at >= v_ts_lote
    ) into v_tiene_ventas;

    if v_tiene_ventas then
      v_saltadas := v_saltadas + 1;
      continue;
    end if;

    if v_reg.creada then
      -- Linea creada por el lote: movimiento compensatorio y borrado.
      if v_reg.cantidad_despues is not null and v_reg.cantidad_despues > 0 then
        insert into public.stock_movimientos
          (id, tenant_id, sucursal_id, linea_id, producto_nombre, codigo_barras, sku,
           tipo, cantidad, motivo, created_at)
        values
          (gen_random_uuid(), j_tenant, null, v_reg.linea_id, '', null, null,
           'salida', -v_reg.cantidad_despues, 'Reversion de importacion', now());
      end if;

      delete from public.stock_tienda where id = v_reg.linea_id;
      v_eliminadas := v_eliminadas + 1;

      -- Catalogo creado por el lote: si quedo huerfano y sin ventas, se borra.
      if v_reg.maestro_creado then
        select count(*) into v_otras
          from public.stock_tienda
         where producto_id = v_reg.producto_id;
        if v_otras = 0 then
          delete from public.productos_maestro where id = v_reg.producto_id;
        end if;
      end if;
    else
      -- Linea ya existente: restaurar valores previos.
      v_delta := 0;
      if v_reg.cantidad_antes is not null
         and v_reg.cantidad_despues is not null
         and v_reg.cantidad_despues <> v_reg.cantidad_antes then
        v_delta := v_reg.cantidad_antes - v_reg.cantidad_despues;
        insert into public.stock_movimientos
          (id, tenant_id, sucursal_id, linea_id, producto_nombre, codigo_barras, sku,
           tipo, cantidad, motivo, created_at)
        values
          (gen_random_uuid(), j_tenant, null, v_reg.linea_id, '', null, null,
           case when v_delta < 0 then 'salida' else 'entrada' end, v_delta,
           'Reversion de importacion', now());
      end if;

      update public.stock_tienda
         set precio = coalesce(v_reg.precio_antes, precio),
             costo = coalesce(v_reg.costo_antes, costo),
             moneda = coalesce(v_reg.moneda_antes, moneda),
             cantidad = coalesce(v_reg.cantidad_antes, cantidad),
             updated_at = now()
       where id = v_reg.linea_id;
      v_restauradas := v_restauradas + 1;

      -- Restaurar metadatos del catalogo si el lote los cambio.
      if v_reg.maestro_nombre_antes is not null then
        update public.productos_maestro
           set nombre = v_reg.maestro_nombre_antes,
               marca = coalesce(v_reg.maestro_marca_antes, marca),
               categoria = coalesce(v_reg.maestro_categoria_antes, categoria)
         where id = v_reg.producto_id;
      end if;
    end if;
  end loop;

  perform public.auditar(
    p_entidad        => 'importaciones',
    p_comando        => 'anular_importacion',
    p_entidad_nombre => 'Deshacer importacion',
    p_despues        => jsonb_build_object(
      'restauradas', v_restauradas,
      'eliminadas', v_eliminadas,
      'saltadas', v_saltadas
    ),
    p_lote_id        => p_lote_id,
    p_dispositivo    => p_dispositivo,
    p_descripcion    => 'Deshizo la importacion del lote ' || p_lote_id::text
  );

  return jsonb_build_object(
    'restauradas', v_restauradas,
    'eliminadas', v_eliminadas,
    'saltadas', v_saltadas,
    'revertida', false
  );
end;
$$;

grant execute on function public.anular_importacion(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5). actualizar_producto: admite las 4 divisas (antes PYG/USD)
-- ---------------------------------------------------------------------------
create or replace function public.actualizar_producto(
  p_linea_id uuid,
  p_nombre text,
  p_marca text,
  p_categoria text,
  p_sku text,
  p_variante text,
  p_precio numeric,
  p_costo numeric,
  p_moneda text,
  p_dispositivo text default null
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
  v_old_precio numeric;
  v_old_costo numeric;
  v_old_moneda text;
  v_nombre text;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesion invalida o sin comercio asignado';
  end if;

  if nullif(p_nombre, '') is null then
    raise exception 'El nombre del producto es obligatorio';
  end if;

  if p_moneda not in ('PYG', 'USD', 'ARS', 'BRL') then
    raise exception 'Moneda invalida';
  end if;

  select producto_id into v_producto
    from public.stock_tienda
   where id = p_linea_id
     and tenant_id = j_tenant;

  if v_producto is null then
    raise exception 'La linea de stock no pertenece a tu comercio';
  end if;

  select precio, costo, moneda into v_old_precio, v_old_costo, v_old_moneda
    from public.stock_tienda
   where id = p_linea_id and tenant_id = j_tenant;

  select nombre into v_nombre
    from public.productos_maestro
   where id = v_producto;

  perform set_config('kahabox.origen', 'producto', true);

  update public.stock_tienda
     set sku = nullif(p_sku, ''),
         variante = nullif(p_variante, ''),
         precio = p_precio,
         costo = p_costo,
         moneda = p_moneda,
         updated_at = now()
   where id = p_linea_id
     and tenant_id = j_tenant;

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

  perform public.auditar(
    p_entidad        => 'stock_tienda',
    p_comando        => 'editar',
    p_entidad_id     => p_linea_id,
    p_entidad_nombre => v_nombre,
    p_antes          => jsonb_strip_nulls(jsonb_build_object(
      'precio', v_old_precio, 'costo', v_old_costo, 'moneda', v_old_moneda)),
    p_despues        => jsonb_strip_nulls(jsonb_build_object(
      'precio', p_precio, 'costo', p_costo, 'moneda', p_moneda)),
    p_dispositivo    => p_dispositivo,
    p_descripcion    => 'Edito el producto «' || coalesce(v_nombre, '') || '»'
  );

  return jsonb_build_object(
    'linea_id', p_linea_id,
    'catalogo_actualizado', v_catalogo_ok
  );
end;
$$;

grant execute on function public.actualizar_producto(uuid, text, text, text, text, text, numeric, numeric, text, text) to authenticated;