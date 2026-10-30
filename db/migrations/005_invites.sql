-- Email invites: an admin creates (or re-invites) a user with a temporary password
-- that expires, and the user must choose their own password when they first sign in.
alter table app.credentials
  add column must_change_password boolean not null default false,
  add column expires_at timestamptz;

-- A temporary password stops working once it expires.
create or replace function app.authenticate(p_email text, p_password text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select c.user_id
  from app.credentials c
  join public.profiles p on p.id = c.user_id
  where lower(p.email) = lower(trim(p_email))
    and c.password_hash = extensions.crypt(p_password, c.password_hash)
    and (c.expires_at is null or c.expires_at > now())
$$;

-- Whether a user signed in with a temporary password and must replace it.
-- Signed-in users can only ask about themselves (the login route asks signed out).
create or replace function app.password_change_required(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select must_change_password from app.credentials
    where user_id = p_user_id and (app.user_id() is null or app.user_id() = p_user_id or public.is_admin())
  ), false)
$$;

-- Admin-only: create a user, or give an existing one a new temporary password.
-- Returns the user id and whether the profile was created.
create or replace function app.invite_user(
  p_email text,
  p_full_name text,
  p_role public.user_role,
  p_temp_password text,
  p_valid_for interval default interval '7 days'
)
returns table (user_id uuid, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_created boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(trim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;
  if length(coalesce(p_temp_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters' using errcode = '22023';
  end if;

  select id into v_id from public.profiles where lower(email) = lower(trim(p_email));
  if v_id is null then
    if coalesce(trim(p_full_name), '') = '' or p_role is null then
      raise exception 'Name and role are required' using errcode = '22023';
    end if;
    insert into public.profiles (email, full_name, role)
    values (lower(trim(p_email)), trim(p_full_name), p_role)
    returning id into v_id;
    v_created := true;
  elsif v_id = app.user_id() then
    raise exception 'You can''t re-invite yourself' using errcode = '22023';
  end if;

  insert into app.credentials (user_id, password_hash, must_change_password, expires_at, updated_at)
  values (v_id, extensions.crypt(p_temp_password, extensions.gen_salt('bf', 10)), true, now() + p_valid_for, now())
  on conflict on constraint credentials_pkey do update
    set password_hash = excluded.password_hash,
        must_change_password = true,
        expires_at = excluded.expires_at,
        updated_at = now();

  return query select v_id, v_created;
end;
$$;

-- Admin-only: users still waiting to replace a temporary password.
create or replace function app.pending_invites()
returns table (user_id uuid, expires_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  return query select c.user_id, c.expires_at from app.credentials c where c.must_change_password;
end;
$$;

-- The signed-in user replaces their password (temporary or not).
create or replace function app.change_password(p_current text, p_new text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hash text;
begin
  if app.user_id() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  select password_hash into v_hash from app.credentials
  where user_id = app.user_id() and (expires_at is null or expires_at > now());
  if v_hash is null or v_hash <> extensions.crypt(coalesce(p_current, ''), v_hash) then
    raise exception 'Your current password is incorrect' using errcode = '22023';
  end if;
  if length(coalesce(p_new, '')) < 8 then
    raise exception 'Your new password must be at least 8 characters' using errcode = '22023';
  end if;
  if p_new = p_current then
    raise exception 'Choose a password different from the current one' using errcode = '22023';
  end if;
  update app.credentials
  set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)),
      must_change_password = false,
      expires_at = null,
      updated_at = now()
  where user_id = app.user_id();
end;
$$;

revoke execute on function app.password_change_required(uuid), app.invite_user(text, text, public.user_role, text, interval),
  app.pending_invites(), app.change_password(text, text) from public;
grant execute on function app.password_change_required(uuid), app.invite_user(text, text, public.user_role, text, interval),
  app.pending_invites(), app.change_password(text, text) to laneway_app;
