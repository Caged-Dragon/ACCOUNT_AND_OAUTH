# First run without a custom domain or sender mailbox

## Prerequisites

1. A Supabase project named **CAGED_DRAGON** with the Auth service available.
2. Node.js 20+.
3. The project's URL, publishable key, and server-only secret key.

## Database and app

1. Run `docs/database.sql` in the CAGED_DRAGON Supabase SQL Editor.
2. Copy `.env.example` to `.env`.
3. Fill the Supabase URL and keys, `PUBLIC_URL=http://localhost:3000`, and `LOGIN_CODE_KEY` (generate it with the command in `.env.example`).
4. Keep `EMAIL_ENABLED=0`, `SMS_ENABLED=0`, and `UNVERIFIED_SIGNUP=0` initially.
5. For local email sign-up tests without SMTP, turn **Confirm Email** off in Supabase Auth. This is a temporary development-only shortcut because it treats any entered email address as confirmed. Turn confirmation back on before public launch unless your chosen verification strategy intentionally differs.
6. Run `npm ci`, then `npm run check`, `npm test`, and `npm run db:check`.
7. Run `npm run dev` and open `http://localhost:3000`.

## Functional checklist

- [ ] Create an email/password account and sign out / sign in again.
- [ ] Enable the Supabase OAuth Server and set Authorization Path to `/oauth/consent` (see [`SETUP.md`](SETUP.md)).
- [ ] Register the demo OAuth client with `npm run products -- add demo "Demo Product" http://localhost:5555 http://localhost:5555/auth/callback` and copy the returned public client ID.
- [ ] Set `DEMO_LOGIN_URL=http://localhost:3000`, `DEMO_OIDC_ISSUER=https://gbeurqibcfvquacasofq.supabase.co/auth/v1`, and `DEMO_OAUTH_CLIENT_ID=<returned-client-id>` in `.env`.
- [ ] Run the login portal with `npm run dev`, then run the demo product with `npm run demo` and test authorization-code + PKCE.
- [ ] Visit `/account`, register a passkey on localhost, sign out, then sign in with it.
- [ ] Enable TOTP in Supabase Auth, enrol it from `/account`, sign out and verify that the next login asks for a code.
- [ ] Visit `/developer`, register a test OAuth app, and verify that client details are shown.
- [ ] Check `/healthz` and `/readyz`.

## Phone OTP test

Phone sign-in is in the application but is hidden while `SMS_ENABLED=0`. Supabase fixed test numbers can be used without sending SMS after the Phone provider is enabled and its SMS-provider requirements are satisfied. Configure that outside this repository, use the matching fixed OTP, then set `SMS_ENABLED=1` only in the test deployment.

The browser demo intentionally keeps tokens in memory and is only for learning. Use [`examples/oidc-bff`](../examples/oidc-bff/README.md) for the server-side session pattern required for production products.

## Before public launch

- [ ] Deploy to an HTTPS host URL and set `PUBLIC_URL` to its exact origin.
- [ ] Add that origin in Supabase Auth URL Configuration.
- [ ] Configure SMTP, email templates, and email confirmation.
- [ ] Configure SMS provider/template/registration and test delivery.
- [ ] Configure Turnstile if desired.
- [ ] Set `NODE_ENV=production`; keep `UNVERIFIED_SIGNUP=0`.


Admin setup is documented in the companion `admin-app/README.md`; it is not part of this identity portal first-run checklist.
