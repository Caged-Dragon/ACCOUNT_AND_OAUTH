# Caged Dragon Identity / Sign-In

A single Express authentication service for Caged Dragon products. It serves the sign-in UI, account centre, developer console, and OAuth consent screen from `public/` and exposes JSON APIs from `server.js`.

## Included

- Email + password sign-up/sign-in.
- Phone OTP sign-in (ready in code; enable only after a Supabase SMS provider is configured).
- Passkeys (WebAuthn), TOTP two-step verification, account/session management.
- Central first-party OIDC sign-in using Supabase OAuth authorization-code flow with PKCE (S256), exact redirect allow-lists and consent.
- OAuth developer app management, product allow-list, admin console and audit events.
- English, Tamil, and Hindi UI, optional Cloudflare Turnstile, per-IP/per-identifier rate limiting.
- Supabase Postgres schema with RLS, no public table policies, and server-only privileged access.

The Express application in `server.js` is the single runtime source of truth. A legacy one-time handoff endpoint remains for backward compatibility with older internal demos; new first-party integrations should use the OAuth PKCE flow in `docs/PRODUCTS.md`. `index.js` exports the same app for managed Node hosting.

## Requirements

- Node.js 20 or newer.
- A Supabase project named **CAGED_DRAGON** (or the actual project URL/ref you intend to use).
- The Supabase project URL, publishable key, and server-only secret key.

## 1. Configure Supabase database

1. Open the SQL Editor in the **CAGED_DRAGON** project.
2. Run the complete [`docs/database.sql`](docs/database.sql) script.
3. Put the same project's Project URL, publishable key, and secret key in `.env` (copy `.env.example`).
4. Run `npm run db:check` to verify all ten tables and the resolver RPC.

Do not put the Supabase secret/service-role key in browser code or a `NEXT_PUBLIC_` variable. It is loaded only by the Express server.

## 2. Configure the app

```bash
npm ci
cp .env.example .env
```

Fill `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_URL`, and a new random `LOGIN_CODE_KEY`. The `.env.example` contains a key-generation command.

For a local run, use `PUBLIC_URL=http://localhost:3000`. For a live deployment, set `PUBLIC_URL` to the HTTPS origin provided by Vercel or another host. **You do not need to own a custom domain** to start; the host-provided URL is sufficient. Add that exact URL as the Supabase Site URL and add its auth callback/redirect URLs in Supabase URL Configuration.

Start locally:

```bash
npm run dev
```

Open `http://localhost:3000`. Use `npm start` for a production Node process. For Docker, see below.

## 3. Email and phone readiness

Email/password code is included. `EMAIL_ENABLED=0` only hides password-reset-by-email and change-email controls; it does not turn off email/password sign-in. Supabase hosted projects require custom SMTP to send signup confirmations and password-reset emails to arbitrary users. Until you provide SMTP, test with Supabase's email-confirmation setting turned off in a non-production project, understanding that this implicitly marks typed addresses as confirmed. Turn confirmation back on once SMTP is configured. Never set `UNVERIFIED_SIGNUP=1` in production.

Phone OTP routes and UI are included but default to `SMS_ENABLED=0`. Enable Supabase Phone Auth and configure an SMS provider before setting `SMS_ENABLED=1`. For development, Supabase test phone numbers use fixed OTPs, but Supabase still requires an SMS provider configuration. Do not expose the phone tab to real users before delivery works.

The organisation does not need its own mailbox or custom website domain for email/password authentication itself. A sender identity + SMTP service is needed later for real email verification, password resets, and change-email confirmation. SMS delivery similarly needs a configured provider (and applicable local sender/template registration).

## 4. Deploy

### Vercel

1. Import this repository into Vercel.
2. Set the environment variables from `.env.example` in Project Settings > Environment Variables. Do not upload the `.env` file.
3. Set `PUBLIC_URL` to the final Vercel HTTPS deployment origin.
4. Keep the Vercel project root set to this folder (the folder containing `package.json`, `index.js`, `server.js`, `public/`, and `vercel.json`) and deploy with Node.js 20+. The included `vercel.json` enables `cleanUrls` so `/account`, `/developer`, and `/admin` resolve to their `.html` pages.
5. In Supabase Auth > URL Configuration, set the Site URL and allowed redirects to the deployed origin.
6. Check `/healthz` (process liveness) and `/readyz` (database readiness).

`index.js` exports the Express app for the Vercel Node runtime. Vercel's `VERCEL` environment is detected for proxy IP handling and the local listener/cleanup interval is not started inside the serverless function.

### Docker / Node server

```bash
docker build -t caged-dragon-login .
docker run --env-file .env -p 3000:3000 caged-dragon-login
```

The Docker image uses Node 20 Alpine and runs as the non-root `node` user. `/healthz` is the liveness check; `/readyz` checks the database.

## 5. Add a first-party product

Only register products you own. Register the exact OAuth callback URL(s); wildcard callbacks are not allowed. Each product receives a public OAuth client (no client secret) and must use PKCE.

```bash
npm run products -- add arcadevault "ArcadeVault" https://arcadevault.example.com https://arcadevault.example.com/auth/callback
npm run products -- list
npm run products -- off arcadevault
```

See [`docs/PRODUCTS.md`](docs/PRODUCTS.md) for the PKCE browser SDK and backend integration guidance.

## 6. Checks

```bash
npm run check      # JavaScript syntax checks
npm test           # end-to-end tests against the included Supabase mock
npm run db:check   # read-only check against the configured Supabase project
```

For current setup tasks that must be completed outside the codebase (SMTP, SMS provider, deployment URL, optional CAPTCHA), see [`docs/SETUP.md`](docs/SETUP.md). For the initial local walkthrough, see [`docs/FIRST_RUN.md`](docs/FIRST_RUN.md).

## Security defaults
- The Supabase security advisor also reports leaked-password protection disabled and other warnings in unrelated Caged Dragon schemas/functions. Review the Supabase Security Advisor before public launch; do not blindly change other product schemas.
- First-party product sign-in uses OAuth authorization-code + PKCE; callback URLs are exact-match registered. Do not use implicit flow or copy the portal cookie to products.
- The browser SDK keeps access tokens in memory only. For sensitive production apps, use a backend-for-frontend (BFF) and keep refresh tokens server-side.

- Public client keys are used for end-user Auth; the Supabase secret/service-role key is server-only.
- All `login_*` tables have RLS enabled and no public `anon`/`authenticated` table access.
- Privileged RPCs are executable only by `service_role` and pin `search_path`.
- Secure, HTTP-only cookies are used in production; HTTPS is required for production origins.
- Phone/SMS, email delivery features (password reset/change-email), account deletion, CAPTCHA, and custom legal/domain integrations remain explicitly gated until configured.
- Account deletion is off by default; review shared-product cleanup before enabling it.
