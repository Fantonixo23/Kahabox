-- =============================================================================
-- Kahabox - Migracion 0030: vencimiento y bloqueo por sucursal
--
-- Cada sucursal maneja su propia subscripcion:
--   * sucursales.vencimiento  = fecha limite (NULL = sin limite / prueba).
--   * sucursales.bloqueada    = bloqueo manual del administrador.
--   * Bloqueo efectivo = bloqueada OR (vencimiento <= ahora). El bloqueo por
--     vencimiento es AUTOMATICO: al llegar la fecha, la sucursal queda
--     bloqueada sin intervencion.
--
-- En la app del cliente, la sucursal activa bloqueada muestra el aviso de
-- subscripcion vencida y las RPC/triggers rechazan escrituras de esa sucursal.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1). Columnas en sucursales
-- ---------------------------------------------------------------------------
alter table public.sucursales
  add column vencimiento timestamptz;

alter table public.sucursales
  add column bloqueada boolean not null default false;

comment on column public.sucursales.vencimiento
  is 'Fecha limite de subscripcion de la sucursal. NULL = sin limite.';
comment on column public.sucursales.bloqueada
  is 'Bloqueo manual del administrador (independiente del vencimiento).';

-- ---------------------------------------------------------------------------
-- 2). Helper: sucursal bloqueada (manual o vencida)
-- ---------------------------------------------------------------------------
create or replace function public.sucursal_bloqueada(p_sucursal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sucursales s
    where s.id = p_sucursal_id
      and (
        s.bloqueada
        or (s.vencimiento is not null and s.vencimiento <= now())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3). Guard de escrituras de la sucursal (triggers)
--     Disparan para inserts/updates directos y para los que hacen las RPC
--     (security definer): si la sucursal esta bloqueada, no se graba nada.
-- ---------------------------------------------------------------------------
create or replace function public.sucursal_rechazar_bloqueada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sucursal_id is not null and public.sucursal_bloqueada(new.sucursal_id) then
    raise exception 'Esta sucursal esta bloqueada: su subscripcion vencio. Renovala con el administrador.';
  end if;
  return new;
end;
$$;

drop trigger if exists suc_guard_ventas on public.ventas;
drop trigger if exists suc_guard_venta_items on public.venta_items;
drop trigger if exists suc_guard_stock_tienda on public.stock_tienda;
drop trigger if exists suc_guard_stock_movs on public.stock_movimientos;
drop trigger if exists suc_guard_trabajos on public.trabajos_impresion;

create trigger suc_guard_ventas before insert or update on public.ventas
  for each row execute function public.sucursal_rechazar_bloqueada();
create trigger suc_guard_venta_items before insert or update on public.venta_items
  for each row execute function public.sucursal_rechazar_bloqueada();
create trigger suc_guard_stock_tienda before insert or update on public.stock_tienda
  for each row execute function public.sucursal_rechazar_bloqueada();
create trigger suc_guard_stock_movs before insert or update on public.stock_movimientos
  for each row execute function public.sucursal_rechazar_bloqueada();
create trigger suc_guard_trabajos before insert or update on public.trabajos_impresion
  for each row execute function public.sucursal_rechazar_bloqueada();

-- ---------------------------------------------------------------------------
-- 4). RPC de la consola de admin (por sucursal)
-- ---------------------------------------------------------------------------
create or replace function public.listar_sucursales_admin(p_tenant_id uuid)
returns table (
  id            uuid,
  nombre        text,
  vencimiento   timestamptz,
  bloqueada     boolean,
  dias_restantes integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador de Kahabox puede ver sucursales.';
  end if;

  return query
  select s.id, s.nombre, s.vencimiento, s.bloqueada,
         case
           when s.vencimiento is null then null
           else greatest(0, (s.vencimiento - now())::int)
         end
  from public.sucursales s
  where s.tenant_id = p_tenant_id
  order by s.created_at;
end;
$$;

grant execute on function public.listar_sucursales_admin(uuid) to authenticated;

create or replace function public.admin_cambiar_vencimiento_sucursal(
  p_id         uuid,
  p_vencimiento timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador de Kahabox puede cambiar vencimientos.';
  end if;

  update public.sucursales
  set vencimiento = p_vencimiento
  where id = p_id;

  if not found then
    raise exception 'La sucursal no existe.';
  end if;
end;
$$;

grant execute on function public.admin_cambiar_vencimiento_sucursal(uuid, timestamptz) to authenticated;

create or replace function public.admin_set_sucursal_bloqueada(
  p_id         uuid,
  p_bloqueada  boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el administrador de Kahabox puede bloquear sucursales.';
  end if;

  update public.sucursales
  set bloqueada = p_bloqueada
  where id = p_id;

  if not found then
    raise exception 'La sucursal no existe.';
  end if;
end;
$$;

grant execute on function public.admin_set_sucursal_bloqueada(uuid, boolean) to authenticated;