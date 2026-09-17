-- =============================================================================
-- Kahabox — Migración: valida el total de registrar_venta contra sus items
--
-- registrar_venta recibía p_total como parámetro suelto y lo grababa sin
-- contrastarlo con lo vendido: un bug del cliente o una llamada manipulada
-- podía guardar un total distinto del real, ensuciando reportes de caja.
--
-- Ahora, antes de insertar, suma el precio de cada ítem EN GUARANÍES
-- (precio_unitario_gs, campo que el cliente manda ya convertido) * cantidad
-- y compara contra p_total con una tolerancia de 1 Gs (absorbe el redondeo
-- final del total). Si algún ítem no trae precio_unitario_gs (cola vieja),
-- la validación se saltea para no romper esa operación pendiente.
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
  v_total_items numeric := 0;
  v_total_validable boolean := true;
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

  -- Validación del total ANTES de insertar nada: suma ítem por ítem su precio
  -- en guaraníes. Tolera 1 Gs de redondeo del total calculado en el cliente.
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