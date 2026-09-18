-- =============================================================================
-- Kahabox — Migración: trabajos de impresión (estación de impresión)
--
-- La PC (caja) no imprime: deja un trabajo en esta tabla y el celular/tablet
-- que actúa de "estación de impresión" (app Android con servicio en primer
-- plano) lo toma, lo manda al puerto de la impresora (Bluetooth SPP) y marca
-- el resultado.
--
-- El payload ya viene como ESC/POS en base64 para que la estación no tenga que
-- reconstruir nada: solo decodifica y escribe bytes.
--
-- El "claim" es atómico (FOR UPDATE SKIP LOCKED): si hay más de una estación,
-- cada trabajo lo toma una sola y nadie imprime dos veces.
-- =============================================================================

create table public.trabajos_impresion (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  sucursal_id uuid references public.sucursales (id) on delete set null,
  estacion_id text,
  ancho       integer not null default 32,
  payload     text not null,
  estado      text not null default 'pendiente'
              check (estado in ('pendiente', 'imprimiendo', 'impreso', 'error')),
  intentos    integer not null default 0,
  error       text,
  creado_por  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  impreso_en  timestamptz
);

create index trabajos_impresion_pendientes_idx
  on public.trabajos_impresion (tenant_id, estado, created_at);

create trigger trabajos_impresion_tenant before insert on public.trabajos_impresion
  for each row execute function public.set_tenant_id_from_jwt();

alter table public.trabajos_impresion enable row level security;

create policy trabajos_impresion_isolation on public.trabajos_impresion
  using (tenant_id = public.tenant_id_activo())
  with check (tenant_id = public.tenant_id_activo());

grant select, insert, update on public.trabajos_impresion to authenticated;

-- Realtime: la estación escucha los trabajos nuevos de su comercio.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'trabajos_impresion'
  ) then
    alter publication supabase_realtime add table public.trabajos_impresion;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- RPC tomar_trabajo_impresion — reclama el trabajo pendiente más viejo.
-- Devuelve null si no hay nada pendiente.
-- ---------------------------------------------------------------------------
create or replace function public.tomar_trabajo_impresion(
  p_estacion text,
  p_sucursal uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_id uuid;
  v_trabajo public.trabajos_impresion;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  select id into v_id
    from public.trabajos_impresion
   where tenant_id = j_tenant
     and estado = 'pendiente'
     and (sucursal_id is null or p_sucursal is null or sucursal_id = p_sucursal)
   order by created_at
   limit 1
   for update skip locked;

  if v_id is null then
    return null;
  end if;

  update public.trabajos_impresion
     set estado = 'imprimiendo',
         estacion_id = nullif(p_estacion, ''),
         intentos = intentos + 1
   where id = v_id
   returning * into v_trabajo;

  return jsonb_build_object(
    'id', v_trabajo.id,
    'ancho', v_trabajo.ancho,
    'payload', v_trabajo.payload,
    'intentos', v_trabajo.intentos
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC finalizar_trabajo_impresion — marca impreso o error (y reintenta).
-- ---------------------------------------------------------------------------
create or replace function public.finalizar_trabajo_impresion(
  p_id uuid,
  p_ok boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  j_tenant uuid;
  v_estado text;
  v_intentos integer;
begin
  j_tenant := public.tenant_id_activo();
  if j_tenant is null then
    raise exception 'Sesión inválida o sin comercio asignado';
  end if;

  select intentos into v_intentos
    from public.trabajos_impresion
   where id = p_id and tenant_id = j_tenant;

  if not found then
    raise exception 'El trabajo no pertenece a tu comercio';
  end if;

  if p_ok then
    v_estado := 'impreso';
  elsif v_intentos >= 3 then
    v_estado := 'error';
  else
    -- Se devuelve a la cola para reintentar (la estación hace backoff).
    v_estado := 'pendiente';
  end if;

  update public.trabajos_impresion
     set estado = v_estado,
         error = case when p_ok then null else nullif(p_error, '') end,
         impreso_en = case when p_ok then now() else impreso_en end
   where id = p_id
     and tenant_id = j_tenant;

  return jsonb_build_object('id', p_id, 'estado', v_estado);
end;
$$;

revoke all on function public.tomar_trabajo_impresion(text, uuid) from public;
revoke all on function public.finalizar_trabajo_impresion(uuid, boolean, text) from public;

grant execute on function public.tomar_trabajo_impresion(text, uuid) to authenticated;
grant execute on function public.finalizar_trabajo_impresion(uuid, boolean, text) to authenticated;
