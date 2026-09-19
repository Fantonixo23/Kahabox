-- =============================================================================
-- Kahabox — Migración 0020: auto-confirmación del invitado
--
-- El empleado que se registra desde /unirme?invitacion=<token> NO tiene que
-- verificar su email: el token de invitación (creado por el dueño desde
-- Mi Equipo) ya es la validación de identidad.
--
-- Se mantiene activo el "Confirm email" del proyecto para el alta de DUEÑOS
-- (RegisterPage), que sí requiere verificar el correo.
--
-- registrar_invitado (AFTER INSERT sobre auth.users) marca email_confirmed_at:
-- así el invitado puede iniciar sesión al instante; queda 'pendiente' hasta que
-- el dueño lo confirme desde Mi Equipo (confirmar_miembro).
-- =============================================================================

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

  -- El usuario queda en "espera": sin tenant_id en el JWT hasta que el dueño
  -- llame confirmar_miembro (el gate de la app lo bloquea con "Pendiente").
  insert into public.usuarios_tenant (user_id, tenant_id, rol, estado, nombre)
  values (new.id, v_inv.tenant_id, v_inv.rol, 'pendiente', v_nombre);

  -- El link ya no se puede volver a usar; el user_metadata queda para el
  -- "¡Bienvenido, <nombre>!" de la pantalla de confirmación.
  update public.invitaciones i
     set estado = 'registrado'
   where i.id = v_inv.id;

  -- Auto-confirmado: el invitado NO toca ningún link de verificación.
  update auth.users
     set email_confirmed_at = now()
   where id = new.id;

  return new;
end;
$$;