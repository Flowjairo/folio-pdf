-- Folio PDF · suscripción con Wompi y límite de usos gratis.
-- Se ejecuta una vez en Supabase → SQL Editor. Es idempotente: se puede volver a correr.
--
-- Reglas:
--   · 3 operaciones gratis al día por cuenta (día de Colombia, America/Bogota).
--   · Con plan activo (mensual o anual) las operaciones son ilimitadas.
--   · El navegador solo puede LEER sus propias filas. Escribir solo lo hacen
--     las funciones de abajo (security definer) o las Edge Functions con service_role.

-- ---------- tablas ----------
create table if not exists public.suscripciones (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  plan        text not null check (plan in ('mensual', 'anual')),
  vence       timestamptz not null,
  actualizado timestamptz not null default now()
);

create table if not exists public.pagos (
  referencia      text primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  plan            text not null check (plan in ('mensual', 'anual')),
  monto_centavos  bigint not null check (monto_centavos > 0),
  estado          text not null default 'PENDIENTE',
  transaccion_id  text unique,
  metodo          text,
  aplicado        boolean not null default false,
  creado          timestamptz not null default now(),
  actualizado     timestamptz not null default now()
);
create index if not exists pagos_user_idx on public.pagos (user_id, creado desc);

create table if not exists public.usos_diarios (
  user_id uuid not null references auth.users (id) on delete cascade,
  dia     date not null,
  usos    integer not null default 0 check (usos >= 0),
  primary key (user_id, dia)
);

-- ---------- seguridad por filas ----------
alter table public.suscripciones enable row level security;
alter table public.pagos         enable row level security;
alter table public.usos_diarios  enable row level security;

drop policy if exists "ver mi suscripcion" on public.suscripciones;
create policy "ver mi suscripcion" on public.suscripciones
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "ver mis pagos" on public.pagos;
create policy "ver mis pagos" on public.pagos
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "ver mis usos" on public.usos_diarios;
create policy "ver mis usos" on public.usos_diarios
  for select to authenticated using (user_id = (select auth.uid()));

-- Sin políticas de insert/update/delete: el navegador no puede escribir en estas tablas.
revoke insert, update, delete on public.suscripciones, public.pagos, public.usos_diarios from anon, authenticated;

-- ---------- constantes ----------
create or replace function public.folio_limite_gratis() returns integer
  language sql immutable as $$ select 3 $$;

-- ---------- estado del plan (lo lee la página) ----------
create or replace function public.estado_plan()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  hoy  date := (now() at time zone 'America/Bogota')::date;
  s    public.suscripciones%rowtype;
  u    integer;
begin
  if uid is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '28000';
  end if;
  select * into s from public.suscripciones where user_id = uid;
  select usos into u from public.usos_diarios where user_id = uid and dia = hoy;
  return json_build_object(
    'activo',   coalesce(s.vence > now(), false),
    'plan',     case when s.vence > now() then s.plan end,
    'vence',    s.vence,
    'usos_hoy', coalesce(u, 0),
    'limite',   public.folio_limite_gratis()
  );
end;
$$;

-- ---------- registrar una operación ----------
-- Devuelve ok=false cuando la cuenta gratis ya usó sus operaciones de hoy.
create or replace function public.registrar_uso()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  hoy    date := (now() at time zone 'America/Bogota')::date;
  lim    integer := public.folio_limite_gratis();
  activo boolean;
  u      integer;
begin
  if uid is null then
    raise exception 'Necesitas iniciar sesión' using errcode = '28000';
  end if;

  select vence > now() into activo from public.suscripciones where user_id = uid;
  if coalesce(activo, false) then
    return json_build_object('ok', true, 'ilimitado', true);
  end if;

  insert into public.usos_diarios as d (user_id, dia, usos)
  values (uid, hoy, 1)
  on conflict (user_id, dia) do update
    set usos = d.usos + 1
    where d.usos < lim
  returning usos into u;

  if u is null then
    return json_build_object('ok', false, 'usos_hoy', lim, 'limite', lim, 'restantes', 0);
  end if;
  return json_build_object('ok', true, 'usos_hoy', u, 'limite', lim, 'restantes', lim - u);
end;
$$;

-- ---------- aplicar un pago confirmado por Wompi ----------
-- Solo la llaman las Edge Functions (service_role). Es segura si llega dos veces:
-- el plan se extiende una sola vez por referencia (columna aplicado).
create or replace function public.aplicar_pago(
  p_referencia   text,
  p_transaccion  text,
  p_estado       text,
  p_monto        bigint,
  p_moneda       text,
  p_metodo       text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  p        public.pagos%rowtype;
  periodo  interval;
  nuevo    timestamptz;
begin
  select * into p from public.pagos where referencia = p_referencia for update;
  if not found then
    return json_build_object('ok', false, 'motivo', 'referencia desconocida');
  end if;

  if p.transaccion_id is not null and p_transaccion is not null and p.transaccion_id <> p_transaccion then
    return json_build_object('ok', false, 'motivo', 'transacción distinta para la misma referencia');
  end if;

  update public.pagos
     set estado = p_estado,
         transaccion_id = coalesce(transaccion_id, p_transaccion),
         metodo = coalesce(p_metodo, metodo),
         actualizado = now()
   where referencia = p_referencia;

  if p_estado <> 'APPROVED' or p.aplicado then
    return json_build_object('ok', true, 'aplicado', p.aplicado, 'estado', p_estado);
  end if;

  -- El monto y la moneda deben coincidir con lo que se cobró.
  if p_monto is distinct from p.monto_centavos or p_moneda is distinct from 'COP' then
    update public.pagos set estado = 'MONTO_INCORRECTO', actualizado = now() where referencia = p_referencia;
    return json_build_object('ok', false, 'motivo', 'monto o moneda no coinciden');
  end if;

  periodo := case p.plan when 'anual' then interval '1 year' else interval '1 month' end;

  insert into public.suscripciones as s (user_id, plan, vence)
  values (p.user_id, p.plan, now() + periodo)
  on conflict (user_id) do update
    set plan = excluded.plan,
        vence = greatest(s.vence, now()) + periodo,
        actualizado = now()
  returning vence into nuevo;

  update public.pagos set aplicado = true, actualizado = now() where referencia = p_referencia;
  return json_build_object('ok', true, 'aplicado', true, 'vence', nuevo, 'plan', p.plan);
end;
$$;

-- ---------- permisos de las funciones ----------
revoke all on function public.estado_plan()   from public, anon;
revoke all on function public.registrar_uso() from public, anon;
grant execute on function public.estado_plan()   to authenticated;
grant execute on function public.registrar_uso() to authenticated;

revoke all on function public.aplicar_pago(text, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.aplicar_pago(text, text, text, bigint, text, text) to service_role;
