-- Units of competency each course delivers in a term, and the term weeks they run.
-- Admins manage them; trainers read them (and get them as suggestions when planning).

create table public.course_units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  term text not null constraint course_units_term_check check (btrim(term) <> ''),
  code text not null constraint course_units_code_check check (btrim(code) <> ''),
  title text,
  start_week smallint constraint course_units_start_week_check check (start_week between 1 and 10),
  end_week smallint constraint course_units_end_week_check check (end_week between 1 and 10),
  notes text,
  resources_url text,
  created_at timestamptz not null default now(),
  constraint course_units_weeks_check check (end_week is null or start_week is null or end_week >= start_week),
  constraint course_units_unique unique (course_id, term, code)
);
create index course_units_term_idx on public.course_units (term);

alter table public.course_units enable row level security;

create policy "signed in only" on public.course_units as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);
create policy "course units: staff read" on public.course_units for select to laneway_app
  using (public.is_staff());
create policy "course units: admin write" on public.course_units for all to laneway_app
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.course_units to laneway_app;
