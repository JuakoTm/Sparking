-- ============================================================
-- S-Parking - Esquema inicial Supabase (greenfield)
-- Archivo: supabase/schema.sql
-- ============================================================

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null default 'user' check (role in ('admin', 'operator', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parking_zones (
  id text primary key,
  name text not null,
  sort_order int not null default 999,
  description text not null default '',
  color text not null default 'blue',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parking_spots (
  id text primary key,
  lat double precision null,
  lng double precision null,
  description text not null default '',
  zone_id text null references public.parking_zones(id) on delete set null,
  status smallint not null check (status in (0,1,2)),
  reservation_license_plate text null,
  reservation_expires_at timestamptz null,
  reservation_duration_min int null,
  last_changed timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.occupancy_history (
  hour_key text primary key,
  ts bigint not null,
  snapshot_at timestamptz not null,
  global jsonb not null,
  zones jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.spot_events (
  id uuid primary key default gen_random_uuid(),
  spot_id text not null references public.parking_spots(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_spots_zone on public.parking_spots(zone_id);
create index if not exists idx_spots_status on public.parking_spots(status);
create index if not exists idx_spots_last_changed on public.parking_spots(last_changed);
create index if not exists idx_spots_res_exp on public.parking_spots(reservation_expires_at);
create index if not exists idx_hist_ts on public.occupancy_history(ts);
create index if not exists idx_events_spot on public.spot_events(spot_id);
create index if not exists idx_events_created on public.spot_events(created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_zones_updated_at on public.parking_zones;
create trigger trg_zones_updated_at
before update on public.parking_zones
for each row execute function public.set_updated_at();

drop trigger if exists trg_spots_updated_at on public.parking_spots;
create trigger trg_spots_updated_at
before update on public.parking_spots
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.cleanup_expired_reservations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  update public.parking_spots
  set status = 1,
      reservation_license_plate = null,
      reservation_expires_at = null,
      reservation_duration_min = null,
      last_changed = now(),
      updated_at = now()
  where status = 2
    and reservation_expires_at is not null
    and reservation_expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.reserve_spot(
  p_spot_id text,
  p_license_plate text,
  p_duration_minutes int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spot public.parking_spots%rowtype;
  v_expires_at timestamptz;
begin
  if p_spot_id is null or trim(p_spot_id) = '' then
    raise exception 'Falta spot_id';
  end if;
  if p_license_plate is null or trim(p_license_plate) = '' then
    raise exception 'Falta license_plate';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'duration_minutes invalido';
  end if;

  select * into v_spot
  from public.parking_spots
  where id = upper(trim(p_spot_id))
  for update;

  if not found then
    raise exception 'El puesto no existe';
  end if;

  if v_spot.status = 0 then
    raise exception 'El puesto esta ocupado por un vehiculo';
  end if;

  if v_spot.status = 2 then
    raise exception 'El puesto ya tiene una reserva activa';
  end if;

  v_expires_at := now() + make_interval(mins => p_duration_minutes);

  update public.parking_spots
  set status = 2,
      reservation_license_plate = upper(trim(p_license_plate)),
      reservation_expires_at = v_expires_at,
      reservation_duration_min = p_duration_minutes,
      last_changed = now(),
      updated_at = now()
  where id = upper(trim(p_spot_id));

  insert into public.spot_events (spot_id, event_type, payload)
  values (upper(trim(p_spot_id)), 'reserve', jsonb_build_object(
    'license_plate', upper(trim(p_license_plate)),
    'duration_minutes', p_duration_minutes,
    'expires_at', v_expires_at
  ));

  return jsonb_build_object(
    'success', true,
    'spot_id', upper(trim(p_spot_id)),
    'expires_at', v_expires_at
  );
end;
$$;

create or replace function public.release_spot(
  p_spot_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spot public.parking_spots%rowtype;
begin
  if p_spot_id is null or trim(p_spot_id) = '' then
    raise exception 'Falta spot_id';
  end if;

  select * into v_spot
  from public.parking_spots
  where id = upper(trim(p_spot_id))
  for update;

  if not found then
    raise exception 'El puesto no existe';
  end if;

  if v_spot.status <> 2 then
    raise exception 'El puesto no tiene una reserva activa para cancelar';
  end if;

  update public.parking_spots
  set status = 1,
      reservation_license_plate = null,
      reservation_expires_at = null,
      reservation_duration_min = null,
      last_changed = now(),
      updated_at = now()
  where id = upper(trim(p_spot_id));

  insert into public.spot_events (spot_id, event_type, payload)
  values (upper(trim(p_spot_id)), 'release', '{}'::jsonb);

  return jsonb_build_object('success', true, 'spot_id', upper(trim(p_spot_id)));
end;
$$;

create or replace function public.ingest_spot_state(
  p_spot_id text,
  p_sensor_status int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spot public.parking_spots%rowtype;
  v_id text;
begin
  if p_spot_id is null or trim(p_spot_id) = '' then
    raise exception 'Falta spot_id';
  end if;
  if p_sensor_status is null or p_sensor_status not in (0,1) then
    raise exception 'status invalido (solo 0 o 1)';
  end if;

  v_id := upper(trim(p_spot_id));

  select * into v_spot
  from public.parking_spots
  where id = v_id
  for update;

  if not found then
    insert into public.parking_spots (id, status, description, last_changed)
    values (v_id, p_sensor_status, 'Creado por ingest', now());

    insert into public.spot_events (spot_id, event_type, payload)
    values (v_id, 'ingest_create', jsonb_build_object('status', p_sensor_status));

    return jsonb_build_object('success', true, 'message', 'Nuevo puesto creado');
  end if;

  if v_spot.status = 2 and p_sensor_status = 1 then
    return jsonb_build_object('success', true, 'message', 'Reserva protegida');
  end if;

  if v_spot.status = 2 and p_sensor_status = 0 then
    update public.parking_spots
    set status = 0,
        reservation_license_plate = null,
        reservation_expires_at = null,
        reservation_duration_min = null,
        last_changed = now(),
        updated_at = now()
    where id = v_id;

    insert into public.spot_events (spot_id, event_type, payload)
    values (v_id, 'ingest_reservation_completed', jsonb_build_object('status', 0));

    return jsonb_build_object('success', true, 'message', 'Reserva completada. Puesto ocupado');
  end if;

  if v_spot.status <> p_sensor_status then
    update public.parking_spots
    set status = p_sensor_status,
        last_changed = now(),
        updated_at = now()
    where id = v_id;

    insert into public.spot_events (spot_id, event_type, payload)
    values (v_id, 'ingest_update', jsonb_build_object('status', p_sensor_status));
  end if;

  return jsonb_build_object('success', true, 'message', 'Datos procesados');
end;
$$;

create or replace function public.save_hourly_snapshot(
  p_target timestamptz default date_trunc('hour', now())
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour_key text;
  v_ts bigint;
  v_global jsonb;
  v_zones jsonb;
  v_deleted int := 0;
begin
  v_hour_key := to_char(p_target at time zone 'UTC', 'YYYY-MM-DD-HH24');
  v_ts := floor(extract(epoch from p_target) * 1000)::bigint;

  with base as (
    select coalesce(zone_id, 'SinZona') as zone_id, status
    from public.parking_spots
  ),
  zone_counts as (
    select
      zone_id,
      count(*) filter (where status = 1) as free,
      count(*) filter (where status = 0) as occupied,
      count(*) filter (where status = 2) as reserved,
      count(*) as total
    from base
    group by zone_id
  )
  select coalesce(
    jsonb_object_agg(
      z.zone_id,
      jsonb_build_object(
        'free', z.free,
        'occupied', z.occupied,
        'reserved', z.reserved,
        'total', z.total,
        'occupancyPct',
          case when z.total > 0
               then least(100, greatest(0, round(((z.occupied + z.reserved)::numeric / z.total::numeric) * 100)))
               else 0 end
      )
    ),
    '{}'::jsonb
  ) into v_zones
  from zone_counts z;

  with g as (
    select
      count(*) filter (where status = 1) as free,
      count(*) filter (where status = 0) as occupied,
      count(*) filter (where status = 2) as reserved,
      count(*) as total
    from public.parking_spots
  )
  select jsonb_build_object(
    'free', g.free,
    'occupied', g.occupied,
    'reserved', g.reserved,
    'total', g.total,
    'occupancyPct',
      case when g.total > 0
           then least(100, greatest(0, round(((g.occupied + g.reserved)::numeric / g.total::numeric) * 100)))
           else 0 end
  ) into v_global
  from g;

  insert into public.occupancy_history (hour_key, ts, snapshot_at, global, zones)
  values (v_hour_key, v_ts, p_target, v_global, v_zones)
  on conflict (hour_key) do update
  set ts = excluded.ts,
      snapshot_at = excluded.snapshot_at,
      global = excluded.global,
      zones = excluded.zones;

  delete from public.occupancy_history
  where snapshot_at < now() - interval '30 days';

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'success', true,
    'hour_key', v_hour_key,
    'timestamp', p_target,
    'retention_deleted', v_deleted,
    'global', v_global
  );
end;
$$;

alter table public.profiles enable row level security;
alter table public.parking_zones enable row level security;
alter table public.parking_spots enable row level security;
alter table public.occupancy_history enable row level security;
alter table public.spot_events enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists zones_read_authenticated on public.parking_zones;
create policy zones_read_authenticated
on public.parking_zones
for select
to authenticated
using (true);

drop policy if exists zones_write_admin on public.parking_zones;
create policy zones_write_admin
on public.parking_zones
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists spots_read_authenticated on public.parking_spots;
create policy spots_read_authenticated
on public.parking_spots
for select
to authenticated
using (true);

drop policy if exists spots_write_admin on public.parking_spots;
create policy spots_write_admin
on public.parking_spots
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists history_read_authenticated on public.occupancy_history;
create policy history_read_authenticated
on public.occupancy_history
for select
to authenticated
using (true);

drop policy if exists events_read_admin on public.spot_events;
create policy events_read_admin
on public.spot_events
for select
to authenticated
using (public.is_admin());

grant usage on schema public to authenticated, anon;
grant select on public.parking_zones to authenticated;
grant select on public.parking_spots to authenticated;
grant select on public.occupancy_history to authenticated;

commit;

-- Programacion sugerida para trabajos recurrentes (ejecutar una sola vez):
-- select cron.schedule('sparking-cleanup-expired', '* * * * *', $$select public.cleanup_expired_reservations();$$);
-- select cron.schedule('sparking-hourly-snapshot', '0 * * * *', $$select public.save_hourly_snapshot(date_trunc('hour', now()));$$);
