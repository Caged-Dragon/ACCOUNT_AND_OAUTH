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
