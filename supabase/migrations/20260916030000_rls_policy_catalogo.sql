-- =============================================================================
-- Kahabox — Migración 0007: políticas del catálogo sin auth.<function>() por fila
-- El aviso del panel: "re-evaluates current_setting() or auth.<function>() for
-- each row". Solución: en vez de `using (auth.role() = 'authenticated')` (que se
-- reevalúa por fila), se restringe la política al rol de PostgREST con
-- `to authenticated` y `using (true)` / `with check (true)`. El catálogo es
-- compartido: cualquier usuario autenticado lo lee y puede aportar productos.
-- El rol anon no tiene política → no puede leer ni escribir (idéntico al
-- comportamiento anterior, sin el costo por fila).
-- =============================================================================

drop policy if exists productos_lectura on public.productos_maestro;
create policy productos_lectura on public.productos_maestro
  for select to authenticated
  using (true);

drop policy if exists productos_escritura on public.productos_maestro;
create policy productos_escritura on public.productos_maestro
  for insert to authenticated
  with check (true);