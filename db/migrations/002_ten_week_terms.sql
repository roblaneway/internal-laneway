-- Terms (and so content plans) are 10 weeks long, not 12.
delete from public.content_plans where week_number > 10;

alter table public.content_plans drop constraint content_plans_week_number_check;
alter table public.content_plans
  add constraint content_plans_week_number_check check (week_number between 1 and 10);
