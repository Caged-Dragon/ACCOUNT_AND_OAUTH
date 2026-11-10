-- Correct loopback origin matching: 127.0.0.1 needs a literal dot escape
-- in the SQL regular expression, while all non-local development origins
-- continue to require HTTPS.
alter table public.login_client_apps
  drop constraint if exists login_client_apps_secure_origin_check;

alter table public.login_client_apps
  add constraint login_client_apps_secure_origin_check
  check (
    allowed_origin ~ '^https://[^/?#]+$'
    or allowed_origin ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$'
  ) not valid;
