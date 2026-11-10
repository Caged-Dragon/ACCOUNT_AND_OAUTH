-- Validate the corrected secure-origin constraint after confirming that no stored
-- product origins violate HTTPS / exact loopback development rules.
ALTER TABLE public.login_client_apps
  VALIDATE CONSTRAINT login_client_apps_secure_origin_check;
