-- Kahabox — Migración 0019: alta de invitado 100% SQL (sin Edge Function).
--
-- Reemplaza el rol de la Edge Function `unirse-invitacion` (que nunca se
-- desplegó) por triggers sobre `auth.users`, y registra al invitado con el
-- `signUp` del cliente (clave ANON, pública). Así no hace falta Supabase CLI.
--
-- Flujo:
--   1. El invitado llena el form en /unirme?invitacion=<token>.
--   2. El front llama `auth.signUp({ email, password, options.data:
--      { invitacion: <token>, nombre } })`.
--   3. validar_token_invitacion (BEFORE INSERT) valida el token; si no es
--      válido (inexistente / vencido / ya usado) aborta el alta.
--   4. alta_tenant_al_registrarse (AFTER INSERT) salta porque el usuario ya
--      "viene de invitación" y no hay que crear un tenant nuevo.
--   5. registrar_invitado (AFTER INSERT) vincula al usuario en usuarios_tenant
--      con estado 'pendiente' y marca la invitación como 'registrado'.

-- ---------------------------------------------------------------------------
-- 1. alta_tenant_al_registrarse: antes saltaba solo con invitacion='true';
--    ahora salta con CUALQUIER token en user_metadata.invitacion.
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
  -- Alta por invitación: el usuario ya tiene tenant (usuarios_tenant 'pendiente'
  -- que crea registrar_invitado). No corresponde crear otro tenant ni sucursal.
  if new.raw_user_meta_data ->> 'invitacion' is not null then
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
-- 2. validar_token_invitacion: aborta el signUp si el token no es válido.
--    Corremos como superadmin (security definer) ANTES del insert para poder
--    leer public.invitaciones sin depender del RLS del request anónimo.
-- ---------------------------------------------------------------------------
create or replace function public.validar_token_invitacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(new.raw_user_meta_data ->> 'invitacion', '');
begin
  if v_token is null then
    return new;
  end if;

  if not exists (
    select 1 from public.invitaciones i
     where i.token = v_token
       and i.estado = 'pendiente'
       and i.expira_at > now()
  ) then
    raise exception 'INVITACION_NO_VALIDA';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. registrar_invitado: vincula al usuario en usuarios_tenant (pendiente) y
--    marca la invitación como 'registrado'. Debe correr DESPUÉS del insert en
--    auth.users (necesita new.id).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_invitado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(new.raw_user_meta_data ->> 'invitacion', '');
  v_inv public.invitaciones;
  v_nombre text;
begin
  if v_token is null then
    return new;
  end if;

  select i.* into v_inv
    from public.invitaciones i
   where i.token = v_token
     and i.estado = 'pendiente'
     and i.expira_at > now();

  if not found then
    return new;
  end if;

  v_nombre := coalesce(
    nullif(new.raw_user_meta_data ->> 'nombre', ''),
    v_inv.nombre_invitado
  );

  -- Claims de acceso SOLO tras confirmar. Acá el usuario queda en "espera":
  -- no tiene tenant_id en el JWT y el gate de la app lo bloquea hasta que el
  -- dueño llame confirmar_miembro.
  insert into public.usuarios_tenant (user_id, tenant_id, rol, estado, nombre)
  values (new.id, v_inv.tenant_id, v_inv.rol, 'pendiente', v_nombre);

  -- El link ya no se puede volver a usar; el user_metadata queda para el
  -- "¡Bienvenido, <nombre>!" de la pantalla de confirmación.
  update public.invitaciones i
     set estado = 'registrado'
   where i.id = v_inv.id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Triggers sobre auth.users
-- ---------------------------------------------------------------------------
drop trigger if exists validar_token_invitacion_tg on auth.users;
create trigger validar_token_invitacion_tg
  before insert on auth.users
  for each row execute function public.validar_token_invitacion();

drop trigger if exists registrar_invitado_tg on auth.users;
create trigger registrar_invitado_tg
  after insert on auth.users
  for each row execute function public.registrar_invitado();