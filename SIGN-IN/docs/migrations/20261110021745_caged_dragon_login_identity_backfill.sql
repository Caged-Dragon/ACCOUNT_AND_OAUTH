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
