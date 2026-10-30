-- Invoices follow Laneway's template: one line per class (paid hours × rate),
-- plus a line for assessments the trainer marked during the fortnight.

-- How a class appears on invoices, and the hours paid per session when they
-- differ from the rostered time (e.g. 10am–1pm paid as 4.5 hours).
alter table public.classes
  add column invoice_label text,
  add column paid_hours numeric(4, 2) constraint classes_paid_hours_check check (paid_hours > 0 and paid_hours <= 24);

-- The bank's name appears on invoices; the per-assessment rate is set by an admin, like the hourly rate.
alter table public.trainer_billing
  add column bank_name text,
  add column assessment_rate numeric(8, 2) constraint trainer_billing_assessment_rate_check check (assessment_rate >= 0);

create or replace function public.guard_trainer_billing()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if app.user_id() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and (new.hourly_rate is not null or new.assessment_rate is not null) then
      raise exception 'Only an admin can set the rates' using errcode = '42501';
    elsif tg_op = 'UPDATE' and (new.hourly_rate is distinct from old.hourly_rate
                                or new.assessment_rate is distinct from old.assessment_rate) then
      raise exception 'Only an admin can set the rates' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Assessments a trainer marked, billed on the invoice for the fortnight they were marked in.
create table public.marked_assessments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default app.user_id() references public.profiles (id) on delete cascade,
  marked_on date not null default current_date,
  activity text not null constraint marked_assessments_activity_check check (btrim(activity) <> ''),
  unit_code text not null constraint marked_assessments_unit_check check (btrim(unit_code) <> ''),
  term text,
  course text not null constraint marked_assessments_course_check check (btrim(course) <> ''),
  kind text not null default 'Reassessment' constraint marked_assessments_kind_check check (kind in ('Assessment', 'Reassessment')),
  quantity int not null default 1 constraint marked_assessments_quantity_check check (quantity between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index marked_assessments_trainer_date_idx on public.marked_assessments (trainer_id, marked_on);

create trigger marked_assessments_touch
  before update on public.marked_assessments
  for each row execute function public.touch_updated_at();

alter table public.marked_assessments enable row level security;

create policy "signed in only" on public.marked_assessments as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);

-- A trainer records and sees only their own marking; admins manage everyone's.
create policy "marked assessments: own or admin" on public.marked_assessments for all to laneway_app
  using ((trainer_id = app.user_id() and public.my_role() = 'trainer') or public.is_admin())
  with check ((trainer_id = app.user_id() and public.my_role() = 'trainer') or public.is_admin());

grant select, insert, update, delete on public.marked_assessments to laneway_app;
