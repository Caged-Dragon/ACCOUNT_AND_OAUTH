# External setup checklist

These steps are deliberately kept out of the codebase because they require ownership, billing, account access, or verification by Caged Dragon. The code already contains the relevant integration points; leave the feature switches off until each service is ready.

## 1. Supabase project and database

Use the Supabase project named **CAGED_DRAGON**. In its SQL Editor, run [`database.sql`](database.sql) once. Then configure the same project's values in the deployment environment:

- `SUPABASE_URL`: Project URL.
- `SUPABASE_ANON_KEY`: Publishable key (legacy anon key is supported).
- `SUPABASE_SERVICE_ROLE_KEY`: server-only secret key (legacy service_role key is supported).

Never use the secret key in frontend JavaScript or a `NEXT_PUBLIC_` environment variable. After deploying, run `npm run db:check` against that project.

## 2. Start without owning a custom domain

A custom domain is not required. Deploy first to the hosting provider's HTTPS URL (for example, the project's Vercel `*.vercel.app` URL). Set `PUBLIC_URL` to that exact origin, with no path or query string. In Supabase > Authentication > URL Configuration, set Site URL to the same origin and add the appropriate redirect URLs for the sign-in and confirmation callbacks.

Passkeys are bound to the deployed hostname. If you later move from a host-provided URL to a custom domain, users will need to register passkeys again on the new hostname. Leave `WEBAUTHN_RP_ID` empty unless you intentionally need a non-default relying-party ID.

## 3. Email/password and email delivery

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

- In Supabase > Authentication > OAuth Server, enable the OAuth server and set Authorization Path to `/oauth/consent`. This is required for the central portal to act as the authorization/consent experience. Confirm the project exposes the OAuth discovery metadata before production.
- Register each first-party product with exact callback URLs: `npm run products -- add <slug> "<Name>" <https://origin> <https://origin/auth/callback>`. The command creates a public OAuth client and stores its ID/callback allow-list.
- Use authorization-code + PKCE (S256); never use implicit flow or put a client secret in browser code. Prefer a backend-for-frontend (BFF) for production sessions.

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

- `ADMIN_EMAILS`: comma-separated, confirmed email addresses that may access `/admin`.
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
| OAuth developer apps | Implemented | Enable Supabase OAuth Server and set callback URL when required |
| Custom domain | Not required | A host-provided HTTPS URL works; configure custom DNS only when you own a domain |
| CAPTCHA | Optional | Configure Turnstile with Supabase Attack Protection |
