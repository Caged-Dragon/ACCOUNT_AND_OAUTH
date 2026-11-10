-- Caged Dragon Sign-In: database setup. Run once in Supabase > SQL Editor.
-- Safe to run again. Everything is locked: only the website's server (service role) can use these tables and functions.

create table if not exists public.login_client_apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) <= 80),
  allowed_origin text not null unique check (allowed_origin ~ '^https?://[^/?#]+$' and allowed_origin = lower(allowed_origin)),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.login_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  display_name text check (char_length(display_name) <= 80),
  status text not null default 'active' check (status in ('active','suspended')),
  sign_in_count integer not null default 0,
  first_sign_in_at timestamptz not null default now(),
  last_sign_in_at timestamptz not null default now()
);

create table if not exists public.login_account_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','developer')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.login_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null check (method in ('email','phone','caged_dragon')),
  identifier text not null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (method, identifier)
);
create index if not exists login_methods_user_idx on public.login_methods(user_id);

create table if not exists public.login_app_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_app_id uuid not null references public.login_client_apps(id) on delete cascade,
  first_granted_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (user_id, client_app_id)
);

create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  client_app_id uuid references public.login_client_apps(id) on delete set null,
  method text not null,
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  role text check (role in ('user','developer'))
);
create index if not exists login_events_user_idx on public.login_events(user_id, created_at desc);
create index if not exists login_events_created_idx on public.login_events(created_at desc);
create index if not exists login_events_client_idx on public.login_events(client_app_id) where client_app_id is not null;
create index if not exists login_app_grants_client_idx on public.login_app_grants(client_app_id);
create index if not exists login_accounts_email_idx on public.login_accounts(lower(email)) where email is not null;
create index if not exists login_accounts_phone_idx on public.login_accounts(phone) where phone is not null;

create table if not exists public.login_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_app_id uuid not null references public.login_client_apps(id) on delete cascade,
  payload text not null check (octet_length(payload) <= 65536),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists login_codes_expires_idx on public.login_codes(expires_at);
create index if not exists login_codes_user_idx on public.login_codes(user_id);
create index if not exists login_codes_client_idx on public.login_codes(client_app_id);

create table if not exists public.login_developer_apps (
  client_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  created_at timestamptz not null default now()
);
create index if not exists login_developer_apps_user_idx on public.login_developer_apps(user_id);

create table if not exists public.login_passkeys (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  device_type text,
  backed_up boolean not null default false,
  name text not null default 'Passkey' check (char_length(name) <= 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists login_passkeys_user_idx on public.login_passkeys(user_id);

create table if not exists public.login_rate_limits (
  key text primary key,
  hits integer not null default 0,
  reset_at timestamptz not null
);
create index if not exists login_rate_limits_reset_idx on public.login_rate_limits(reset_at);

-- Product origins must be HTTPS. Plain HTTP is permitted only for local development.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'login_client_apps_secure_origin_check'
      and conrelid = 'public.login_client_apps'::regclass
  ) then
    alter table public.login_client_apps
      add constraint login_client_apps_secure_origin_check
      check (
        allowed_origin ~ '^https://[^/?#]+$'
        or allowed_origin ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$'
      ) not valid;
    -- NOT VALID avoids blocking setup on old product entries; PostgreSQL enforces it for new/updated rows.
  end if;
end $$;

-- Keep these bounds in place on databases created by an older version too.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'login_codes_code_hash_check'
      and conrelid = 'public.login_codes'::regclass
  ) then
    alter table public.login_codes
      add constraint login_codes_code_hash_check
      check (code_hash ~ '^[0-9a-f]{64}$') not valid;
    alter table public.login_codes validate constraint login_codes_code_hash_check;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'login_codes_payload_check'
      and conrelid = 'public.login_codes'::regclass
  ) then
    alter table public.login_codes
      add constraint login_codes_payload_check
      check (octet_length(payload) <= 65536) not valid;
    alter table public.login_codes validate constraint login_codes_payload_check;
  end if;
end $$;

-- Constrain event methods, including passwordless/passkey sign-in, to known audit values.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'login_events_method_check'
      and conrelid = 'public.login_events'::regclass
  ) then
    alter table public.login_events
      add constraint login_events_method_check
      check (method in ('email','phone','caged_dragon','passkey'));
  end if;
end $$;

-- Row level security on, with no policies = nobody but the server can read or write.
alter table public.login_client_apps enable row level security;
alter table public.login_accounts enable row level security;
alter table public.login_account_roles enable row level security;
alter table public.login_methods enable row level security;
alter table public.login_app_grants enable row level security;
alter table public.login_events enable row level security;
alter table public.login_codes enable row level security;
alter table public.login_developer_apps enable row level security;
alter table public.login_passkeys enable row level security;
alter table public.login_rate_limits enable row level security;

revoke all on public.login_client_apps, public.login_accounts, public.login_account_roles, public.login_methods,
  public.login_app_grants, public.login_events, public.login_codes, public.login_developer_apps,
  public.login_passkeys, public.login_rate_limits from public, anon, authenticated;

-- The Express server uses the service-role key only on the server. Grant it table access explicitly;
-- RLS remains enabled as defense in depth for every non-service role.
grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.login_client_apps, public.login_accounts, public.login_account_roles, public.login_methods,
  public.login_app_grants, public.login_events, public.login_codes, public.login_developer_apps,
  public.login_passkeys, public.login_rate_limits to service_role;
grant usage, select on sequence public.login_events_id_seq to service_role;

-- Is this website one of your registered products?
create or replace function public.login_resolve_client(p_redirect text)
returns table (id uuid, slug text, name text, origin text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name, c.allowed_origin
  from public.login_client_apps c
  where c.is_active
    and c.allowed_origin = lower(substring(p_redirect from '^(https?://[^/?#]+)'))
  limit 1;
$$;

-- Records a successful sign-in.
create or replace function public.login_record(p_user_id uuid, p_method text, p_client_slug text default null, p_user_agent text default null, p_role text default 'user')
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  u auth.users%rowtype;
  app_id uuid;
begin
  if p_method not in ('email','phone','caged_dragon','passkey') then raise exception 'bad method'; end if;
  if p_role not in ('user','developer') then raise exception 'bad role'; end if;
  select * into u from auth.users where id = p_user_id;
  if not found then raise exception 'unknown user'; end if;
  if exists (select 1 from public.login_accounts a where a.user_id = p_user_id and a.status = 'suspended') then
    raise exception 'account suspended';
  end if;
  select id into app_id from public.login_client_apps where slug = p_client_slug and is_active;

  insert into public.login_accounts (user_id, email, phone, sign_in_count)
  values (p_user_id, u.email, nullif(u.phone,''), 1)
  on conflict (user_id) do update
    set email = excluded.email, phone = excluded.phone,
        sign_in_count = public.login_accounts.sign_in_count + 1, last_sign_in_at = now();

  insert into public.login_account_roles (user_id, role) values (p_user_id, 'user') on conflict do nothing;

  if u.email is not null then
    insert into public.login_methods (user_id, method, identifier, is_verified)
    values (p_user_id, 'email', lower(u.email), u.email_confirmed_at is not null)
    on conflict (method, identifier) do update set last_used_at = now(), is_verified = excluded.is_verified;
  end if;
  if nullif(u.phone,'') is not null then
    insert into public.login_methods (user_id, method, identifier, is_verified)
    values (p_user_id, 'phone', u.phone, u.phone_confirmed_at is not null)
    on conflict (method, identifier) do update set last_used_at = now(), is_verified = excluded.is_verified;
  end if;

  if app_id is not null then
    insert into public.login_app_grants (user_id, client_app_id) values (p_user_id, app_id)
    on conflict (user_id, client_app_id) do update set last_used_at = now();
  end if;

  insert into public.login_events (user_id, client_app_id, method, user_agent, role)
  values (p_user_id, app_id, p_method, left(p_user_agent, 300), p_role);
end;
$$;

-- Shared sign-in attempt counter (used when RATE_LIMIT_STORE=database).
create or replace function public.login_rate_hit(p_key text, p_window_ms integer)
returns table (hits integer, reset_at timestamptz)
language sql security definer set search_path = ''
as $$
  insert into public.login_rate_limits as r (key, hits, reset_at)
  values (p_key, 1, now() + make_interval(secs => greatest(1000, least(p_window_ms, 86400000)) / 1000.0))
  on conflict (key) do update set
    hits = case when r.reset_at <= now() then 1 else r.hits + 1 end,
    reset_at = case when r.reset_at <= now() then now() + make_interval(secs => greatest(1000, least(p_window_ms, 86400000)) / 1000.0) else r.reset_at end
  returning r.hits, r.reset_at;
$$;

revoke all on function public.login_resolve_client(text) from public, anon, authenticated;
revoke all on function public.login_record(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.login_rate_hit(text, integer) from public, anon, authenticated;
grant execute on function public.login_resolve_client(text) to service_role;
grant execute on function public.login_record(uuid, text, text, text, text) to service_role;
grant execute on function public.login_rate_hit(text, integer) to service_role;

-- Current OIDC and identity-registry additions (also maintained as incremental migrations).
-- Applied to Supabase project CAGED_DRAGON (2026-11-09).
-- See Supabase migration history for authoritative applied migration.
begin;
alter table public.login_client_apps
  add column if not exists oauth_client_id text,
  add column if not exists redirect_uris text[] not null default '{}'::text[],
  add column if not exists client_type text not null default 'public';
alter table public.login_client_apps drop constraint if exists login_client_apps_secure_origin_check;
alter table public.login_client_apps add constraint login_client_apps_secure_origin_check
  check (allowed_origin ~ '^https://[^/?#]+$' or allowed_origin ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$') not valid;
alter table public.login_client_apps drop constraint if exists login_client_apps_client_type_check;
alter table public.login_client_apps add constraint login_client_apps_client_type_check check (client_type in ('public','confidential'));
alter table public.login_client_apps drop constraint if exists login_client_apps_redirects_check;
alter table public.login_client_apps add constraint login_client_apps_redirects_check check (
  cardinality(redirect_uris) <= 10 and
  ((oauth_client_id is null and cardinality(redirect_uris)=0) or (oauth_client_id is not null and cardinality(redirect_uris) between 1 and 10))
);
create unique index if not exists login_client_apps_oauth_client_id_key on public.login_client_apps(oauth_client_id) where oauth_client_id is not null;
create index if not exists login_app_grants_client_app_idx on public.login_app_grants(client_app_id);
create index if not exists login_codes_user_idx on public.login_codes(user_id);
create index if not exists login_codes_client_idx on public.login_codes(client_app_id);
create index if not exists login_events_client_idx on public.login_events(client_app_id) where client_app_id is not null;
alter table public.login_events drop constraint if exists login_events_method_check;
alter table public.login_events add constraint login_events_method_check check (method in ('email','phone','caged_dragon','passkey','oauth')) not valid;
do $$ declare t text; begin
  foreach t in array array['login_account_roles','login_client_apps','login_codes','login_developer_apps','login_passkeys','login_rate_limits'] loop
    if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_deny_client_roles') then
      execute format('create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',t||'_deny_client_roles',t);
    end if;
  end loop;
end $$;
commit;


-- Applied to Supabase project CAGED_DRAGON (2026-11-09).
create or replace function public.login_record_oauth_grant_v2(
  p_user_id uuid, p_oauth_client_id text, p_redirect_uri text, p_user_agent text default null
) returns void language plpgsql security definer set search_path = '' as $function$
declare app_id uuid;
begin
  if p_user_id is null or p_oauth_client_id is null or p_redirect_uri is null then raise exception 'invalid oauth grant'; end if;
  select c.id into app_id from public.login_client_apps c
    where c.is_active and c.oauth_client_id=p_oauth_client_id and p_redirect_uri=any(c.redirect_uris) limit 1;
  if app_id is null then return; end if;
  insert into public.login_app_grants(user_id,client_app_id) values(p_user_id,app_id)
    on conflict(user_id,client_app_id) do update set last_used_at=pg_catalog.now();
  insert into public.login_events(user_id,client_app_id,method,user_agent,role)
    values(p_user_id,app_id,'oauth',pg_catalog.left(coalesce(p_user_agent,''),300),'user');
end;
$function$;
revoke all on function public.login_record_oauth_grant_v2(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.login_record_oauth_grant_v2(uuid,text,text,text) to service_role;


-- Seed the central identity registry for accounts that predate this portal.
-- Unknown historical portal sign-in timestamps remain NULL; successful portal
-- sign-ins are recorded by public.login_record().
ALTER TABLE public.login_accounts
  ALTER COLUMN first_sign_in_at DROP NOT NULL,
  ALTER COLUMN last_sign_in_at DROP NOT NULL;

INSERT INTO public.login_accounts (user_id, email, phone, first_sign_in_at, last_sign_in_at)
SELECT
  u.id,
  NULLIF(pg_catalog.lower(pg_catalog.btrim(u.email)), ''),
  NULLIF(pg_catalog.btrim(u.phone), ''),
  NULL::timestamptz,
  NULL::timestamptz
FROM auth.users AS u
ON CONFLICT (user_id) DO UPDATE
SET email = EXCLUDED.email,
    phone = EXCLUDED.phone;

INSERT INTO public.login_account_roles (user_id, role)
SELECT u.id, 'user'
FROM auth.users AS u
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.login_methods (user_id, method, identifier, is_verified)
SELECT
  u.id,
  'email',
  pg_catalog.lower(pg_catalog.btrim(u.email)),
  u.email_confirmed_at IS NOT NULL
FROM auth.users AS u
WHERE NULLIF(pg_catalog.btrim(u.email), '') IS NOT NULL
ON CONFLICT (method, identifier) DO UPDATE
SET is_verified = EXCLUDED.is_verified
WHERE public.login_methods.user_id = EXCLUDED.user_id;

INSERT INTO public.login_methods (user_id, method, identifier, is_verified)
SELECT
  u.id,
  'phone',
  pg_catalog.btrim(u.phone),
  u.phone_confirmed_at IS NOT NULL
FROM auth.users AS u
WHERE NULLIF(pg_catalog.btrim(u.phone), '') IS NOT NULL
ON CONFLICT (method, identifier) DO UPDATE
SET is_verified = EXCLUDED.is_verified
WHERE public.login_methods.user_id = EXCLUDED.user_id;

-- Fill the first central-portal sign-in timestamp only when a real sign-in is recorded.
CREATE OR REPLACE FUNCTION public.login_record(
  p_user_id uuid,
  p_method text,
  p_client_slug text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text,
  p_role text DEFAULT 'user'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  u auth.users%rowtype;
  app_id uuid;
BEGIN
  IF p_method NOT IN ('email','phone','caged_dragon','passkey') THEN
    RAISE EXCEPTION 'bad method';
  END IF;
  IF p_role NOT IN ('user','developer') THEN
    RAISE EXCEPTION 'bad role';
  END IF;

  SELECT * INTO u FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown user'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.login_accounts a
    WHERE a.user_id = p_user_id AND a.status = 'suspended'
  ) THEN
    RAISE EXCEPTION 'account suspended';
  END IF;

  SELECT c.id INTO app_id
  FROM public.login_client_apps c
  WHERE c.slug = p_client_slug AND c.is_active
  LIMIT 1;

  INSERT INTO public.login_accounts (user_id, email, phone, sign_in_count, first_sign_in_at, last_sign_in_at)
  VALUES (p_user_id, u.email, NULLIF(u.phone,''), 1, pg_catalog.now(), pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      sign_in_count = public.login_accounts.sign_in_count + 1,
      first_sign_in_at = COALESCE(public.login_accounts.first_sign_in_at, pg_catalog.now()),
      last_sign_in_at = pg_catalog.now();

  INSERT INTO public.login_account_roles (user_id, role)
  VALUES (p_user_id, 'user')
  ON CONFLICT DO NOTHING;

  IF u.email IS NOT NULL THEN
    INSERT INTO public.login_methods (user_id, method, identifier, is_verified)
    VALUES (p_user_id, 'email', pg_catalog.lower(u.email), u.email_confirmed_at IS NOT NULL)
    ON CONFLICT (method, identifier) DO UPDATE
    SET last_used_at = pg_catalog.now(), is_verified = EXCLUDED.is_verified
    WHERE public.login_methods.user_id = EXCLUDED.user_id;
  END IF;

  IF NULLIF(u.phone,'') IS NOT NULL THEN
    INSERT INTO public.login_methods (user_id, method, identifier, is_verified)
    VALUES (p_user_id, 'phone', u.phone, u.phone_confirmed_at IS NOT NULL)
    ON CONFLICT (method, identifier) DO UPDATE
    SET last_used_at = pg_catalog.now(), is_verified = EXCLUDED.is_verified
    WHERE public.login_methods.user_id = EXCLUDED.user_id;
  END IF;

  IF app_id IS NOT NULL THEN
    INSERT INTO public.login_app_grants (user_id, client_app_id)
    VALUES (p_user_id, app_id)
    ON CONFLICT (user_id, client_app_id) DO UPDATE
    SET last_used_at = pg_catalog.now();
  END IF;

  INSERT INTO public.login_events (user_id, client_app_id, method, user_agent, role)
  VALUES (p_user_id, app_id, p_method, pg_catalog.left(p_user_agent, 300), p_role);
END;
$function$;

REVOKE ALL ON FUNCTION public.login_record(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_record(uuid,text,text,text,text) TO service_role;

