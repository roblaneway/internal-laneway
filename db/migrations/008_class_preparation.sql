-- Hours a trainer spends preparing a class in a term week, paid at their hourly rate
-- on the invoice for the fortnight that week starts in.

create table public.class_preparation (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default app.user_id() references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  week_number smallint not null constraint class_preparation_week_check check (week_number between 1 and 10),
  hours numeric(4, 2) not null constraint class_preparation_hours_check check (hours > 0 and hours <= 24),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_preparation_unique unique (trainer_id, class_id, week_number)
);
create index class_preparation_class_idx on public.class_preparation (class_id);

create trigger class_preparation_touch
  before update on public.class_preparation
  for each row execute function public.touch_updated_at();

alter table public.class_preparation enable row level security;

create policy "signed in only" on public.class_preparation as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);

-- A trainer records and sees only their own prep, for classes they teach; admins manage everyone's.
create policy "class preparation: own or admin" on public.class_preparation for all to laneway_app
  using ((trainer_id = app.user_id() and public.my_role() = 'trainer') or public.is_admin())
  with check (
    (trainer_id = app.user_id() and public.my_role() = 'trainer' and public.teaches_class(class_id))
    or public.is_admin()
  );

grant select, insert, update, delete on public.class_preparation to laneway_app;
