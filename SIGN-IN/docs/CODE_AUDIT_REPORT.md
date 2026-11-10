# Caged Dragon Central Auth — code audit report

Audit package date: 10 November 2026  
Application: `SIGN-IN/` in `Caged-Dragon/ACCOUNT_AND_OAUTH`  
Runtime: Express on Vercel Node.js; Supabase Auth + Postgres

## Scope reviewed

- Runtime and configuration: `server.js`, `index.js`, `routes-extra.js`, `routes-passkey.js`, `vercel.json`, `package.json`, `.env.example`.
- Browser experience: `public/index.html`, `public/account.html`, `public/developer.html`, `public/error.html`, `public/404.html`, `public/app.js`, `public/account.js`, `public/dev.js`, `public/sdk.js`, `public/style.css`, `public/i18n.js`, `public/i18n-pages.js`.
- Identity/OAuth: `consent-i18n.js`, `docs/verify-id-token.mjs`, `examples/oidc-bff/server.mjs`, `examples/demo-product/server.mjs`, product registration scripts.
- Database and operations: `docs/database.sql`, migrations, `scripts/verify-db.js`, `scripts/products.js`, deployment and setup documentation.
- Automated checks: all test files and the syntax-check script.

## Changes in this audited package

1. **Admin access failure UX fixed.** `public/admin.js` no longer redirects to `/` when the protected overview API returns 401/404. It leaves the admin page visible and displays a clear explanation with a safe `/` sign-in link that returns to `/admin` after authentication.
2. **Regression test added.** `test/ui.test.js` asserts that admin authorization failures remain visible, the return-to-admin sign-in link is present, and the old immediate redirect is absent.
3. **Admin onboarding runbook added.** `docs/ADMIN_ACCESS.md` explains the allowlist, account creation, confirmed-email requirement, MFA condition, and SMTP dependency.

## Security and architecture observations

- Service-role credentials are consumed by server-side code only; the public browser app uses the sign-in APIs and does not receive the service-role key.
- Production session cookies are HTTP-only, Secure, SameSite=Lax and host-only (`__Host-` prefix); product sessions are not meant to reuse the portal's cookies.
- Internal `next` redirects are constrained to safe same-site paths. Product return URLs are resolved against registered client records.
- OAuth browser flows use authorization code + PKCE S256, state and nonce checks; the BFF example keeps refresh tokens server-side.
- Public product callback URIs are expected to be exact-match allowlisted. Do not register wildcard callbacks.
- Rate limiting, request body limits, Helmet/CSP, same-origin checks, generic credential errors and server-side admin allowlisting are present.
- Account deletion, email reset/change-email delivery and SMS are feature-gated; do not enable them until the provider and operational controls are configured.

## Verified checks in this environment

- `npm run check`: **passed** (all configured JavaScript syntax checks).
- Focused tests `node --test test/bff.test.js test/i18n.test.js test/ui.test.js test/oidc-sdk.test.js`: **16 passed, 0 failed** after the admin UX regression test was added.
- Secret-pattern scan: no production secret values found in the package. `.env` is ignored; `.env.example` contains blank placeholders.
- Vercel production runtime error scan for the last 7 days: no runtime error clusters were returned.

## Checks that remain unverified

- The full `npm test` suite could not complete in this environment because dependency installation was interrupted by unavailable/slow npm registry access. The resulting partial `node_modules` lacked `dotenv/config`, causing server-starting tests to fail before exercising application code. This is an environment/dependency-install limitation, not a passing full-suite result.
- `npm audit` / dependency vulnerability scan was not completed because the registry could not be reached reliably.
- No authenticated browser session was available, so a real end-to-end admin sign-in, MFA challenge, and product OAuth consent round-trip were not performed.
- Historical note (10 November 2026): the account `caged.dragon.official@gmail.com` was not present in Supabase Auth when checked. The standalone Admin app requires an existing confirmed central account; an allowlist entry alone does not create one.
- OAuth Server enablement, asymmetric Supabase JWT signing configuration, SMTP delivery, SMS delivery and production product callback registration remain external dashboard/provider tasks; they are not safely solved by changing application source alone.

## Production caution

This archive is a corrected source package, not a claim that every external provider setting is complete or that the package has been deployed. Keep the current production deployment until a fully installed dependency tree, complete test suite, dependency audit, authenticated browser test and preview deployment all pass. Do not rotate Supabase JWT signing keys without auditing all services that consume tokens from the shared project.


## Subsequent admin split

The current Admin Suite archive removes the admin assets and `/api/admin/*` routes from this portal and provides a separate admin app. The original audit observations about the old portal admin UI are historical and no longer apply to this source package.
