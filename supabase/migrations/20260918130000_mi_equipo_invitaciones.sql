-- =============================================================================
-- Kahabox — Migración 0018: Mi equipo — invitaciones por magic link + roles
--
-- El dueño invita empleados desde "Mi equipo" (nombre + rol) y recibe un link
-- de invitación. El invitado lo abre, pone email + contraseña y queda
-- "pendiente de confirmación" hasta que el dueño lo confirme en la app.
--
-- Cambios:
--   1. usuarios_tenant: rol pasa a ('dueño','administrador','vendedor') y se
--      agregan `estado` ('activo','pendiente','rechazado') y `nombre`.
--   2. Nueva tabla `invitaciones` (token único, expiración, rol objetivo).
--   3. RLS de usuarios_tenant: SOLO el dueño puede insertar/actualizar/borrar
--      (antes cualquier miembro del tenant podía — un vendedor se podía
--      auto-promover). El SELECT sigue siendo para todo el tenant.
--   4. El rol administrador lee la vista de costo (como el dueño) y la
--      auditoría.
--   5. alta_tenant_al_registrarse: NO crea tenant si el alta viene de una
--      invitación (el usu_metadata lleva invitacion='true').
--   6. RPCs del módulo equipo: crear_invitacion, obtener_invitacion (público),
--      listar_miembros, confirmar_miembro, rechazar_miembro,
--      set_rol_miembro, quitar_miembro, mi_estado_equipo.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1). usuarios_tenant: rol + estado + nombre
-- ---------------------------------------------------------------------------
alter table public.usuarios_tenant
  drop constraint usuarios_tenant_rol_check;

alter table public.usuarios_tenant
  add constraint usuarios_tenant_rol_check
  check (rol in ('dueño', 'administrador', 'vendedor'));

alter table public.usuarios_tenant
  add column estado text not null default 'activo'
  check (estado in ('activo', 'pendiente', 'rechazado'));

alter table public.usuarios_tenant
  add column nombre text;

comment on column public.usuarios_tenant.estado
  is 'Miembro confirmado por el dueño. Los invitados nacen "pendiente" y solo acceden a la app al confirmarlos.';
comment on column public.usuarios_tenant.nombre
  is 'Nombre mostrado del integrante (del invitado o copia del user_metadata al confirmar).';

-- ---------------------------------------------------------------------------
-- 2). Tabla invitaciones
-- ---------------------------------------------------------------------------
create table public.invitaciones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  empresa_nombre text not null,
  nombre_invitado text not null,
  rol            text not null check (rol in ('administrador', 'vendedor')),
  token          text not null unique,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'registrado', 'cancelada')),
  creado_por     uuid references auth.users (id) on delete set null,
  expira_at      timestamptz not null default now() + interval '7 days',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on public.invitaciones (tenant_id);
create index on public.invitaciones (estado);

create trigger invitaciones_touch
  before update on public.invitaciones
  for each row execute function public.set_updated_at();

create trigger invitaciones_tenant before insert on public.invitaciones
  for each row execute function public.set_tenant_id_from_jwt();

comment on table public.invitaciones
  is 'Links de invitación que genera el dueño. El token viaja en la URL /unirme?invitacion=...';

-- ---------------------------------------------------------------------------
-- 3). RLS
-- ---------------------------------------------------------------------------
-- usuarios_tenant: lectura para el tenant; escritura SOLO dueño.
drop policy if exists usuarios_tenant_isolation on public.usuarios_tenant;

create policy usuarios_tenant_select on public.usuarios_tenant
  for select
  to authenticated
  using (tenant_id = public.tenant_id_activo());

create policy usuarios_tenant_insert_dueno on public.usuarios_tenant
  for insert
  to authenticated
  with check (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') = 'dueño'
  );

create policy usuarios_tenant_update_dueno on public.usuarios_tenant
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

create policy usuarios_tenant_delete_dueno on public.usuarios_tenant
  for delete
  to authenticated
  using (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') = 'dueño'
  );

-- invitaciones: administración completa solo para el dueño.
-- La lectura pública del dato de bienvenida va por la RPC obtener_invitacion.
alter table public.invitaciones enable row level security;

create policy invitaciones_dueno on public.invitaciones
  for all
  to authenticated
  using (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') = 'dueño'
  )
  with check (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') = 'dueño'
  );

-- ---------------------------------------------------------------------------
-- 4). Rol administrador: vista de costo + auditoría
-- ---------------------------------------------------------------------------
drop view if exists public.stock_tienda_dueno;

create or replace view public.stock_tienda_dueno
with (security_invoker = true) as
  select id, tenant_id, sucursal_id, producto_id, sku, variante, precio, costo,
         moneda, cantidad, updated_at
  from public.stock_tienda
  where tenant_id = public.tenant_id_activo()
    and public.rol_activo() in ('dueño', 'administrador');

grant select on public.stock_tienda_dueno to authenticated;

-- Auditoría: la leen dueño y administrador; el rol snapshot admite administrador.
alter table public.auditoria
  drop constraint auditoria_rol_check;

alter table public.auditoria
  add constraint auditoria_rol_check
  check (rol in ('dueño', 'administrador', 'vendedor'));

drop policy if exists "auditoria_lectura_dueno" on public.auditoria;
create policy "auditoria_lectura_jefes" on public.auditoria
  for select
  to authenticated
  using (
    tenant_id = public.tenant_id_activo()
    and coalesce(public.rol_activo(), '') in ('dueño', 'administrador')
  );

-- ---------------------------------------------------------------------------
-- 5). Trigger de registro: saltear si el alta viene de una invitación
-- ---------------------------------------------------------------------------
create or replace function public.alta_tenant_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tenant_id uuid;
  sucursal_id uuid;
  nombre_tienda text;
begin
  -- Alta por invitación: el usuario ya tiene tenant (lo creó la Edge Function
  -- unirse-invitacion). No corresponde crear otro tenant ni sucursal.
  if coalesce(new.raw_user_meta_data ->> 'invitacion', '') = 'true' then
    return new;
  end if;

  -- Nombre de la tienda viene en user_metadata (llegó del form de registro).
  nombre_tienda := nullif(new.raw_user_meta_data ->> 'nombre_tienda', '');

  -- 1) Tenant nuevo: queda 'pendiente' hasta que el superadmin lo apruebe.
  insert into public.tenants (nombre_comercial, estado, plan, email_contacto)
  values (coalesce(nombre_tienda, 'Mi tienda'), 'pendiente', 'piloto', new.email)
  returning id into tenant_id;

  -- 2) Sucursal principal (regla del modelo: 1 tenant arranca con 1 sucursal).
  insert into public.sucursales (tenant_id, nombre, direccion)
  values (tenant_id, 'Sucursal principal', null)
  returning id into sucursal_id;

  -- 3) El usuario es el dueño.
  insert into public.usuarios_tenant (user_id, tenant_id, rol)
  values (new.id, tenant_id, 'dueño');

  -- 4) Claims en app_metadata → el próximo JWT trae tenant_id, rol y sucursal_id.
  update auth.users
  set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'tenant_id', tenant_id::text,
        'rol', 'dueño',
        'sucursal_id', sucursal_id::text
      )
  where id = new.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6). RPCs del módulo equipo
-- ---------------------------------------------------------------------------

-- Crea la invitación y devuelve el token para armar el link.
create or replace function public.crear_invitacion(
  p_nombre text,
  p_rol text
) returns table (id uuid, token text, expira_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_empresa text;
  v_rol text := p_rol;
begin
  if v_tenant is null then
    raise exception 'Sesión sin tenant.';
  end if;
  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede invitar integrantes.';
  end if;
  if nullif(btrim(coalesce(p_nombre, '')), '') is null then
    raise exception 'Ingresá el nombre del invitado.';
  end if;
  if v_rol not in ('administrador', 'vendedor') then
    raise exception 'Rol inválido.';
  end if;

  select nombre_comercial into v_empresa
  from public.tenants
  where id = v_tenant;

  return query
  insert into public.invitaciones (
    tenant_id, empresa_nombre, nombre_invitado, rol, token, creado_por
  )
  values (
    v_tenant,
    coalesce(v_empresa, 'Mi tienda'),
    btrim(p_nombre),
    v_rol,
    encode(gen_random_bytes(24), 'hex'),
    auth.uid()
  )
  returning public.invitaciones.id, public.invitaciones.token,
            public.invitaciones.expira_at;
end;
$$;

grant execute on function public.crear_invitacion(text, text) to authenticated;

-- Datos públicos de la invitación para la página de bienvenida (pre-login).
create or replace function public.obtener_invitacion(p_token text)
returns table (
  valida boolean,
  estado text,
  empresa_nombre text,
  nombre_invitado text,
  rol text,
  expira_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (inv.estado = 'pendiente' and inv.expira_at > now()) as valida,
    inv.estado,
    inv.empresa_nombre,
    inv.nombre_invitado,
    inv.rol,
    inv.expira_at
  from public.invitaciones inv
  where inv.token = p_token;
$$;

grant execute on function public.obtener_invitacion(text) to anon, authenticated;

-- Integrantes del tenant con email y nombre legible (solo dueño).
create or replace function public.listar_miembros()
returns table (
  id uuid,
  user_id uuid,
  tenant_id uuid,
  rol text,
  estado text,
  nombre text,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede ver el equipo.';
  end if;

  return query
  select ut.id, ut.user_id, ut.tenant_id, ut.rol, ut.estado, ut.nombre,
         u.email, ut.created_at
  from public.usuarios_tenant ut
  left join auth.users u on u.id = ut.user_id
  where ut.tenant_id = public.tenant_id_activo()
  order by ut.created_at desc;
end;
$$;

grant execute on function public.listar_miembros() to authenticated;

-- Confirma al invitado: lo habilita y le carga los claims (tenant, rol, sucursal).
create or replace function public.confirmar_miembro(p_miembro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_row public.usuarios_tenant%rowtype;
  v_sucursal uuid;
begin
  if v_tenant is null or coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede confirmar integrantes.';
  end if;

  select * into v_row
  from public.usuarios_tenant
  where id = p_miembro_id and tenant_id = v_tenant;

  if not found then
    raise exception 'El integrante no pertenece a esta tienda.';
  end if;
  if v_row.rol = 'dueño' then
    raise exception 'El dueño ya está confirmado.';
  end if;
  if v_row.estado = 'activo' then
    return;
  end if;

  update public.usuarios_tenant
  set estado = 'activo',
      nombre = coalesce(nullif(btrim(nombre), ''), 'Miembro')
  where id = p_miembro_id;

  -- La sucursal del tenant con una sola local (caso piloto); si hay varias, se
  -- carga la primera y la asignación fina queda para otra fase.
  select id into v_sucursal
  from public.sucursales
  where tenant_id = v_tenant
  order by created_at
  limit 1;

  update auth.users
  set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'tenant_id', v_tenant::text,
        'rol', v_row.rol,
        'sucursal_id', v_sucursal::text
      )
  where id = v_row.user_id;
end;
$$;

grant execute on function public.confirmar_miembro(uuid) to authenticated;

-- Rechaza al invitado (no entra a la app aunque ya se haya registrado).
create or replace function public.rechazar_miembro(p_miembro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_row public.usuarios_tenant%rowtype;
begin
  if v_tenant is null or coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede rechazar integrantes.';
  end if;

  select * into v_row
  from public.usuarios_tenant
  where id = p_miembro_id and tenant_id = v_tenant;

  if not found then
    raise exception 'El integrante no pertenece a esta tienda.';
  end if;

  update public.usuarios_tenant
  set estado = 'rechazado'
  where id = p_miembro_id;
end;
$$;

grant execute on function public.rechazar_miembro(uuid) to authenticated;

-- Cambia el rol de un integrante (dueño no se toca) y actualiza el claim.
create or replace function public.set_rol_miembro(p_miembro_id uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_row public.usuarios_tenant%rowtype;
begin
  if v_tenant is null or coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede cambiar roles.';
  end if;
  if p_rol not in ('administrador', 'vendedor') then
    raise exception 'Rol inválido.';
  end if;

  select * into v_row
  from public.usuarios_tenant
  where id = p_miembro_id and tenant_id = v_tenant;

  if not found then
    raise exception 'El integrante no pertenece a esta tienda.';
  end if;
  if v_row.rol = 'dueño' then
    raise exception 'No se puede cambiar el rol del dueño.';
  end if;

  update public.usuarios_tenant
  set rol = p_rol
  where id = p_miembro_id;

  update auth.users
  set raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('rol', p_rol)
  where id = v_row.user_id;
end;
$$;

grant execute on function public.set_rol_miembro(uuid, text) to authenticated;

-- Quita al integrante y le revoca los claims (pierde el acceso en el próximo JWT).
create or replace function public.quitar_miembro(p_miembro_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.tenant_id_activo();
  v_row public.usuarios_tenant%rowtype;
begin
  if v_tenant is null or coalesce(public.rol_activo(), '') <> 'dueño' then
    raise exception 'Solo el dueño puede quitar integrantes.';
  end if;

  select * into v_row
  from public.usuarios_tenant
  where id = p_miembro_id and tenant_id = v_tenant;

  if not found then
    return;
  end if;
  if v_row.rol = 'dueño' then
    raise exception 'El dueño no puede quitarse a sí mismo.';
  end if;

  delete from public.usuarios_tenant
  where id = p_miembro_id;

  update auth.users
  set raw_app_meta_data =
      raw_app_meta_data - 'tenant_id' - 'rol' - 'sucursal_id'
  where id = v_row.user_id;
end;
$$;

grant execute on function public.quitar_miembro(uuid) to authenticated;

-- Estado del usuario logueado como miembro (para bloquear pendientes/rechazados).
create or replace function public.mi_estado_equipo()
returns table (estado text)
language sql
stable
security definer
set search_path = public
as $$
  select ut.estado
  from public.usuarios_tenant ut
  where ut.user_id = auth.uid()
  order by ut.created_at desc
  limit 1;
$$;

grant execute on function public.mi_estado_equipo() to authenticated;

-- Backfill: nombre de los miembros existentes (demo real) con el user_metadata.
update public.usuarios_tenant ut
set nombre = coalesce(
  nullif(btrim(u.raw_user_meta_data ->> 'nombre'), ''),
  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
  nullif(btrim(u.raw_user_meta_data ->> 'nombre_tienda'), ''),
  u.email
)
from auth.users u
where u.id = ut.user_id
  and ut.nombre is null;