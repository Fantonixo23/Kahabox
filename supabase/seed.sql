-- Kahabox — Seed local (se aplica con `supabase db reset`, corre como service role)
-- Datos de ejemplo para desarrollo de la Fase 0.

-- Tenant demo
insert into public.tenants (id, nombre_comercial, estado, plan)
values
  ('11111111-1111-1111-1111-111111111111', 'Kahabox Demo', 'activo', 'pro')
on conflict (id) do nothing;

-- Sucursal principal del tenant demo
insert into public.sucursales (id, tenant_id, nombre, direccion)
values
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'Sucursal principal', 'Microcentro, Ciudad del Este')
on conflict (id) do nothing;

-- Catálogo maestro compartido (sin tenant_id)
insert into public.productos_maestro (id, codigo_barras, nombre, marca, categoria, creado_por_tenant_id)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '7731111111111', 'Auriculares Bluetooth', 'Genérica', 'electrónica', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '7732222222222', 'Cargador USB-C 20W', 'Genérica', 'electrónica', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'Remera básica', 'Básica', 'indumentaria', '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

-- Stock del tenant demo (con variante, moneda PYG y USD, y bloqueado por índice único)
insert into public.stock_tienda
  (id, tenant_id, sucursal_id, producto_id, sku, variante, precio, costo, moneda, cantidad)
values
  ('dddddddd-dddd-dddd-dddd-ddddddddddd0', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Negro',  250000, 180000, 'PYG', 12),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'Blanco', 250000, 180000, 'PYG', 8),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd2', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, null,      50000,  35000,  'PYG', 40),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd3', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'M',      90000,  60000,  'PYG', 0),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', null, 'L',      20,     12,     'USD', 5)
on conflict (id) do nothing;

-- Venta demo confirmada (2 items)
insert into public.ventas (id, tenant_id, sucursal_id, vendedor_id, total, estado)
values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', null, 350000, 'confirmada')
on conflict (id) do nothing;

insert into public.venta_items (id, venta_id, stock_tienda_id, tenant_id, cantidad, precio_unitario)
values
  ('ffffffff-ffff-ffff-ffff-fffffffffff1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-ddddddddddd0', '11111111-1111-1111-1111-111111111111', 1, 250000),
  ('ffffffff-ffff-ffff-ffff-fffffffffff2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-ddddddddddd2', '11111111-1111-1111-1111-111111111111', 2, 50000)
on conflict (id) do nothing;