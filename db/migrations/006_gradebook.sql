-- Gradebook: each class's trainers keep their own student list and record a result
-- (S / NYS / not submitted, or absent / rescheduled for presentations) per student
-- for each assessment and presentation. Separate from marked_assessments (invoices).

-- The trainer's list of students for a class (no portal accounts needed).
create table public.class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  full_name text not null constraint class_students_name_check check (btrim(full_name) <> ''),
  student_number text,
  withdrawn boolean not null default false,
  created_at timestamptz not null default now(),
  constraint class_students_id_class_key unique (id, class_id)
);
create index class_students_class_idx on public.class_students (class_id);

-- The assessments and presentations students complete in a class this term.
create table public.class_tasks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  kind text not null default 'assessment' constraint class_tasks_kind_check check (kind in ('assessment', 'presentation')),
  title text not null constraint class_tasks_title_check check (btrim(title) <> ''),
  unit_code text,
  due_date date,
  created_at timestamptz not null default now(),
  constraint class_tasks_id_class_key unique (id, class_id)
);
create index class_tasks_class_idx on public.class_tasks (class_id);

-- One result per student per task. class_id ties both to the same class.
create table public.task_results (
  task_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  result text not null constraint task_results_result_check
    check (result in ('S', 'NYS', 'NS', 'ABSENT', 'RESCHEDULED')),
  attempt smallint not null default 1 constraint task_results_attempt_check check (attempt between 1 and 3),
  marked_on date,
  feedback text,
  updated_at timestamptz not null default now(),
  primary key (task_id, student_id),
  constraint task_results_task_fkey foreign key (task_id, class_id)
    references public.class_tasks (id, class_id) on delete cascade,
  constraint task_results_student_fkey foreign key (student_id, class_id)
    references public.class_students (id, class_id) on delete cascade
);
create index task_results_class_idx on public.task_results (class_id);
create index task_results_student_idx on public.task_results (student_id, class_id);

create trigger task_results_touch
  before update on public.task_results
  for each row execute function public.touch_updated_at();

-- Only the class's trainers (lead or rostered) and admins see or change any of it.
alter table public.class_students enable row level security;
alter table public.class_tasks enable row level security;
alter table public.task_results enable row level security;

create policy "signed in only" on public.class_students as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);
create policy "signed in only" on public.class_tasks as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);
create policy "signed in only" on public.task_results as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);

create policy "class students: class trainers or admin" on public.class_students for all to laneway_app
  using (public.is_admin() or public.teaches_class(class_id))
  with check (public.is_admin() or public.teaches_class(class_id));
create policy "class tasks: class trainers or admin" on public.class_tasks for all to laneway_app
  using (public.is_admin() or public.teaches_class(class_id))
  with check (public.is_admin() or public.teaches_class(class_id));
create policy "task results: class trainers or admin" on public.task_results for all to laneway_app
  using (public.is_admin() or public.teaches_class(class_id))
  with check (public.is_admin() or public.teaches_class(class_id));

grant select, insert, update, delete on public.class_students, public.class_tasks, public.task_results to laneway_app;
