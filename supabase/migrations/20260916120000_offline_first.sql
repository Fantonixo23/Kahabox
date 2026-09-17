-- =============================================================================
-- Kahabox — Migración: Offline-first (cola de sincronización)
--
-- La app trabaja con red local cuando está; si hay un corte, las escrituras
-- principales (ventas, alta de producto, entrada/salida de stock, proveedores
-- y pagos) quedan en una cola en localStorage y se suben al volver.
--
-- Para que la sincronización sea segura (reintentos sin duplicados ni
-- descuentos dobles de stock) se agregan:
--   * tabla venta_pagos  → desglose real del cobro (efectivo/POS/transf/fiado)
--   * 3 RPC idempotentes (security definer, validan tenant_id_activo()) que
--     reemplazan los flujos multi-paso que hoy NO son transaccionales.
--
-- La idempotencia se apoya en ids generados en el cliente: cada operación
-- reintentada "no hace nada" si ya se registró (on conflict do nothing / check
-- previo del marcador). El decremento de stock solo ocurre cuando la venta
-- (o el movimiento) es nuevo, por eso nunca descuenta dos veces.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. venta_pagos: desglose del cobro de una venta
-- ---------------------------------------------------------------------------
create table public.venta_pagos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  venta_id   uuid not null references public.ventas (id) on delete cascade,
  metodo     text not null check (metodo in ('efectivo', 'pos', 'transferencia', 'fiado')),
  moneda     text not null default 'PYG' check (moneda in ('PYG', 'USD', 'ARS', 'BRL')),
  monto      numeric(14, 2) not null check (monto > 0),
  detalle    text,
  created_at timestamptz not null default now()
);

create index venta_pagos_venta_idx on public.venta_pagos (venta_id);
create index venta_pagos_tenant_idx on public.venta_pagos (tenant_id);

create trigger venta_pagos_tenant before insert on public.venta_pagos
  for each row execute function public.set_tenant_id_from_jwt();

alter table public.venta_pagos enable row level security;

create policy venta_pagos_isolation on public.venta_pagos
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

grant select on public.venta_pagos to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC registrar_venta — atómico e idempotente
--    args:
--      p_venta_id   uuid        id de la venta (generado en cliente)
--      p_sucursal_id uuid|null
--      p_total      numeric
--      p_items      jsonb       [{id, stock_id, cantidad, precio_unitario}]
--      p_pagos      jsonb       [{id, metodo, moneda, monto, detalle}]  (default [])
--      p_estado     text        'confirmada' | 'pendiente_sync' (default confirmada)
--      p_created_at timestamptz fecha real de la venta (se respeta al sincronizar)
-- ---------------------------------------------------------------------------
create or replace function public.registrar_venta(
  p_venta_id uuid,
  p_sucursal_id uuid,
  p_total numeric,
  p_items jsonb,
  p_pagos jsonb default '[]'::jsonb,
  p_estado text default 'confirmada',
  p_created_at timestamptz default null
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
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  select id into v_vendedor
    from public.usuarios_tenant
   where user_id = auth.uid() and tenant_id = j_tenant
   limit 1;

  insert into public.ventas
    (id, tenant_id, sucursal_id, vendedor_id, total, estado, created_at)
  values
    (p_venta_id, j_tenant, p_sucursal_id, v_vendedor, p_total, p_estado,
     coalesce(p_created_at, now()))
  on conflict (id) do nothing;

  -- Si la venta ya existía es un reintento: no repetimos items ni descuentos.
  if exists (select 1 from public.ventas where id = p_venta_id and tenant_id = j_tenant) then
    return jsonb_build_object('venta_id', p_venta_id, 'ya_existia', true);
  end if;

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

  return jsonb_build_object(
    'venta_id', p_venta_id,
    'items', jsonb_array_length(p_items),
    'pagos', jsonb_array_length(p_pagos)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC registrar_producto — alta de producto de la Caja / Stock (idempotente)
--    Devuelve el id efectivo de la línea de stock (puede ser una existente si
--    el código ya estaba dado de alta).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_producto(
  p_maestro_id uuid,
  p_codigo text,
  p_nombre text,
  p_marca text,
  p_categoria text,
  p_linea_id uuid,
  p_sucursal_id uuid,
  p_sku text,
  p_variante text,
  p_precio numeric,
  p_costo numeric,
  p_moneda text,
  p_cantidad integer,
  p_created_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_maestro uuid;
  v_linea uuid;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  if nullif(p_codigo, '') is not null then
    select id into v_maestro
      from public.productos_maestro
     where codigo_barras = p_codigo;
  end if;

  if v_maestro is null then
    insert into public.productos_maestro
      (id, codigo_barras, nombre, marca, categoria, creado_por_tenant_id, created_at)
    values
      (p_maestro_id, nullif(p_codigo, ''), p_nombre, nullif(p_marca, ''),
       nullif(p_categoria, ''), j_tenant, coalesce(p_created_at, now()))
    on conflict do nothing;

    -- Reintento ya registrado o colisión de código con otro maestro
    if exists (select 1 from public.productos_maestro where id = p_maestro_id) then
      v_maestro := p_maestro_id;
    else
      select id into v_maestro from public.productos_maestro where codigo_barras = p_codigo;
    end if;
  end if;

  if v_maestro is null then
    raise exception 'No se pudo registrar el producto';
  end if;

  select id into v_linea
    from public.stock_tienda
   where tenant_id = j_tenant
     and coalesce(sucursal_id, j_tenant) = coalesce(p_sucursal_id, j_tenant)
     and producto_id = v_maestro
     and coalesce(sku, '') = coalesce(p_sku, '')
     and coalesce(variante, '') = coalesce(p_variante, '');

  if v_linea is null then
    insert into public.stock_tienda
      (id, tenant_id, sucursal_id, producto_id, sku, variante, precio, costo,
       moneda, cantidad, updated_at)
    values
      (p_linea_id, j_tenant, p_sucursal_id, v_maestro, nullif(p_sku, ''),
       nullif(p_variante, ''), p_precio, p_costo, p_moneda, p_cantidad,
       coalesce(p_created_at, now()))
    on conflict do nothing;

    if exists (select 1 from public.stock_tienda where id = p_linea_id) then
      v_linea := p_linea_id;
    else
      select id into v_linea
        from public.stock_tienda
       where tenant_id = j_tenant
         and coalesce(sucursal_id, j_tenant) = coalesce(p_sucursal_id, j_tenant)
         and producto_id = v_maestro
         and coalesce(sku, '') = coalesce(p_sku, '')
         and coalesce(variante, '') = coalesce(p_variante, '');
    end if;
  end if;

  if v_linea is null then
    raise exception 'No se pudo registrar la línea de stock';
  end if;

  return v_linea;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC registrar_ajuste — entrada / salida manual de stock (idempotente)
--    El movimiento es el marcador: si ya existe, no se vuelve a tocar el stock.
-- ---------------------------------------------------------------------------
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
  p_created_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_delta integer;
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

  return jsonb_build_object('movimiento_id', p_movimiento_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Permisos: solo sesión autenticada con tenant válido (validado dentro de
--    cada RPC por tenant_id_activo()); nadie anónimo ejecuta esto.
-- ---------------------------------------------------------------------------
revoke all on function public.registrar_venta(uuid, uuid, numeric, jsonb, jsonb, text, timestamptz) from public;
revoke all on function public.registrar_producto(uuid, text, text, text, text, uuid, uuid, text, text, numeric, numeric, text, integer, timestamptz) from public;
revoke all on function public.registrar_ajuste(uuid, uuid, uuid, text, integer, text, text, text, text, timestamptz) from public;

grant execute on function public.registrar_venta(uuid, uuid, numeric, jsonb, jsonb, text, timestamptz) to authenticated;
grant execute on function public.registrar_producto(uuid, text, text, text, text, uuid, uuid, text, text, numeric, numeric, text, integer, timestamptz) to authenticated;
grant execute on function public.registrar_ajuste(uuid, uuid, uuid, text, integer, text, text, text, text, timestamptz) to authenticated;