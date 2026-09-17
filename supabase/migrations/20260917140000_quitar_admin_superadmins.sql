-- =============================================================================
-- Kahabox — Migración: quita la consola de admin/superadmins
-- La aprobación pasa a hacerse directo desde Discord (edge function
-- aprobar-registro con links firmados → service role), así que el andamiaje
-- de superadmins y la página /app/admin ya no se usan.
-- Se mantienen: email_contacto, CHECK con 'pendiente'/'rechazado', el trigger
-- nuevo (con claim sucursal_id) y las policies RLS originales de tenants.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Quitar policies que dependen de es_superadmin()
-- ---------------------------------------------------------------------------
drop policy if exists tenants_admin_select on public.tenants;
drop policy if exists tenants_admin_update on public.tenants;

-- ---------------------------------------------------------------------------
-- 2) Quitar superadmins + helper
-- ---------------------------------------------------------------------------
drop policy if exists superadmins_own on public.superadmins;
drop table if exists public.superadmins;
drop function if exists public.es_superadmin();