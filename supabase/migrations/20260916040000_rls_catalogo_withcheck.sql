-- =============================================================================
-- Kahabox — Migración 0008: WITH CHECK real en productos_escritura
-- El panel marcaba `with check (true)` como bypass de RLS. El front inserta el
-- catálogo con creado_por_tenant_id NULL (el proveedor del producto no se
-- informa). La política exige ahora que, si se informa procedencia, sea el
-- tenant del propio usuario. Se evalúa una sola vez (subquery escalar), sin
-- costo por fila de current_setting/auth.<function>().
-- =============================================================================

drop policy if exists productos_escritura on public.productos_maestro;
create policy productos_escritura on public.productos_maestro
  for insert to authenticated
  with check (
    creado_por_tenant_id is null
    or creado_por_tenant_id = (select public.tenant_id_activo())
  );