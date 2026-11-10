# External setup checklist

These steps are deliberately kept out of the codebase because they require ownership, billing, account access, or verification by Caged Dragon. The code already contains the relevant integration points; leave the feature switches off until each service is ready.

## 1. Supabase project and database

The live CAGED_DRAGON database has the account and sign-in schemas plus the OIDC/identity migrations applied and the secure-origin constraint validated. The incremental migrations are preserved in [`migrations/`](migrations/). The identity backfill migration seeds existing Auth users into the portal account/method registry without inventing historical login events. For a brand-new project, use the complete standalone [`database.sql`](database.sql); for an already-running project, apply only unapplied migration files in timestamp order and never re-run the seed against existing users unless intentionally reconciling identity records.

Use the Supabase project named **CAGED_DRAGON**. In its SQL Editor, run [`database.sql`](database.sql) once. Then configure the same project's values in the deployment environment:

- `SUPABASE_URL`: Project URL.
- `SUPABASE_ANON_KEY`: Publishable key (legacy anon key is supported).
- `SUPABASE_SERVICE_ROLE_KEY`: server-only secret key (legacy service_role key is supported).

Never use the secret key in frontend JavaScript or a `NEXT_PUBLIC_` environment variable. After deploying, run `npm run db:check` against that project.

## 2. Start without owning a custom domain

A custom domain is not required. Deploy first to the hosting provider's HTTPS URL (for example, the project's Vercel `*.vercel.app` URL). Set `PUBLIC_URL` to that exact origin, with no path or query string. In Supabase > Authentication > URL Configuration, set Site URL to the same origin and add the appropriate redirect URLs for the sign-in and confirmation callbacks.

Passkeys are bound to the deployed hostname. If you later move from a host-provided URL to a custom domain, users will need to register passkeys again on the new hostname. Leave `WEBAUTHN_RP_ID` empty unless you intentionally need a non-default relying-party ID.

## 3. Email/password and email delivery

See [`EMAIL_DELIVERY.md`](EMAIL_DELIVERY.md) for the sender setup checklist and current built-in SMTP restrictions.

Email/password authentication is included and does not require a Caged Dragon-owned mailbox for users to sign in. However, email confirmation, password reset, and change-email messages require a sending service.

For development only, if no SMTP service is configured, you may turn **Confirm Email** off under Supabase > Authentication > Sign In / Providers > Email to test email/password sign-up. Be aware: Supabase treats any supplied email as confirmed when this setting is off. Do not use this mode as the production verification strategy. Hosted projects' built-in mail service is restricted to pre-authorized team addresses and a low send limit. Before a public launch:

1. Choose an SMTP provider.
2. Acquire and verify a sender domain/address with SPF/DKIM as required by the provider.
3. Configure it in Supabase > Authentication > SMTP Settings.
4. Add and verify the email templates / callback URLs.
5. Turn **Confirm Email** back on.
6. Set `EMAIL_ENABLED=1` only when email reset and change-email flows are ready to use.

`EMAIL_ENABLED=0` does not disable email/password login. It keeps the email reset and change-email controls disabled. Never set `UNVERIFIED_SIGNUP=1` in production; the app refuses to start if that flag is enabled with `NODE_ENV=production`.

## 4. Phone OTP

Phone OTP is implemented but stays hidden and disabled until delivery is ready. Supabase > Authentication > Sign In / Providers > Phone must be enabled and an SMS provider configured. Then configure the SMS provider's credentials/templates in Supabase and set `SMS_ENABLED=1` in the server environment.

For development, Supabase supports fixed test phone numbers and OTPs without sending messages, but the phone provider still needs to be enabled/configured. Remove all test numbers before public launch. In India, confirm the applicable sender ID/template/DLT requirements with the chosen provider before sending production OTPs.

## 5. OAuth / products

- In Supabase > Authentication > OAuth Server, enable OAuth 2.1 server capabilities and set Authorization Path to `/oauth/consent`. The live Auth logs audited on 2026-11-10 still returned `404: OAuth server is disabled`; this must be enabled by a Supabase project Owner/Administrator before OAuth can work.
- In Supabase > Authentication > JWT Signing Keys, select an asymmetric signing key (RS256 or ES256) as the active signing key. Supabase requires asymmetric signing for OIDC ID tokens requested with the `openid` scope. Confirm `https://gbeurqibcfvquacasofq.supabase.co/auth/v1/.well-known/openid-configuration` and `https://gbeurqibcfvquacasofq.supabase.co/auth/v1/.well-known/jwks.json` return valid metadata/JWKS after enabling the OAuth server.
- Register each first-party product from `/admin` or with its exact callback URLs: `npm run products -- add <slug> "<Name>" <https://origin> <https://origin/auth/callback>`. Both paths now create a real public OAuth client (`token_endpoint_auth_method=none`, authorization-code + PKCE) and store its exact callback allow-list. Removal deletes both the registry entry and OAuth client. There are currently no product OAuth clients registered in the live CAGED_DRAGON project; real product origins/callbacks are required.
- Use authorization-code + PKCE (S256); never use implicit flow or put a client secret in browser code. Product SDK script tags must include `data-auth-url="https://gbeurqibcfvquacasofq.supabase.co/auth/v1"`. Prefer a backend-for-frontend (BFF) for production sessions and verify ID-token signatures server-side using the Supabase JWKS.

## 6. Supabase Auth security settings

In Supabase > Authentication > Settings / Password Security, enable leaked-password protection before public launch. This project audit currently reports it disabled. Also review MFA policy, minimum password length, OTP expiry, email confirmation, and rate limits.

## 7. Optional protections

### Turnstile

1. Create a Cloudflare Turnstile widget for the deployed login host.
2. Configure its secret in Supabase Auth > Attack Protection.
3. Set the public site key as `TURNSTILE_SITE_KEY` in the app.

### Two-step verification

Enable TOTP in Supabase > Authentication > Multi-Factor. Users can enrol an authenticator app at `/account`. Admin and developer private APIs require an enrolled TOTP user to complete the challenge before access.

## 8. Admin access and launch controls

- `ALLOW_ACCOUNT_DELETION=0`: keep disabled until every connected product is prepared for shared-identity deletion.
- `RATE_LIMIT_STORE=memory`: suitable for one instance. Use `database` for multiple instances so throttling is shared through the Supabase database.
- `TRUST_PROXY`: leave blank on local hosting; set only to the exact trusted proxy hop count when you control the proxy. Vercel is detected automatically.

## Launch status matrix

| Item | Code status | External action required |
|---|---|---|
| Email/password | Implemented | Turn off Confirm Email temporarily for non-production testing, or configure SMTP and keep verification on |
| Phone OTP | Implemented, gated | Enable Phone Auth and configure SMS provider; then `SMS_ENABLED=1` |
| Password reset / change email | Implemented, gated | Configure custom SMTP; then `EMAIL_ENABLED=1` |
| Passkeys | Implemented | Deploy over HTTPS; users register passkeys against final hostname |
| TOTP MFA | Implemented | Enable TOTP provider in Supabase Auth |
| OAuth authorization server | Portal consent routes + PKCE SDK implemented; admin and CLI registration now create real public OAuth clients; connected-app grant revocation included | Enable OAuth Server, set `/oauth/consent`, choose an asymmetric JWT signing key, register real product callbacks, then complete a live PKCE + token-verification test |
| Custom domain | Not required | A host-provided HTTPS URL works; configure custom DNS only when you own a domain |
| CAPTCHA | Optional | Configure Turnstile with Supabase Attack Protection |


## 9. Product registration through the admin portal

The `/admin` product form requires an exact product HTTPS origin and an exact callback URL on that origin. It provisions a public OAuth client directly in Supabase Auth, saves its client ID and redirect allow-list in `login_client_apps`, and displays the client ID for the product configuration. Removing a product also removes the OAuth client. Do not use placeholder/example domains for production registrations.


Administration now runs in a separate app. Configure the admin allowlist and admin-only secrets only in the standalone `admin-app/` Vercel project.
