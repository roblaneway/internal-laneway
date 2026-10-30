-- Invoice details for trainers, who invoice Laneway for the sessions they deliver.
-- Kept out of public.profiles because students can read trainer profiles.
create table public.trainer_billing (
  trainer_id uuid primary key references public.profiles (id) on delete cascade,
  hourly_rate numeric(8, 2) constraint trainer_billing_rate_check check (hourly_rate >= 0),
  business_name text,
  abn text constraint trainer_billing_abn_check check (abn ~ '^\d{11}$'),
  gst_registered boolean not null default false,
  address text,
  phone text,
  bank_account_name text,
  bank_bsb text constraint trainer_billing_bsb_check check (bank_bsb ~ '^\d{6}$'),
  bank_account_number text constraint trainer_billing_account_check check (bank_account_number ~ '^\d{4,10}$'),
  updated_at timestamptz not null default now()
);

-- Trainers keep their own details up to date, but only an admin sets the rate.
-- Sessions with no app.user_id (migrations, seed, psql) are trusted.
create or replace function public.guard_trainer_billing()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if app.user_id() is not null and not public.is_admin() then
    if tg_op = 'INSERT' and new.hourly_rate is not null then
      raise exception 'Only an admin can set the hourly rate' using errcode = '42501';
    elsif tg_op = 'UPDATE' and new.hourly_rate is distinct from old.hourly_rate then
      raise exception 'Only an admin can set the hourly rate' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trainer_billing_guard
  before insert or update on public.trainer_billing
  for each row execute function public.guard_trainer_billing();

alter table public.trainer_billing enable row level security;

create policy "signed in only" on public.trainer_billing as restrictive for all to laneway_app
  using (app.user_id() is not null) with check (app.user_id() is not null);

-- A trainer sees and edits only their own details; admins manage everyone's.
create policy "billing: own or admin" on public.trainer_billing for all to laneway_app
  using ((trainer_id = app.user_id() and public.my_role() = 'trainer') or public.is_admin())
  with check ((trainer_id = app.user_id() and public.my_role() = 'trainer') or public.is_admin());

grant select, insert, update, delete on public.trainer_billing to laneway_app;
