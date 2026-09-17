-- =============================================================================
-- Kahabox — Migración: corrige el orden del chequeo de idempotencia en
-- registrar_venta.
--
-- Bug en 20260916120000_offline_first.sql: el chequeo "¿ya existía?" se hacía
-- DESPUÉS del `insert ... on conflict (id) do nothing`, así que la fila
-- siempre existía en ese punto (recién insertada o ya presente de antes) y la
-- función cortaba devolviendo `ya_existia: true` en absolutamente todos los
-- casos — nunca se llegaba a descontar stock, ni a insertar venta_items o
-- venta_pagos, ni siquiera en la primera confirmación real de una venta.
--
-- Esta versión mueve el chequeo a ANTES del insert (mismo patrón ya usado
-- correctamente en registrar_ajuste), para que solo los reintentos genuinos
-- corten temprano.
-- =============================================================================

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

  -- Reintento genuino: la venta ya se había registrado en un intento previo
  -- (por ej. la cola offline la subió y un corte de red hizo reintentar). No
  -- se repiten items, descuentos de stock ni pagos.
  if exists (select 1 from public.ventas where id = p_venta_id and tenant_id = j_tenant) then
    return jsonb_build_object('venta_id', p_venta_id, 'ya_existia', true);
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