-- =============================================================================
-- Kahabox — Migración: el guard de sucursal bloqueada mataba todas las ventas
--
-- sucursal_rechazar_bloqueada() leía `new.sucursal_id` directo y se ató como
-- trigger a cuatro tablas: ventas, venta_items, stock_tienda y stock_movimientos.
-- Tres de esas tablas tienen la columna; venta_items nunca la tuvo (se crea en
-- 20260915010000_initial.sql con id, venta_id, stock_tienda_id, tenant_id,
-- cantidad y precio_unitario, y ninguna migración posterior le agrega
-- sucursal_id).
--
-- En plpgsql `new.sucursal_id` sobre una tabla sin esa columna no devuelve NULL:
-- es un error en tiempo de ejecución ("record "new" has no field "sucursal_id"",
-- SQLSTATE P0002). Como registrar_venta inserta en venta_items dentro de la
-- misma transacción que la venta, TODAS las ventas morían ahí y el RPC devolvía
-- HTTP 400 sin dejar nada grabado: el frontend veía un 400 sin mensaje útil.
--
-- El arreglo es leer el campo a través de to_jsonb(new), que devuelve NULL
-- cuando la tabla no lo tiene, en vez de asumir que existe.
--
-- venta_items queda sin guard propio, y eso no deja un hueco: los ítems son
-- hijos de una venta, y esa venta padre ya pasa por este mismo guard sobre
-- public.ventas en la misma transacción. Si la sucursal está bloqueada la venta
-- no llega a existir, así que sus ítens tampoco.
--
-- create or replace alcanza: los cuatro triggers ya atados pasan a apuntar al
-- cuerpo nuevo, así que no hace falta recrearlos.
-- =============================================================================
create or replace function public.sucursal_rechazar_bloqueada()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_sucursal uuid;
begin
  v_sucursal := nullif(to_jsonb(new) ->> 'sucursal_id', '')::uuid;

  if v_sucursal is not null and public.sucursal_bloqueada(v_sucursal) then
    raise exception 'Esta sucursal esta bloqueada: su subscripcion vencio. Renovala con el administrador.';
  end if;

  return new;
end;
$$;
