-- =============================================================================
-- Kahabox — Migración: valida que los pagos cubran el total de registrar_venta
--
-- registrar_venta sumaba los pagos pero nunca los contrastaba con p_total:
-- un cliente con bug o una llamada manipulada podía registrar una venta
-- sin cobrar nada, ensuciando caja y reportes.
--
-- Ahora, antes de insertar, suma el monto de cada pago EN GUARANÍES y lo
-- compara contra p_total. Reglas:
--   * Solo se valida si TODOS los pagos vienen en PYG; si hay USD/otra
--     moneda falta la cotización para comparar y se saltea (el cliente ya
--     lo resuelve convirtiendo a PYG).
--   * Se permite que los pagos SUPEREEN el total (así se registra el vuelto);
--     solo se rechaza que queden por debajo con más de 1 Gs de tolerancia.
--   * "fiado" entra como un pago más que cubre el saldo, así que no rompe
--     nada: la venta a crédito registra su venta_pagos de fiado.
-- =============================================================================

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
  v_total_pagos numeric := 0;
  v_pagos_validable boolean := true;
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

  -- Cobertura de pagos: solo válida si todos vienen en guaraníes.
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    if v_pago ? 'monto'
       and coalesce(v_pago->>'moneda', 'PYG') = 'PYG' then
      v_total_pagos := v_total_pagos + (v_pago->>'monto')::numeric;
    else
      v_pagos_validable := false;
    end if;
  end loop;

  if v_pagos_validable and v_total_pagos < p_total - 1 then
    raise exception
      'Los pagos no cubren el total de la venta (total: % — pagos: %)',
      p_total, v_total_pagos;
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

revoke all on function public.registrar_venta(uuid, uuid, numeric, jsonb, jsonb, text, timestamptz, text) from public;
grant execute on function public.registrar_venta(uuid, uuid, numeric, jsonb, jsonb, text, timestamptz, text) to authenticated;