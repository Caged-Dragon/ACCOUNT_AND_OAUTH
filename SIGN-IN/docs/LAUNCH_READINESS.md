# Caged Dragon identity service – launch readiness

Last live audit: **10 November 2026**. This report distinguishes code/database work from controls that require the Supabase/Vercel owner or third-party provider.

## Verified and completed

- Supabase project `CAGED_DRAGON` (`gbeurqibcfvquacasofq`) is `ACTIVE_HEALTHY` in `ap-south-1`.
- Portal identity migrations are present in the live migration history, including the OIDC client audit, existing-user identity backfill, and loopback-origin constraint correction/validation.
- The three existing Auth users have three matching account profiles, three `login_accounts` rows, three default `user` role rows, and three verified email login-method rows. No historical portal login events were invented during backfill.
- All ten `public.login_*` tables have RLS enabled. The login recording RPC is executable by `service_role` and not by `anon` or `authenticated`.
- The product-origin constraint is validated, including HTTP loopback for local development only.
- Portal code provides a PKCE (S256) browser SDK, OAuth consent/decision routes, exact callback validation, product client provisioning/removal, connected-app grant revocation, English/Tamil-only UI, and responsive sign-in/consent pages.
- A BFF example verifies ID-token signatures against Supabase JWKS and validates issuer, audience, nonce, algorithm, expiry and subject. Its in-memory session store is for demonstration only; production products must replace it with durable shared storage.
- Syntax checks and focused BFF/OIDC/UI/i18n tests pass. See the delivery notes for the exact test coverage.

## Not enabled or not yet verified

| Control | Live status | Required before public launch |
|---|---|---|
| Supabase OAuth Server | Auth logs returned `404: OAuth server is disabled` during the 10 Nov audit | Enable under Authentication → OAuth Server; set Authorization Path to `/oauth/consent` |
| JWT signing for OIDC | Not confirmed from available project settings | Select an asymmetric RS256 or ES256 signing key; OIDC ID tokens with `openid` do not work with HS256 |
| Product OAuth registrations | 0 registered clients | Register each real product origin and exact callback URI; do not use sample domains |
| Email delivery | Custom SMTP not verified | Configure a real SMTP provider and sender; test new signup, confirmation, recovery, and email change |
| Leaked-password protection | Disabled per Supabase security advisor | Enable under Authentication → Password Security |
| Vercel deployment of this source | Not updated/verified | Deploy this package to the Vercel project that owns `caged-dragon-auth.vercel.app`; preserve environment variables and set project root correctly |
| Full server integration suite | Blocked in this workspace by incomplete `node_modules` (missing Express, dotenv, Supabase JS, Zod, rate-limit packages) | Run `npm ci`, then `npm test`, `npm run db:check`, and live PKCE tests in CI or the deployment environment |

## Live database summary

| Check | Result |
|---|---:|
| Auth users | 3 |
| Account profiles | 3 |
| Portal login accounts | 3 |
| Default user roles | 3 |
| Verified email login methods | 3 |
| Phone methods | 0 |
| Product OAuth clients | 0 |
| RLS on portal login tables | 10/10 enabled |
| Health advisor | No findings |

The project is shared with other Caged Dragon applications. The Security Advisor also reports `SECURITY DEFINER` RPC exposure warnings and RLS-without-policy informational findings across the shared database. These were not changed as part of this identity-portal work: each function/table belongs to a different product or internal schema and must be reviewed against its intended authorization contract before altering permissions. The leaked-password warning is directly relevant to this portal and remains open.

## Owner actions

1. In Supabase Authentication → URL Configuration, set Site URL to `https://caged-dragon-auth.vercel.app` and allow the precise sign-in/confirmation callback URLs used by this deployment.
2. In Authentication → OAuth Server, enable OAuth 2.1 and set Authorization Path to `/oauth/consent`.
3. In Authentication → JWT Signing Keys, activate RS256 or ES256. Verify these endpoints after enabling OAuth:
   - `https://gbeurqibcfvquacasofq.supabase.co/auth/v1/.well-known/openid-configuration`
   - `https://gbeurqibcfvquacasofq.supabase.co/auth/v1/.well-known/jwks.json`
4. In Authentication → SMTP Settings, configure a provider and sender that you control. Keep SMTP credentials in Supabase only. The built-in sender only delivers to pre-authorized team addresses and currently permits two messages per hour; it is not a production mailer.
5. Enable leaked-password protection.
6. Provide each real product's HTTPS origin and exact callback path. Register each in `/admin` only after OAuth Server is enabled; copy its public client ID into the product.
7. Deploy the updated portal source to the actual Vercel project. Confirm the deployed commit and environment variables; do not expose `SUPABASE_SERVICE_ROLE_KEY` or `LOGIN_CODE_KEY` to the browser.
8. Execute live tests: new user signup/confirmation, email recovery, authorization with PKCE, denied consent, token exchange, ID-token signature/claims verification in a product backend, local logout, grant revocation, and account lock/role checks.

## Important limits

This repository does not and cannot create a sender identity, prove domain ownership, obtain SMTP credentials, enable the OAuth feature in the Supabase Dashboard, choose a JWT signing key, or deploy to a Vercel project that is not exposed to the connected account. Those are owner/provider actions. Do not treat the code package alone as proof that the identity service is production-ready.
