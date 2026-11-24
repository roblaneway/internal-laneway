-- A trainer's assessment plan for a term: each unit's assessments with due and review dates,
-- and how many submissions (and resubmissions) they marked. Marking is recorded in
-- marked_assessments with a status: 'marked' (done, not invoiced yet) or 'ready' (paid on the
-- invoice for the fortnight of ready_on, which is the day it was set to ready).

create table public.assessment_plan (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default app.user_id() references public.profiles (id) on delete cascade,
  term text not null constraint assessment_plan_term_check check (btrim(term) <> ''),
  course text not null constraint assessment_plan_course_check check (btrim(course) <> ''),
  unit_code text not null constraint assessment_plan_unit_check check (btrim(unit_code) <> ''),
  activity text not null default 'Assessment 1' constraint assessment_plan_activity_check check (btrim(activity) <> ''),
  due_on date,
  review_by date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_plan_review_check check (review_by is null or due_on is null or review_by >= due_on)
);
create index assessment_plan_trainer_term_idx on public.assessment_plan (trainer_id, term);

create trigger assessment_plan_touch
  before update on public.assessment_plan
  for each row execute function public.touch_updated_at();

alter table public.assessment_plan enable row level security;

create policy "signed in only" on public.assessment_plan as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);

-- Like marked_assessments: a trainer manages their own plan; admins manage everyone's.
create policy "assessment plan: own or admin" on public.assessment_plan for all to laneway_app
  using ((trainer_id = app.user_id() and public.my_role() = 'trainer') or public.is_admin())
  with check ((trainer_id = app.user_id() and public.my_role() = 'trainer') or public.is_admin());

grant select, insert, update, delete on public.assessment_plan to laneway_app;

-- Marking status. Existing entries were already paid by date marked, so they start as ready then.
alter table public.marked_assessments
  add column status text not null default 'ready'
    constraint marked_assessments_status_check check (status in ('marked', 'ready')),
  add column ready_on date,
  add column plan_id uuid references public.assessment_plan (id) on delete cascade,
  add constraint marked_assessments_plan_kind_unique unique (plan_id, kind);

update public.marked_assessments set ready_on = marked_on;

alter table public.marked_assessments
  add constraint marked_assessments_ready_check check ((status = 'ready') = (ready_on is not null));

create index marked_assessments_trainer_ready_idx on public.marked_assessments (trainer_id, ready_on);

-- Back to 'marked' takes an entry off the invoice. Becoming ready puts it on the next invoice
-- (today, in Melbourne), unless the date is given; a new entry defaults to the date marked.
create or replace function public.set_assessment_ready_on()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'marked' then
    new.ready_on := null;
  elsif new.ready_on is null then
    new.ready_on := case when tg_op = 'INSERT' then new.marked_on
                         else (now() at time zone 'Australia/Melbourne')::date end;
  end if;
  return new;
end;
$$;

create trigger marked_assessments_ready_on
  before insert or update on public.marked_assessments
  for each row execute function public.set_assessment_ready_on();

-- Keep a plan row's marking (its trainer and invoice wording) in step with the row.
create or replace function public.sync_assessment_plan_marking()
returns trigger
language plpgsql
as $$
begin
  update public.marked_assessments
  set trainer_id = new.trainer_id, term = new.term, course = new.course, unit_code = new.unit_code, activity = new.activity
  where plan_id = new.id
    and (trainer_id, term, course, unit_code, activity)
        is distinct from (new.trainer_id, new.term, new.course, new.unit_code, new.activity);
  return new;
end;
$$;

create trigger assessment_plan_sync_marking
  after update of trainer_id, term, course, unit_code, activity on public.assessment_plan
  for each row execute function public.sync_assessment_plan_marking();
