# Caged Dragon Identity / Sign-In

A single Express authentication service for Caged Dragon products. It serves the sign-in UI, account centre, developer console, and OAuth consent screen from `public/` and exposes JSON APIs from `server.js`.

## Included

- Email + password sign-up/sign-in.
- Phone OTP sign-in (ready in code; enable only after a Supabase SMS provider is configured).
- Passkeys (WebAuthn), TOTP two-step verification, account/session management.
- Central first-party OIDC sign-in using Supabase OAuth authorization-code flow with PKCE (S256), exact redirect allow-lists and consent.
- OAuth developer app management, product allow-list, admin console and audit events.
- English and Tamil UI, optional Cloudflare Turnstile, per-IP/per-identifier rate limiting.
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

For local development, use `PUBLIC_URL=http://localhost:3000`. The production central sign-in portal is `https://caged-dragon-auth.vercel.app`; set that exact origin as `PUBLIC_URL` in the portal Vercel project. The separate Admin dashboard is hosted at `https://caged-dragon-admin.vercel.app` and has its own project and callback. **You do not need to own a custom domain** to start; the host-provided URL is sufficient. Add that exact URL as the Supabase Site URL and add its auth callback/redirect URLs in Supabase URL Configuration.

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
4. Set `RATE_LIMIT_STORE=database` for Vercel and ensure the shared rate-limit SQL/RPC in `docs/database.sql` is deployed. The default in-memory limiter is intended for local development or a single process only.
5. Keep the Vercel project root set to this folder (the folder containing `package.json`, `index.js`, `server.js`, `public/`, and `vercel.json`) and deploy with Node.js 20+. The included `vercel.json` enables `cleanUrls` so `/account`, `/developer`, and `/admin` resolve to their `.html` pages.
6. In Supabase Auth > URL Configuration, set the Site URL and allowed redirects to the deployed origin.
7. Check `/healthz` (process liveness) and `/readyz` (database readiness).

`index.js` exports the Express app for the Vercel Node runtime. Vercel's `VERCEL` environment is detected for proxy IP handling and the local listener/cleanup interval is not started inside the serverless function.

### Docker / Node server

```bash
docker build -t caged-dragon-login .
docker run --env-file .env -p 3000:3000 caged-dragon-login
```

The Docker image uses Node 20 Alpine and runs as the non-root `node` user. `/healthz` is the liveness check; `/readyz` checks the database.

## 5. Add a first-party product

Only register products you own. Use `/admin` or the CLI to provide an exact product origin and callback URL; wildcard callbacks are not allowed. Registration creates a real public OAuth client (no client secret) and saves its exact redirect allow-list. Removing the product removes its OAuth client. Every product must use PKCE.

```bash
npm run products -- add arcadevault "ArcadeVault" https://arcadevault.example.com https://arcadevault.example.com/auth/callback
npm run products -- list
npm run products -- delete arcadevault
```

See [`docs/PRODUCTS.md`](docs/PRODUCTS.md) for the PKCE browser SDK and backend integration guidance.

## 6. Checks

```bash
npm run check      # JavaScript syntax checks
npm test           # end-to-end tests against the included Supabase mock
npm run db:check   # read-only check against the configured Supabase project
```


### Product integration examples

- `examples/demo-product` is a browser-only OIDC + PKCE learning demo. It needs a registered public client ID and an exact callback URL.
- `examples/oidc-bff` demonstrates server-side code exchange, signature/JWKS verification, HttpOnly sessions and server-held refresh tokens. Its in-memory session map is illustrative only; production deployments must use a durable shared session store and encrypt refresh tokens at rest.

For current setup tasks that must be completed outside the codebase (SMTP, SMS provider, deployment URL, optional CAPTCHA), see [`docs/SETUP.md`](docs/SETUP.md) and [`docs/EMAIL_DELIVERY.md`](docs/EMAIL_DELIVERY.md). For the initial local walkthrough, see [`docs/FIRST_RUN.md`](docs/FIRST_RUN.md).

## Security defaults
- The Supabase security advisor also reports leaked-password protection disabled and other warnings in unrelated Caged Dragon schemas/functions. Review the Supabase Security Advisor before public launch; do not blindly change other product schemas.
- First-party product sign-in uses OAuth authorization-code + PKCE; callback URLs are exact-match registered. The browser SDK must be configured with `data-auth-url="https://gbeurqibcfvquacasofq.supabase.co/auth/v1"`; this is the Supabase Auth issuer, not the portal's Vercel origin. Do not use implicit flow or copy the portal cookie to products.
- The browser SDK keeps tokens in memory only and supports refresh; product-local sign-out is the default. For production apps, use a backend-for-frontend (BFF), verify ID-token signatures against the Supabase JWKS, and keep refresh tokens server-side. The Supabase OAuth Server must be enabled and an asymmetric JWT signing key selected before the OAuth flow can work.

- Public client keys are used for end-user Auth; the Supabase secret/service-role key is server-only.
- All `login_*` tables have RLS enabled and no public `anon`/`authenticated` table access.
- Privileged RPCs are executable only by `service_role` and pin `search_path`.
- Secure, HTTP-only cookies are used in production; HTTPS is required for production origins.
- Phone/SMS, email delivery features (password reset/change-email), account deletion, CAPTCHA, and custom legal/domain integrations remain explicitly gated until configured.
- Account deletion is off by default; review shared-product cleanup before enabling it.


### OAuth sign-in experience

The hosted Caged Dragon identity page is the destination opened by a product's sign-in action. It intentionally does not show a second “Continue with Caged Dragon” button. Users sign in or create an account on this page; an existing Caged Dragon session is resumed automatically for a registered product, and the OAuth consent screen is shown when authorization is required.

The sign-in and consent layouts include responsive breakpoints for phones, tablets, landscape screens, and desktop, with touch-sized controls and reduced-motion support.

### Launch readiness snapshot

See [`docs/LAUNCH_READINESS.md`](docs/LAUNCH_READINESS.md) for the 10 November 2026 live Supabase audit, completed database work, and the remaining dashboard/provider actions required before public launch.


## Separate administration application

The administrator dashboard is a separate application in the companion `admin-app/` folder of the Caged Dragon Admin Suite. This identity portal intentionally no longer serves `/admin`, `/admin.html`, or `/api/admin/*`, and it no longer contains administrator navigation or an admin allowlist environment variable. Normal user sign-in, account settings, developer features, passkeys, MFA and OAuth consent remain in this portal. Deploy the separate admin app and verify its OAuth flow before deploying this portal change.
