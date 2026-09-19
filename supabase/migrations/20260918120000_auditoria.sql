-- =============================================================================
-- Kahabox — Migración 0017: Módulo de Auditoría
--
-- Registro automático de eventos sensibles con "quién / qué / cuándo /
-- antes / después", para control interno (ver ej. "Marcelo eliminó 320
-- productos", "Marcelo cambió el precio de X").
--
-- Estrategia de captura (dos capas, sin duplicar):
--   1) Dentro de las RPCs (registrar_venta, anular_venta, registrar_ajuste,
--      importar_stock, actualizar_producto): transaccional, con before/after
--      exactos y auth.uid() como autor. Marcan set_config('kahabox.origen')
--      para que el trigger no duplique.
--   2) Triggers AFTER INSERT/UPDATE/DELETE en las tablas operativas
--      (stock_tienda, ventas, clientes, deudas, cobros, proveedores,
--      pagos_proveedores, productos_maestro, usuarios_tenant): capturan
--      cualquier cambio DIRECTO (escrituras sin RPC, futuras altas/bajas
--      de usuarios, etc.). Un cambio de cantidad en stock_tienda que NO
--      viene de una RPC queda como 'editar_stock_directo' → alerta.
--
-- Lectura: RLS restringida al rol dueño (rol_activo() = 'dueño'), además
-- del aislamiento por tenant. Los vendedores NO ven la auditoría.
-- La identidad sale del JWT (auth.uid()) y el nombre se copia a la fila
-- como snapshot (user_metadata.nombre de auth.users).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tabla auditoria
-- ---------------------------------------------------------------------------
create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  usuario_id uuid references auth.users (id) on delete set null,
  usuario_nombre text,
  rol text check (rol in ('dueño', 'vendedor')),
  sucursal_id uuid references public.sucursales (id) on delete set null,
  entidad text not null,
  entidad_id uuid,
  entidad_nombre text,
  comando text not null,
  descripcion text,
  antes jsonb,
  despues jsonb,
  lote_id uuid,
  ip text,
  dispositivo text,
  created_at timestamptz not null default now()
);

alter table public.auditoria enable row level security;

-- Solo el dueño puede leer (los inserts los hacen las funciones security
-- definer auditoria_trigger()/auditar(), que corren como dueño de la tabla).
create policy "auditoria_lectura_dueno" on public.auditoria
  for select
  to authenticated
  using (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') = 'dueño'
  );

create trigger auditoria_tenant before insert on public.auditoria
  for each row execute function public.set_tenant_id_from_jwt();

create index auditoria_tenant_fecha_idx
  on public.auditoria (tenant_id, created_at desc);
create index auditoria_tenante_entidad_idx
  on public.auditoria (tenant_id, entidad, created_at desc);
create index auditoria_tenante_usuario_idx
  on public.auditoria (tenant_id, usuario_id, created_at desc);
create index auditoria_tenante_comando_idx
  on public.auditoria (tenant_id, comando, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Helper de escritura auditoria
--    Resuelve tenant, autor (auth.uid()), nombre de usuario, rol y sucursal
--    desde el JWT. Devuelve el id creado.
-- ---------------------------------------------------------------------------
create or replace function public.auditar(
  p_entidad text,
  p_comando text,
  p_entidad_id uuid default null,
  p_entidad_nombre text default null,
  p_antes jsonb default null,
  p_despues jsonb default null,
  p_lote_id uuid default null,
  p_ip text default null,
  p_dispositivo text default null,
  p_descripcion text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_usuario uuid;
  v_nombre text;
  v_rol text;
  v_sucursal uuid;
  v_desc text;
  v_id uuid;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    return null;
  end if;

  v_usuario := auth.uid();

  select coalesce(user_metadata ->> 'nombre', email) into v_nombre
    from auth.users
   where id = v_usuario;

  v_rol := (auth.jwt() -> 'app_metadata' ->> 'rol');
  begin
    v_sucursal := nullif((auth.jwt() -> 'app_metadata' ->> 'sucursal_id'), '')::uuid;
  exception when others then
    v_sucursal := null;
  end;

  if p_descripcion is null then
    v_desc := coalesce(nullif(trim(coalesce(v_nombre, '')), ''), v_usuario::text);
  else
    v_desc := p_descripcion;
  end if;

  insert into public.auditoria
    (tenant_id, usuario_id, usuario_nombre, rol, sucursal_id,
     entidad, comando, entidad_id, entidad_nombre, descripcion,
     antes, despues, lote_id, ip, dispositivo)
  values
    (j_tenant, v_usuario, coalesce(v_nombre, v_usuario::text), v_rol, v_sucursal,
     p_entidad, p_comando, p_entidad_id, p_entidad_nombre, v_desc,
     p_antes, p_despues, p_lote_id, left(p_ip, 45), left(p_dispositivo, 200))
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger genérico de captura (AFTER INSERT/UPDATE/DELETE)
--    Maneja old/new por tabla, recorta columnas relevantes, y evita filhos
--    (solo updated_at / campos irrelevantes) y duplicados con las RPCs
--    (marca set_config('kahabox.origen')).
-- ---------------------------------------------------------------------------
create or replace function public.auditoria_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origen  text;
  v_comando text;
  v_antes   jsonb := null;
  v_despues jsonb := null;
  v_nombre  text;
  v_entidad text := tg_table_name;
  v_id      uuid;
begin
  v_origen := coalesce(current_setting('kahabox.origen', true), '');
  if v_origen <> '' then
    return null;
  end if;

  if tg_op in ('insert', 'update') then
    v_id := new.id;
  else
    v_id := old.id;
  end if;
  v_comando := case tg_op when 'insert' then 'crear' when 'delete' then 'eliminar' else 'editar' end;

  case tg_table_name
    when 'stock_tienda' then
      if tg_op in ('update', 'delete') then
        v_antes := jsonb_strip_nulls(jsonb_build_object(
          'cantidad', old.cantidad, 'precio', old.precio,
          'costo', old.costo, 'moneda', old.moneda));
        select p.nombre into v_nombre from public.productos_maestro p where p.id = old.producto_id;
      end if;
      if tg_op in ('insert', 'update') then
        v_despues := jsonb_strip_nulls(jsonb_build_object(
          'cantidad', new.cantidad, 'precio', new.precio,
          'costo', new.costo, 'moneda', new.moneda));
        if v_nombre is null then
          select p.nombre into v_nombre from public.productos_maestro p where p.id = new.producto_id;
        end if;
      end if;
      if tg_op = 'update'
         and old.cantidad is not distinct from new.cantidad
         and old.precio  is not distinct from new.precio
         and old.costo   is not distinct from new.costo
         and old.moneda  is not distinct from new.moneda then
        return null;
      end if;
      if tg_op = 'update' and old.cantidad is distinct from new.cantidad then
        v_comando := 'editar_stock_directo';
      end if;

    when 'ventas' then
      v_nombre := 'Venta';
      if tg_op in ('update', 'delete') then
        v_antes := jsonb_build_object('total', old.total, 'estado', old.estado);
      end if;
      if tg_op in ('insert', 'update') then
        v_despues := jsonb_build_object(
          'total', new.total, 'estado', new.estado,
          'sucursal_id', new.sucursal_id);
        if tg_op = 'update' and new.estado = 'anulada' then
          v_despues := v_despues || jsonb_build_object('anulada_por', new.anulada_por);
        end if;
      end if;
      if tg_op = 'update'
         and old.total is not distinct from new.total
         and old.estado is not distinct from new.estado then
        return null;
      end if;
      if tg_op = 'update' and old.estado is distinct from new.estado and new.estado = 'anulada' then
        v_comando := 'anular';
      end if;

    when 'productos_maestro' then
      v_nombre := null;
      if tg_op in ('insert', 'update') then
        v_despues := jsonb_strip_nulls(jsonb_build_object(
          'nombre', new.nombre, 'marca', new.marca, 'categoria', new.categoria));
        v_nombre := new.nombre;
      end if;
      if tg_op in ('update', 'delete') then
        v_antes := jsonb_strip_nulls(jsonb_build_object(
          'nombre', old.nombre, 'marca', old.marca, 'categoria', old.categoria));
        v_nombre := coalesce(v_nombre, old.nombre);
      end if;
      if tg_op = 'update'
         and old.nombre is not distinct from new.nombre
         and old.marca is not distinct from new.marca
         and old.categoria is not distinct from new.categoria then
        return null;
      end if;

    when 'clientes' then
      v_nombre := null;
      if tg_op in ('insert', 'update') then
        v_despues := jsonb_strip_nulls(jsonb_build_object(
          'nombre', new.nombre, 'tipo', new.tipo, 'ruc', new.ruc,
          'telefono', new.telefono, 'activo', new.activo));
        v_nombre := new.nombre;
      end if;
      if tg_op in ('update', 'delete') then
        v_antes := jsonb_strip_nulls(jsonb_build_object(
          'nombre', old.nombre, 'tipo', old.tipo, 'ruc', old.ruc,
          'telefono', old.telefono, 'activo', old.activo));
        v_nombre := coalesce(v_nombre, old.nombre);
      end if;
      if tg_op = 'update'
         and old.nombre is not distinct from new.nombre
         and old.tipo  is not distinct from new.tipo
         and old.ruc   is not distinct from new.ruc
         and old.telefono is not distinct from new.telefono
         and old.activo is not distinct from new.activo then
        return null;
      end if;

    when 'deudas' then
      v_nombre := 'Deuda';
      if tg_op in ('update', 'delete') then
        v_antes := jsonb_build_object(
          'monto', old.monto, 'moneda', old.moneda,
          'fecha', old.fecha, 'vencimiento', old.vencimiento);
      end if;
      if tg_op in ('insert', 'update') then
        v_despues := jsonb_build_object(
          'monto', new.monto, 'moneda', new.moneda,
          'fecha', new.fecha, 'vencimiento', new.vencimiento);
      end if;
      if tg_op = 'update'
         and old.monto is not distinct from new.monto
         and old.moneda is not distinct from new.moneda
         and old.fecha is not distinct from new.fecha
         and old.vencimiento is not distinct from new.vencimiento then
        return null;
      end if;

    when 'cobros' then
      v_nombre := 'Cobro';
      if tg_op in ('update', 'delete') then
        v_antes := jsonb_build_object(
          'monto', old.monto, 'moneda', old.moneda,
          'metodo', old.metodo, 'fecha', old.fecha);
      end if;
      if tg_op in ('insert', 'update') then
        v_despues := jsonb_build_object(
          'monto', new.monto, 'moneda', new.moneda,
          'metodo', new.metodo, 'fecha', new.fecha);
      end if;
      if tg_op = 'update'
         and old.monto is not distinct from new.monto
         and old.moneda is not distinct from new.moneda
         and old.metodo is not distinct from new.metodo
         and old.fecha is not distinct from new.fecha then
        return null;
      end if;

    when 'proveedores' then
      v_nombre := null;
      if tg_op in ('insert', 'update') then
        v_despues := jsonb_strip_nulls(jsonb_build_object(
          'nombre', new.nombre, 'ruc', new.ruc, 'telefono', new.telefono, 'activo', new.activo));
        v_nombre := new.nombre;
      end if;
      if tg_op in ('update', 'delete') then
        v_antes := jsonb_strip_nulls(jsonb_build_object(
          'nombre', old.nombre, 'ruc', old.ruc, 'telefono', old.telefono, 'activo', old.activo));
        v_nombre := coalesce(v_nombre, old.nombre);
      end if;
      if tg_op = 'update'
         and old.nombre is not distinct from new.nombre
         and old.ruc is not distinct from new.ruc
         and old.telefono is not distinct from new.telefono
         and old.activo is not distinct from new.activo then
        return null;
      end if;

    when 'pagos_proveedores' then
      v_nombre := 'Pago a proveedor';
      if tg_op in ('update', 'delete') then
        v_antes := jsonb_build_object(
          'monto', old.monto, 'moneda', old.moneda,
          'metodo', old.metodo, 'fecha', old.fecha, 'concepto', old.concepto);
      end if;
      if tg_op in ('insert', 'update') then
        v_despues := jsonb_build_object(
          'monto', new.monto, 'moneda', new.moneda,
          'metodo', new.metodo, 'fecha', new.fecha, 'concepto', new.concepto);
      end if;
      if tg_op = 'update'
         and old.monto is not distinct from new.monto
         and old.moneda is not distinct from new.moneda
         and old.metodo is not distinct from new.metodo
         and old.fecha is not distinct from new.fecha
         and old.concepto is not distinct from new.concepto then
        return null;
      end if;

    when 'usuarios_tenant' then
      v_entidad := 'usuarios';
      v_nombre := null;
      if tg_op in ('insert', 'update') then
        v_despues := jsonb_build_object('rol', new.rol);
        select coalesce(user_metadata ->> 'nombre', email) into v_nombre
          from auth.users where id = new.user_id;
      end if;
      if tg_op in ('update', 'delete') then
        v_antes := jsonb_build_object('rol', old.rol);
        if v_nombre is null then
          select coalesce(user_metadata ->> 'nombre', email) into v_nombre
            from auth.users where id = old.user_id;
        end if;
      end if;
      if tg_op = 'update' and old.rol is not distinct from new.rol then
        return null;
      end if;

    else
      return null;
  end case;

  perform public.auditar(
    p_entidad        => v_entidad,
    p_comando        => v_comando,
    p_entidad_id     => v_id,
    p_entidad_nombre => v_nombre,
    p_antes          => v_antes,
    p_despues        => v_despues
  );

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Triggers de captura por tabla
-- ---------------------------------------------------------------------------
create trigger auditoria_stock_tienda
  after insert or update or delete on public.stock_tienda
  for each row execute function public.auditoria_trigger();
create trigger auditoria_ventas
  after insert or update or delete on public.ventas
  for each row execute function public.auditoria_trigger();
create trigger auditoria_productos_maestro
  after update or delete on public.productos_maestro
  for each row execute function public.auditoria_trigger();
create trigger auditoria_clientes
  after insert or update or delete on public.clientes
  for each row execute function public.auditoria_trigger();
create trigger auditoria_deudas
  after insert or update or delete on public.deudas
  for each row execute function public.auditoria_trigger();
create trigger auditoria_cobros
  after insert or update or delete on public.cobros
  for each row execute function public.auditoria_trigger();
create trigger auditoria_proveedores
  after insert or update or delete on public.proveedores
  for each row execute function public.auditoria_trigger();
create trigger auditoria_pagos_proveedores
  after insert or update or delete on public.pagos_proveedores
  for each row execute function public.auditoria_trigger();
create trigger auditoria_usuarios_tenant
  after insert or update or delete on public.usuarios_tenant
  for each row execute function public.auditoria_trigger();

-- ---------------------------------------------------------------------------
-- 5. RPCs con auditoría transaccional (create or replace; mismo contrato +
--    parámetro opcional p_dispositivo — los grants existentes se conservan).
-- ---------------------------------------------------------------------------

-- 5.1 registrar_venta — agrega: marca de origen, resumen y dispositivo.
create or replace function public.registrar_venta(
  p_venta_id uuid,
  p_sucursal_id uuid,
  p_total numeric,
  p_items jsonb,
  p_pagos jsonb default '[]'::jsonb,
  p_estado text default 'confirmada',
  p_created_at timestamptz default null,
  p_dispositivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_vendedor uuid;
  v_item jsonb;
  v_pago jsonb;
  v_total_items numeric := 0;
  v_total_validable boolean := true;
  v_fecha timestamptz;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  if exists (select 1 from public.ventas where id = p_venta_id and tenant_id = j_tenant) then
    return jsonb_build_object('venta_id', p_venta_id, 'ya_existia', true);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if v_item ? 'precio_unitario_gs' and (v_item->>'cantidad')::int >= 0 then
      v_total_items := v_total_items
        + (v_item->>'precio_unitario_gs')::numeric * (v_item->>'cantidad')::int;
    else
      v_total_validable := false;
    end if;
  end loop;

  if v_total_validable and abs(v_total_items - p_total) > 1 then
    raise exception
      'El total no coincide con los ítems de la venta (total: % — suma de ítems: %)',
      p_total, v_total_items;
  end if;

  select id into v_vendedor
    from public.usuarios_tenant
   where user_id = auth.uid() and tenant_id = j_tenant
   limit 1;

  v_fecha := coalesce(p_created_at, now());

  perform set_config('kahabox.origen', 'venta', true);

  insert into public.ventas
    (id, tenant_id, sucursal_id, vendedor_id, total, estado, created_at)
  values
    (p_venta_id, j_tenant, p_sucursal_id, v_vendedor, p_total, p_estado, v_fecha)
  on conflict (id) do nothing;

  for v_item in select * from jsonb_array_elements(p_items) loop
    update public.stock_tienda
       set cantidad = cantidad - (v_item->>'cantidad')::int,
           updated_at = now()
     where id = (v_item->>'stock_id')::uuid
       and tenant_id = j_tenant
       and cantidad >= (v_item->>'cantidad')::int;

    if not found then
      raise exception 'Stock insuficiente para un ítem de la venta';
    end if;

    insert into public.venta_items
      (id, venta_id, stock_tienda_id, tenant_id, cantidad, precio_unitario)
    values
      ((v_item->>'id')::uuid, p_venta_id, (v_item->>'stock_id')::uuid, j_tenant,
       (v_item->>'cantidad')::int, (v_item->>'precio_unitario')::numeric)
    on conflict (id) do nothing;
  end loop;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into public.venta_pagos
      (id, tenant_id, venta_id, metodo, moneda, monto, detalle)
    values
      ((v_pago->>'id')::uuid, j_tenant, p_venta_id, v_pago->>'metodo',
       coalesce(v_pago->>'moneda', 'PYG'), (v_pago->>'monto')::numeric,
       nullif(v_pago->>'detalle', ''))
    on conflict (id) do nothing;
  end loop;

  perform public.auditar(
    p_entidad        => 'ventas',
    p_comando        => 'venta',
    p_entidad_id     => p_venta_id,
    p_entidad_nombre => 'Venta',
    p_despues        => jsonb_build_object(
      'total', p_total,
      'items', jsonb_array_length(p_items),
      'pagos', jsonb_array_length(p_pagos),
      'estado', p_estado,
      'sucursal_id', p_sucursal_id
    ),
    p_dispositivo    => p_dispositivo,
    p_descripcion    => 'Venta por Gs ' || to_char(p_total, 'FM999999999990.99')
  );

  return jsonb_build_object(
    'venta_id', p_venta_id,
    'items', jsonb_array_length(p_items),
    'pagos', jsonb_array_length(p_pagos)
  );
end;
$$;

-- 5.2 anular_venta — agrega marca de origen (para no loguear el re-stock de
--     cada línea) y una fila de auditoría con antes/después.
create or replace function public.anular_venta(
  p_venta_id uuid,
  p_dispositivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_anulada_por uuid;
  v_total numeric;
  v_estado text;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  if not exists (
    select 1 from public.ventas where id = p_venta_id and tenant_id = j_tenant
  ) then
    raise exception 'Venta no encontrada';
  end if;

  if exists (
    select 1 from public.ventas
     where id = p_venta_id and tenant_id = j_tenant and estado = 'anulada'
  ) then
    return jsonb_build_object('venta_id', p_venta_id, 'ya_anulada', true);
  end if;

  select total, estado into v_total, v_estado
    from public.ventas
   where id = p_venta_id and tenant_id = j_tenant;

  perform set_config('kahabox.origen', 'anular', true);

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

  perform public.auditar(
    p_entidad        => 'ventas',
    p_comando        => 'anular',
    p_entidad_id     => p_venta_id,
    p_entidad_nombre => 'Venta',
    p_antes          => jsonb_build_object('total', v_total, 'estado', v_estado),
    p_despues        => jsonb_build_object('total', v_total, 'estado', 'anulada'),
    p_dispositivo    => p_dispositivo,
    p_descripcion    => 'Anuló la venta de Gs ' || to_char(v_total, 'FM999999999990.99')
  );

  return jsonb_build_object('venta_id', p_venta_id, 'anulada', true);
end;
$$;

-- 5.3 registrar_ajuste — agrega marca de origen y auditoría con cantidad
--     anterior/nueva del producto (nombre que ya recibe como parámetro).
create or replace function public.registrar_ajuste(
  p_movimiento_id uuid,
  p_linea_id uuid,
  p_sucursal_id uuid,
  p_tipo text,
  p_cantidad integer,
  p_motivo text,
  p_producto_nombre text,
  p_codigo_barras text,
  p_sku text,
  p_created_at timestamptz default null,
  p_dispositivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_delta integer;
  v_vieja integer;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  if p_tipo not in ('entrada', 'salida') then
    raise exception 'Tipo de ajuste inválido';
  end if;

  if exists (
    select 1 from public.stock_movimientos
    where id = p_movimiento_id and tenant_id = j_tenant
  ) then
    return jsonb_build_object('movimiento_id', p_movimiento_id, 'ya_existia', true);
  end if;

  v_delta := case when p_tipo = 'salida' then -p_cantidad else p_cantidad end;

  select cantidad into v_vieja
    from public.stock_tienda
   where id = p_linea_id and tenant_id = j_tenant;

  perform set_config('kahabox.origen', 'ajuste', true);

  update public.stock_tienda
     set cantidad = cantidad + v_delta,
         updated_at = now()
   where id = p_linea_id
     and tenant_id = j_tenant
     and cantidad + v_delta >= 0;

  if not found then
    raise exception 'Stock insuficiente para la salida';
  end if;

  insert into public.stock_movimientos
    (id, tenant_id, sucursal_id, linea_id, producto_nombre, codigo_barras, sku,
     tipo, cantidad, motivo, created_at)
  values
    (p_movimiento_id, j_tenant, p_sucursal_id, p_linea_id, p_producto_nombre,
     nullif(p_codigo_barras, ''), nullif(p_sku, ''), p_tipo, v_delta,
     nullif(p_motivo, ''), coalesce(p_created_at, now()))
  on conflict (id) do nothing;

  perform public.auditar(
    p_entidad        => 'stock_tienda',
    p_comando        => 'ajuste',
    p_entidad_id     => p_linea_id,
    p_entidad_nombre => p_producto_nombre,
    p_antes          => jsonb_build_object('cantidad', v_vieja),
    p_despues        => jsonb_build_object('cantidad', v_vieja + v_delta, 'tipo', p_tipo),
    p_dispositivo    => p_dispositivo,
    p_descripcion    => 'Ajuste de stock (' || p_tipo || '): '
      || (coalesce(p_motivo, ''))
  );

  return jsonb_build_object('movimiento_id', p_movimiento_id);
end;
$$;

-- 5.4 importar_stock — agrega marca de origen, parámetro opcional p_lote_id
--     (agrupar los lotes de un mismo archivo) y una fila de auditoría con el
--     resumen completo de la importación.
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

  perform public.auditar(
    p_entidad        => 'stock_tienda',
    p_comando        => 'importar',
    p_entidad_nombre => 'Importación de stock',
    p_despues        => jsonb_build_object(
      'creados', v_creados,
      'actualizados', v_actualizados,
      'sin_cambios', v_sin_cambios,
      'errores', jsonb_array_length(v_errores),
      'filas', jsonb_array_length(p_filas)
    ),
    p_lote_id        => p_lote_id,
    p_dispositivo    => p_dispositivo,
    p_descripcion    => 'Importó ' || jsonb_array_length(p_filas) || ' productos desde Excel'
  );

  return jsonb_build_object(
    'creados', v_creados,
    'actualizados', v_actualizados,
    'sin_cambios', v_sin_cambios,
    'errores', v_errores
  );
end;
$$;

-- 5.5 actualizar_producto — agrega marca de origen y auditoría con
--     precio/costo/moneda anteriores y nuevos.
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
    p_descripcion    => 'Editó el producto «' || coalesce(v_nombre, '') || '»'
  );

  return jsonb_build_object(
    'linea_id', p_linea_id,
    'catalogo_actualizado', v_catalogo_ok
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permisos (los grants de las RPCs existentes ya persisten tras el
--    create or replace; se re-afirman por claridad).
-- ---------------------------------------------------------------------------
grant execute on function public.registrar_venta(uuid, uuid, numeric, jsonb, jsonb, text, timestamptz, text) to authenticated;
grant execute on function public.anular_venta(uuid, text) to authenticated;
grant execute on function public.registrar_ajuste(uuid, uuid, uuid, text, integer, text, text, text, text, timestamptz, text) to authenticated;
grant execute on function public.importar_stock(uuid, jsonb, uuid, text) to authenticated;
grant execute on function public.actualizar_producto(uuid, text, text, text, text, text, numeric, numeric, text, text) to authenticated;