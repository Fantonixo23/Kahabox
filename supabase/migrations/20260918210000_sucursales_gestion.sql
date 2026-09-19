-- =============================================================================
-- Kahabox — Migración 0021: gestión de sucursales (módulo /app/sucursales)
--
-- Hasta ahora la policy `sucursales_isolation` era `for all`, así que cualquier
-- miembro del tenant podía crear/editar/borrar sucursales. Se separa:
--   * lectura: todo el tenant
--   * escritura: SOLO el dueño
-- Además:
--   * columna telefono (alinea con el modelo del front)
--   * máximo 3 sucursales por tienda (trigger)
--   * RPCs crear_sucursal / actualizar_sucursal / eliminar_sucursal con guardas
--   * backfill: filas con sucursal_id NULL pasan a la primera sucursal del tenant
-- =============================================================================

alter table public.sucursales add column if not exists telefono text;

comment on column public.sucursales.telefono
  is 'Teléfono de contacto de la sucursal (opcional).';

-- ---------------------------------------------------------------------------
-- Máximo 3 sucursales por tenant
-- ---------------------------------------------------------------------------
create or replace function public.sucursales_max_tres()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.sucursales
    where tenant_id = new.tenant_id
  ) >= 3 then
    raise exception 'Máximo 3 sucursales por tienda.';
  end if;
  return new;
end;
$$;

-- El nombre arranca con "sucursales_tenant..." para correr DESPUÉS del trigger
-- `sucursales_tenant` (Postgres dispara en orden alfabético y ese completa
-- tenant_id desde el JWT).
drop trigger if exists sucursales_max on public.sucursales;
drop trigger if exists sucursales_tenant_max on public.sucursales;
create trigger sucursales_tenant_max before insert on public.sucursales
  for each row execute function public.sucursales_max_tres();

-- ---------------------------------------------------------------------------
-- RLS: lectura para el tenant, escritura solo dueño
-- ---------------------------------------------------------------------------
drop policy if exists sucursales_isolation on public.sucursales;

drop policy if exists sucursales_select on public.sucursales;
create policy sucursales_select on public.sucursales
  for select
  to authenticated
  using (tenant_id = public.tenant_id_activo());

drop policy if exists sucursales_insert_dueno on public.sucursales;
create policy sucursales_insert_dueno on public.sucursales
  for insert
  to authenticated
  with check (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') = 'dueño'
  );

drop policy if exists sucursales_update_dueno on public.sucursales;
create policy sucursales_update_dueno on public.sucursales
  for update
  to authenticated
  using (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') = 'dueño'
  )
  with check (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') = 'dueño'
  );

drop policy if exists sucursales_delete_dueno on public.sucursales;
create policy sucursales_delete_dueno on public.sucursales
  for delete
  to authenticated
  using (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') = 'dueño'
  );

-- ---------------------------------------------------------------------------
-- RPCs del módulo
-- ---------------------------------------------------------------------------
create or replace function public.crear_sucursal(
  p_nombre text,
  p_direccion text default null,
  p_telefono text default null
)
returns table (id uuid, nombre text, direccion text, telefono text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_total integer;
begin
  if v_tenant is null then
    raise exception 'Sesión sin tienda.';
  end if;
  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede crear sucursales.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Ingresá el nombre de la sucursal.';
  end if;

  select count(*) into v_total
  from public.sucursales
  where tenant_id = v_tenant;

  if v_total >= 3 then
    raise exception 'Máximo 3 sucursales por tienda.';
  end if;

  return query
  insert into public.sucursales (tenant_id, nombre, direccion, telefono)
  values (
    v_tenant,
    btrim(p_nombre),
    nullif(btrim(coalesce(p_direccion, '')), ''),
    nullif(btrim(coalesce(p_telefono, '')), '')
  )
  returning public.sucursales.id, public.sucursales.nombre,
            public.sucursales.direccion, public.sucursales.telefono;
end;
$$;

grant execute on function public.crear_sucursal(text, text, text) to authenticated;

create or replace function public.actualizar_sucursal(
  p_id uuid,
  p_nombre text,
  p_direccion text default null,
  p_telefono text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
begin
  if v_tenant is null or coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede editar sucursales.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Ingresá el nombre de la sucursal.';
  end if;

  update public.sucursales
  set nombre = btrim(p_nombre),
      direccion = nullif(btrim(coalesce(p_direccion, '')), ''),
      telefono = nullif(btrim(coalesce(p_telefono, '')), '')
  where id = p_id and tenant_id = v_tenant;

  if not found then
    raise exception 'La sucursal no existe.';
  end if;
end;
$$;

grant execute on function public.actualizar_sucursal(uuid, text, text, text) to authenticated;

create or replace function public.eliminar_sucursal(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_total integer;
begin
  if v_tenant is null or coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede eliminar sucursales.';
  end if;

  select count(*) into v_total
  from public.sucursales
  where tenant_id = v_tenant;

  if v_total <= 1 then
    raise exception 'No podés eliminar la única sucursal.';
  end if;

  if exists (select 1 from public.stock_tienda where sucursal_id = p_id)
     or exists (select 1 from public.ventas where sucursal_id = p_id)
     or exists (select 1 from public.usuarios_tenant where sucursal_id = p_id)
     or exists (select 1 from public.stock_movimientos where sucursal_id = p_id) then
    raise exception 'La sucursal tiene stock, ventas o integrantes. Reasignalos o movelos antes de eliminarla.';
  end if;

  delete from public.sucursales where id = p_id and tenant_id = v_tenant;

  if not found then
    raise exception 'La sucursal no existe.';
  end if;
end;
$$;

grant execute on function public.eliminar_sucursal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: sucursal_id NULL → primera sucursal del tenant (idempotente)
-- ---------------------------------------------------------------------------
with primeras as (
  select tenant_id, (array_agg(id order by created_at, id))[1] as id
  from public.sucursales
  group by tenant_id
)
update public.stock_tienda s
set sucursal_id = p.id
from primeras p
where s.tenant_id = p.tenant_id
  and s.sucursal_id is null
  and not exists (
    select 1
    from public.stock_tienda d
    where d.tenant_id = s.tenant_id
      and d.sucursal_id = p.id
      and d.producto_id = s.producto_id
      and coalesce(d.sku, '') = coalesce(s.sku, '')
      and coalesce(d.variante, '') = coalesce(s.variante, '')
  );

with primeras as (
  select tenant_id, (array_agg(id order by created_at, id))[1] as id
  from public.sucursales
  group by tenant_id
)
update public.ventas v
set sucursal_id = p.id
from primeras p
where v.tenant_id = p.tenant_id
  and v.sucursal_id is null;

with primeras as (
  select tenant_id, (array_agg(id order by created_at, id))[1] as id
  from public.sucursales
  group by tenant_id
)
update public.stock_movimientos m
set sucursal_id = p.id
from primeras p
where m.tenant_id = p.tenant_id
  and m.sucursal_id is null;

with primeras as (
  select tenant_id, (array_agg(id order by created_at, id))[1] as id
  from public.sucursales
  group by tenant_id
)
update public.trabajos_impresion t
set sucursal_id = p.id
from primeras p
where t.tenant_id = p.tenant_id
  and t.sucursal_id is null;

with primeras as (
  select tenant_id, (array_agg(id order by created_at, id))[1] as id
  from public.sucursales
  group by tenant_id
)
update public.auditoria a
set sucursal_id = p.id
from primeras p
where a.tenant_id = p.tenant_id
  and a.sucursal_id is null;
