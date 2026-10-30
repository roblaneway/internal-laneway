-- Laneway Education — Staff & Student Portal
-- Core schema, helper functions, triggers and row-level security.
--
-- Runs on any Postgres 15+. The API server connects as the database owner and,
-- for every request, switches to the unprivileged role `laneway_app` and sets
-- `app.user_id` for the signed-in user, so the RLS policies below decide access.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;

-- The role every API request runs as. Roles are cluster-wide, so it may already exist.
do $$
begin
  if not exists (select from pg_roles where rolname = 'laneway_app') then
    create role laneway_app nologin;
  end if;
end;
$$;
-- Lets the owner `set role laneway_app`.
grant laneway_app to current_user;

-- The signed-in user for the current transaction (null when signed out).
create or replace function app.user_id()
returns uuid
language sql stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'trainer', 'student');
create type public.delivery_mode as enum ('on-campus', 'online');
create type public.shift_status as enum ('scheduled', 'covered', 'cancelled');
create type public.announcement_audience as enum ('all', 'course', 'class');
create type public.plan_status as enum ('draft', 'ready', 'delivered');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  email text not null,
  role public.user_role not null default 'student',
  avatar_url text,
  created_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

-- Password hashes live outside the public schema; laneway_app has no access to
-- this table and only reaches it through app.authenticate() and app.create_user().
create table app.credentials (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- trainer_id (lead trainer) and start_date (week 1 of term) are additions to the
-- brief: they define a trainer's "own classes" and map week_number to dates.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete restrict,
  name text not null,
  room text,
  delivery_mode public.delivery_mode not null default 'on-campus',
  term text not null,
  start_date date not null,
  trainer_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index classes_course_id_idx on public.classes (course_id);
create index classes_trainer_id_idx on public.classes (trainer_id);

create table public.class_enrolments (
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index class_enrolments_student_id_idx on public.class_enrolments (student_id);

-- needs_cover is an addition: a shift flagged as needing cover keeps status
-- 'scheduled' until a cover trainer is assigned, at which point it becomes 'covered'.
create table public.roster_shifts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  status public.shift_status not null default 'scheduled',
  needs_cover boolean not null default false,
  cover_trainer_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint roster_shifts_time_order check (end_time > start_time),
  constraint roster_shifts_cover_differs check (cover_trainer_id is null or cover_trainer_id <> trainer_id)
);
create index roster_shifts_date_idx on public.roster_shifts (date);
create index roster_shifts_trainer_idx on public.roster_shifts (trainer_id, date);
create index roster_shifts_cover_idx on public.roster_shifts (cover_trainer_id, date);
create index roster_shifts_class_idx on public.roster_shifts (class_id, date);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  audience public.announcement_audience not null default 'all',
  target_id uuid,
  author_id uuid references public.profiles (id) on delete set null default app.user_id(),
  pinned boolean not null default false,
  published_at timestamptz default now(),
  created_at timestamptz not null default now(),
  constraint announcements_target check (
    (audience = 'all' and target_id is null) or (audience <> 'all' and target_id is not null)
  )
);
create index announcements_published_idx on public.announcements (published_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.content_plans (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  week_number int not null check (week_number between 1 and 12),
  unit_code text,
  topic text not null default '',
  learning_outcomes text,
  resources_url text,
  assessment_due boolean not null default false,
  status public.plan_status not null default 'draft',
  updated_at timestamptz not null default now(),
  unique (class_id, week_number)
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = app.user_id()
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = app.user_id()), false)
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select role in ('admin', 'trainer') from public.profiles where id = app.user_id()), false)
$$;

-- A trainer "teaches" a class if they are its lead trainer or hold a live shift for it.
create or replace function public.teaches_class(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.classes c where c.id = p_class_id and c.trainer_id = app.user_id()
  ) or exists (
    select 1 from public.roster_shifts s
    where s.class_id = p_class_id
      and s.status <> 'cancelled'
      and (s.trainer_id = app.user_id() or s.cover_trainer_id = app.user_id())
  )
$$;

create or replace function public.teaches_course(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.classes c where c.course_id = p_course_id and public.teaches_class(c.id)
  )
$$;

create or replace function public.enrolled_in_class(p_class_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.class_enrolments e where e.class_id = p_class_id and e.student_id = app.user_id()
  )
$$;

create or replace function public.enrolled_in_course(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.class_enrolments e
    join public.classes c on c.id = e.class_id
    where c.course_id = p_course_id and e.student_id = app.user_id()
  )
$$;

-- Students who would receive an announcement with this audience/target.
create or replace function public.announcement_recipients(
  p_audience public.announcement_audience,
  p_target_id uuid
)
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.id from public.profiles p
  where p.role = 'student'
    and (
      p_audience = 'all'
      or (p_audience = 'class' and exists (
        select 1 from public.class_enrolments e where e.class_id = p_target_id and e.student_id = p.id))
      or (p_audience = 'course' and exists (
        select 1 from public.class_enrolments e
        join public.classes c on c.id = e.class_id
        where c.course_id = p_target_id and e.student_id = p.id))
    )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Only admins may change a role or email; users may edit their own name/avatar.
-- Sessions with no app.user_id (migrations, seed, psql) are trusted.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if app.user_id() is not null and not public.is_admin()
     and (new.role is distinct from old.role or new.email is distinct from old.email) then
    raise exception 'Only an admin can change a role or email' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Block overlapping shifts for the trainer actually delivering them.
-- The person on a shift is the cover trainer if assigned, otherwise the rostered trainer.
create or replace function public.check_shift_overlap()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_person uuid := coalesce(new.cover_trainer_id, new.trainer_id);
  v_clash record;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  select s.id, s.start_time, s.end_time, c.name as class_name
    into v_clash
  from public.roster_shifts s
  join public.classes c on c.id = s.class_id
  where s.id <> new.id
    and s.date = new.date
    and s.status <> 'cancelled'
    and coalesce(s.cover_trainer_id, s.trainer_id) = v_person
    and s.start_time < new.end_time
    and new.start_time < s.end_time
  limit 1;

  if found then
    raise exception 'Shift overlaps % (% – %) for the same trainer',
      v_clash.class_name, to_char(v_clash.start_time, 'HH24:MI'), to_char(v_clash.end_time, 'HH24:MI')
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger roster_shifts_no_overlap
  before insert or update on public.roster_shifts
  for each row execute function public.check_shift_overlap();

-- Keep status consistent with cover assignment.
create or replace function public.sync_shift_cover_status()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status <> 'cancelled' then
    if new.cover_trainer_id is not null then
      new.status := 'covered';
      new.needs_cover := false;
    elsif new.status = 'covered' then
      new.status := 'scheduled';
    end if;
  end if;
  return new;
end;
$$;

-- Runs before the overlap check (triggers fire alphabetically).
create trigger roster_shifts_a_sync_cover
  before insert or update on public.roster_shifts
  for each row execute function public.sync_shift_cover_status();

-- Publishing an announcement notifies every targeted student exactly once.
create or replace function public.notify_announcement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.published_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.published_at is not null then
    return new;
  end if;

  insert into public.notifications (user_id, title, body, link)
  select r, 'New announcement: ' || new.title,
         left(regexp_replace(new.body, '<[^>]+>', ' ', 'g'), 200),
         '/announcements/' || new.id
  from public.announcement_recipients(new.audience, new.target_id) as r;
  return new;
end;
$$;

create trigger announcements_notify
  after insert or update of published_at on public.announcements
  for each row execute function public.notify_announcement();

-- Deleting an announcement removes the notifications that point at it.
create or replace function public.cleanup_announcement_notifications()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.notifications where link = '/announcements/' || old.id;
  return old;
end;
$$;

create trigger announcements_cleanup_notifications
  after delete on public.announcements
  for each row execute function public.cleanup_announcement_notifications();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger content_plans_touch
  before update on public.content_plans
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- A trainer flags (or un-flags) their own shift as needing cover.
create or replace function public.request_cover(p_shift_id uuid, p_needs_cover boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.roster_shifts
     set needs_cover = p_needs_cover
   where id = p_shift_id
     and status = 'scheduled'
     and (trainer_id = app.user_id() or public.is_admin());
  if not found then
    raise exception 'Shift not found or not yours' using errcode = '42501';
  end if;
end;
$$;

-- Existing overlapping shifts (e.g. imported before the overlap check existed).
create or replace function public.roster_conflicts(p_from date, p_to date)
returns table (shift_id uuid, other_shift_id uuid, trainer_id uuid, date date)
language sql stable security invoker set search_path = ''
as $$
  select a.id, b.id, coalesce(a.cover_trainer_id, a.trainer_id), a.date
  from public.roster_shifts a
  join public.roster_shifts b
    on a.date = b.date
   and a.id <> b.id
   and coalesce(a.cover_trainer_id, a.trainer_id) = coalesce(b.cover_trainer_id, b.trainer_id)
   and a.start_time < b.end_time and b.start_time < a.end_time
  where a.date between p_from and p_to
    and a.status <> 'cancelled' and b.status <> 'cancelled'
$$;

-- Copy all 12 weeks from one class into another. Runs as the caller, so RLS
-- decides whether they may read the source and write the target.
create or replace function public.duplicate_content_plan(p_source_class uuid, p_target_class uuid)
returns int
language plpgsql security invoker set search_path = ''
as $$
declare
  v_count int;
begin
  if p_source_class = p_target_class then
    raise exception 'Choose a different class to copy from';
  end if;

  insert into public.content_plans
    (class_id, week_number, unit_code, topic, learning_outcomes, resources_url, assessment_due, status)
  select p_target_class, week_number, unit_code, topic, learning_outcomes, resources_url, assessment_due, 'draft'
  from public.content_plans
  where class_id = p_source_class
  on conflict (class_id, week_number) do update
    set unit_code = excluded.unit_code,
        topic = excluded.topic,
        learning_outcomes = excluded.learning_outcomes,
        resources_url = excluded.resources_url,
        assessment_due = excluded.assessment_due,
        status = 'draft';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

-- Returns the user id for a valid email and password, otherwise null.
create or replace function app.authenticate(p_email text, p_password text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select c.user_id
  from app.credentials c
  join public.profiles p on p.id = c.user_id
  where lower(p.email) = lower(trim(p_email))
    and c.password_hash = extensions.crypt(p_password, c.password_hash)
$$;

-- Admin-only: create a profile with a password.
create or replace function app.create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role public.user_role
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters' using errcode = '22023';
  end if;

  insert into public.profiles (email, full_name, role)
  values (lower(trim(p_email)), trim(p_full_name), p_role)
  returning id into v_id;
  insert into app.credentials (user_id, password_hash)
  values (v_id, extensions.crypt(p_password, extensions.gen_salt('bf', 10)));
  return v_id;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language sql security invoker set search_path = ''
as $$
  update public.notifications set read_at = now()
  where user_id = app.user_id() and read_at is null
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.classes enable row level security;
alter table public.class_enrolments enable row level security;
alter table public.roster_shifts enable row level security;
alter table public.announcements enable row level security;
alter table public.notifications enable row level security;
alter table public.content_plans enable row level security;

-- Restrictive: whatever else a policy allows, a signed-out request sees nothing.
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'courses', 'classes', 'class_enrolments', 'roster_shifts',
                           'announcements', 'notifications', 'content_plans'] loop
    execute format(
      'create policy "signed in only" on public.%I as restrictive for all to laneway_app
         using (app.user_id() is not null) with check (app.user_id() is not null)', t);
  end loop;
end;
$$;

-- profiles: staff see everyone; students see themselves and staff (trainer/author names).
create policy "profiles: read" on public.profiles for select to laneway_app
  using (id = app.user_id() or public.is_staff() or role in ('admin', 'trainer'));
create policy "profiles: update self" on public.profiles for update to laneway_app
  using (id = app.user_id()) with check (id = app.user_id());
create policy "profiles: admin update" on public.profiles for update to laneway_app
  using (public.is_admin()) with check (public.is_admin());
create policy "profiles: admin delete" on public.profiles for delete to laneway_app
  using (public.is_admin());

-- courses: readable by all signed-in users, managed by admins.
create policy "courses: read" on public.courses for select to laneway_app using (true);
create policy "courses: admin write" on public.courses for all to laneway_app
  using (public.is_admin()) with check (public.is_admin());

-- classes: staff see all; students see classes they are enrolled in.
create policy "classes: read" on public.classes for select to laneway_app
  using (public.is_staff() or public.enrolled_in_class(id));
create policy "classes: admin write" on public.classes for all to laneway_app
  using (public.is_admin()) with check (public.is_admin());

-- enrolments: admins all, trainers for their classes, students their own.
create policy "enrolments: read" on public.class_enrolments for select to laneway_app
  using (public.is_admin() or student_id = app.user_id() or public.teaches_class(class_id));
create policy "enrolments: admin write" on public.class_enrolments for all to laneway_app
  using (public.is_admin()) with check (public.is_admin());

-- roster: admins all; trainers their own and covered shifts; students their classes' sessions.
create policy "shifts: read" on public.roster_shifts for select to laneway_app
  using (
    public.is_admin()
    or trainer_id = app.user_id()
    or cover_trainer_id = app.user_id()
    or public.enrolled_in_class(class_id)
  );
create policy "shifts: admin write" on public.roster_shifts for all to laneway_app
  using (public.is_admin()) with check (public.is_admin());

-- announcements: visible when published and targeted at you; authors and admins see drafts.
create policy "announcements: read" on public.announcements for select to laneway_app
  using (
    public.is_admin()
    or author_id = app.user_id()
    or (
      published_at is not null and published_at <= now()
      and (
        audience = 'all'
        or (audience = 'class' and (public.enrolled_in_class(target_id) or public.teaches_class(target_id)))
        or (audience = 'course' and (public.enrolled_in_course(target_id) or public.teaches_course(target_id)))
      )
    )
  );
create policy "announcements: admin write" on public.announcements for all to laneway_app
  using (public.is_admin()) with check (public.is_admin());
create policy "announcements: trainer insert" on public.announcements for insert to laneway_app
  with check (
    public.my_role() = 'trainer' and author_id = app.user_id()
    and audience = 'class' and public.teaches_class(target_id)
  );
create policy "announcements: trainer update" on public.announcements for update to laneway_app
  using (public.my_role() = 'trainer' and author_id = app.user_id())
  with check (author_id = app.user_id() and audience = 'class' and public.teaches_class(target_id));
create policy "announcements: trainer delete" on public.announcements for delete to laneway_app
  using (public.my_role() = 'trainer' and author_id = app.user_id());

-- notifications: private to their owner. Inserts only happen via the trigger.
create policy "notifications: read own" on public.notifications for select to laneway_app
  using (user_id = app.user_id());
create policy "notifications: update own" on public.notifications for update to laneway_app
  using (user_id = app.user_id()) with check (user_id = app.user_id());
create policy "notifications: delete own" on public.notifications for delete to laneway_app
  using (user_id = app.user_id());

-- content plans: staff read all (to compare and duplicate); students read non-draft
-- weeks for their classes; admins and the class's trainers write.
create policy "plans: read" on public.content_plans for select to laneway_app
  using (public.is_staff() or (status <> 'draft' and public.enrolled_in_class(class_id)));
create policy "plans: write" on public.content_plans for all to laneway_app
  using (public.is_admin() or public.teaches_class(class_id))
  with check (public.is_admin() or public.teaches_class(class_id));

-- ---------------------------------------------------------------------------
-- Privileges for the API role (RLS then filters rows)
-- ---------------------------------------------------------------------------
revoke create on schema public from public;
grant usage on schema public, app to laneway_app;
grant select, insert, update, delete on all tables in schema public to laneway_app;
-- Users may only mark their notifications read; inserts happen via triggers.
revoke insert, update on public.notifications from laneway_app;
grant update (read_at) on public.notifications to laneway_app;

revoke execute on all functions in schema public, app from public;
grant execute on all functions in schema public to laneway_app;
grant execute on function app.user_id(), app.authenticate(text, text),
  app.create_user(text, text, text, public.user_role) to laneway_app;
-- Internal to the notification trigger; would otherwise expose student ids.
revoke execute on function public.announcement_recipients(public.announcement_audience, uuid) from laneway_app;

-- ---------------------------------------------------------------------------
-- Realtime: the API server LISTENs on this channel and pushes events to the
-- matching user over server-sent events.
-- ---------------------------------------------------------------------------
create or replace function public.broadcast_notifications()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_notify('notifications', json_build_object(
      'type', 'INSERT', 'user_id', n.user_id, 'id', n.id, 'title', n.title, 'body', left(n.body, 300)
    )::text)
    from new_rows n;
  elsif tg_op = 'UPDATE' then
    perform pg_notify('notifications', json_build_object('type', 'UPDATE', 'user_id', u.user_id)::text)
    from (select distinct user_id from new_rows) u;
  else
    perform pg_notify('notifications', json_build_object('type', 'DELETE', 'user_id', u.user_id)::text)
    from (select distinct user_id from old_rows) u;
  end if;
  return null;
end;
$$;

create trigger notifications_broadcast_insert
  after insert on public.notifications referencing new table as new_rows
  for each statement execute function public.broadcast_notifications();
create trigger notifications_broadcast_update
  after update on public.notifications referencing new table as new_rows
  for each statement execute function public.broadcast_notifications();
create trigger notifications_broadcast_delete
  after delete on public.notifications referencing old table as old_rows
  for each statement execute function public.broadcast_notifications();
