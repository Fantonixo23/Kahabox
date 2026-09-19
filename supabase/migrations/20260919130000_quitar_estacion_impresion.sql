-- =============================================================================
-- Kahabox — Migración: se retira la estación de impresión
--
-- La impresión ahora es directa por Bluetooth desde el mismo celular/tablet
-- (método 'bluetooth'); la PC usa el diálogo del navegador. Se elimina la
-- tabla de trabajos, sus RPCs y la publicación Realtime asociada.
-- =============================================================================

-- RPCs de la estación (los grants se eliminan junto con la función).
drop function if exists public.tomar_trabajo_impresion(text, uuid);
drop function if exists public.finalizar_trabajo_impresion(uuid, boolean, text);

-- Realtime: la estación ya no escucha trabajos nuevos.
do $$
begin
  if exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'trabajos_impresion'
  ) then
    alter publication supabase_realtime drop table public.trabajos_impresion;
  end if;
end
$$;

-- La tabla (con su trigger, índice y policies) se elimina en cascada.
drop table if exists public.trabajos_impresion;