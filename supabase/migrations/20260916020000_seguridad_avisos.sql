-- =============================================================================
-- Kahabox — Migración 0006: cierre de avisos de seguridad del dashboard
--  1. search_path fijo en set_updated_at() y tenant_id_activo() (Function Search
--     Path Mutable).
--  2. RLS de productos_maestro explícita (paridad con el remoto, que se activó
--     vía Studio; sin esto un `db reset` quedaba sin RLS en el catálogo).
--  3. Revocar EXECUTE de las funciones SECURITY DEFINER a public/anon/
--     authenticated y eliminar el helper rls_auto_enable (artefacto de Studio).
--  4. Bucket storage `productos` privado + lectura restringida por tenant (se
--     listaba sin auth porque el bucket era public).
--  5. Índices para todas las columnas de foreign key que faltaban.
-- =============================================================================

-- 1) search_path fijo ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.tenant_id_activo()
returns uuid
language sql
stable
set search_path = public
as $$
  select ( (select auth.jwt()) -> 'app_metadata' ->> 'tenant_id' )::uuid;
$$;

-- 2) RLS explícita del catálogo compartido -----------------------------------
alter table public.productos_maestro enable row level security;

-- 3) Funciones SECURITY DEFINER: solo para service_role ----------------------
revoke execute on function public.alta_tenant_al_registrarse() from public;
revoke execute on function public.alta_tenant_al_registrarse() from anon, authenticated;
grant execute on function public.alta_tenant_al_registrarse() to service_role;

-- Helper que crea Studio al "activar RLS" desde el panel. No lo consumimos y
-- es security definer ejecutable por cualquiera: se le quita el EXECUTE a
-- public/anon/authenticated. No se elimina porque el event trigger de Studio
-- `ensure_rls` depende de ella (el trigger corre internamente como postgres,
-- así que revocar EXECUTE no lo afecta).
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon, authenticated;

-- 4) Storage: bucket privado + lectura por tenant -----------------------------
-- El front aún no muestra fotos (foto_url está null en todo el mock). Cuando se
-- implemente la carga de fotos, se servirá con URLs firmadas (signed URLs).
update storage.buckets
set public = false
where id = 'productos';

drop policy if exists "productos_lectura_publica" on storage.objects;
drop policy if exists "productos_lectura_tenant" on storage.objects;

create policy "productos_lectura_tenant" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'productos'
    and (storage.foldername(name))[1] = public.tenant_id_activo()::text
  );

-- 5) Índices de foreign keys faltantes ---------------------------------------
create index if not exists productos_maestro_creado_por_idx
  on public.productos_maestro (creado_por_tenant_id);

create index if not exists ventas_sucursal_id_idx
  on public.ventas (sucursal_id);

create index if not exists venta_items_stock_tienda_id_idx
  on public.venta_items (stock_tienda_id);

create index if not exists proveedores_tenant_id_idx
  on public.proveedores (tenant_id);

create index if not exists pagos_proveedores_tenant_id_idx
  on public.pagos_proveedores (tenant_id);

create index if not exists pagos_proveedores_created_by_idx
  on public.pagos_proveedores (created_by);

create index if not exists stock_movimientos_ref_sucursal_id_idx
  on public.stock_movimientos (ref_sucursal_id);

create index if not exists stock_movimientos_created_by_idx
  on public.stock_movimientos (created_by);