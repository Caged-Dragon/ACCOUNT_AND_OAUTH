# Caged Dragon Central Authentication — Production Server Setup Guide

**Portal:** https://caged-dragon-auth.vercel.app  
**Vercel project:** `sigin-in-website`  
**Repository:** `Caged-Dragon/ACCOUNT_AND_OAUTH`  
**Application root:** `SIGN-IN/`  
**Supabase project:** `CAGED_DRAGON` (`gbeurqibcfvquacasofq`)  
**Guide checked:** 10 November 2026

This is an operator runbook for the existing Express authentication portal. It covers hosting, environment configuration, Supabase Auth, OAuth 2.1/OIDC, JWT signing, email/SMS delivery, product registration, security and launch testing.

> **Important shared-project warning:** The `CAGED_DRAGON` Supabase project is shared by more than the identity portal. A JWT signing-key rotation or project-wide Auth change can affect all applications that use this project. Audit dependencies before changing shared settings. Do not revoke old keys, delete users, or broadly modify shared RLS policies/functions as part of a routine portal setup.

## 0. Understand what is already deployed

The central sign-in service is an Express application. The production Vercel deployment is marked **Ready** and the custom `caged-dragon-auth.vercel.app` domain is assigned to project `sigin-in-website`.

The code already contains:

- User and developer sign-in/sign-up screens.
- Email/password authentication.
- Phone OTP UI and routes, intentionally disabled until an SMS provider is configured.
- Passkey/WebAuthn support.
- TOTP multi-factor authentication support.
- Account management and connected-app grant revocation.
- Developer console and an admin product-registration page.
- OAuth consent UI and decision routes.
- A browser PKCE SDK and a backend-for-frontend (BFF) example.
- English and Tamil UI.

The portal's own `/oauth/consent` page is supposed to receive an `authorization_id` query parameter from Supabase. Opening that URL manually with no authorization request can show “Request not valid”; this is expected. Test the consent screen by starting a real authorization request from a registered product.

### Authentication responsibilities

| Component | Responsibility |
|---|---|
| Vercel | Hosts the Express server, login UI, consent UI, account pages, developer console and admin pages |
| Supabase Auth | Verifies credentials and acts as the OAuth 2.1 / OIDC authorization server |
| Supabase Postgres | Stores portal account mappings, registered products, grants/audit data and rate-limit records |
| Product applications | Each has its own OAuth client and exact callback URL; each creates its own local session |

## 1. Verify the Vercel project

1. Open the [Vercel dashboard](https://vercel.com/dashboard) and select the Caged Dragon team.
2. Open the existing project named **`sigin-in-website`**. Do not create a second project for the same repository.
3. Confirm its Git repository is `Caged-Dragon/ACCOUNT_AND_OAUTH`.
4. Confirm the production branch is `main`.
5. Confirm the project Root Directory is `SIGN-IN` (the folder containing `package.json`, `index.js`, `server.js`, `public/` and `vercel.json`).
6. Confirm the domain `caged-dragon-auth.vercel.app` is assigned to this project.
7. Keep the existing function region `bom1` unless you plan and test a deliberate regional migration.
8. Keep the existing Express/Node runtime. The package declares Node.js `>=20`; Vercel currently reports Node 26.x for this project.
9. Do not set a static export/output directory. This is an Express app, not a static-only site.

The repository has a lockfile. Vercel should install from the `SIGN-IN` folder using `npm ci` and run the Express entry point through `index.js`.

**Do not modify any RTC project, RTC domain, DNS record, environment variable or deployment.** The excluded RTC projects are RTC main/cart, RTC admin and RTC mail.

## 2. Configure production environment variables in Vercel

Open **Vercel → `sigin-in-website` → Settings → Environment Variables**. Configure the following for **Production**.

| Variable | Required value / instruction |
|---|---|
| `SUPABASE_URL` | `https://gbeurqibcfvquacasofq.supabase.co` |
| `SUPABASE_ANON_KEY` | The CAGED_DRAGON publishable key (`sb_publishable_...`) or legacy anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | The CAGED_DRAGON server-only secret key (`sb_secret_...`) or legacy `service_role` key |
| `PUBLIC_URL` | `https://caged-dragon-auth.vercel.app` — origin only, no path or query string. This is the central sign-in portal host; the Admin dashboard is a separate Vercel app. |
| `LOGIN_CODE_KEY` | One randomly generated 32-byte key represented by exactly 64 hexadecimal characters |
| `EMAIL_ENABLED` | `0` until SMTP delivery and recovery/change-email flows are tested; then `1` |
| `SMS_ENABLED` | `0` until Supabase Phone Auth and a real SMS provider are configured and tested; then `1` |
| `UNVERIFIED_SIGNUP` | `0` in production; never enable it in production |
| `ALLOW_ACCOUNT_DELETION` | `0` until global account deletion and cleanup across every connected product has been reviewed |
| `RATE_LIMIT_STORE` | Prefer `database` for a multi-instance/serverless deployment; see note below |
| `AUTH_RATE_LIMIT` | Optional; defaults to 15 attempts per 15-minute window per IP |
| `AUTH_RATE_LIMIT_EMAIL` | Optional; defaults to 10 attempts per 15-minute window per email |
| `WEBAUTHN_RP_NAME` | `Caged Dragon` |
| `WEBAUTHN_RP_ID` | Leave blank so it follows the deployed hostname |
| `TURNSTILE_SITE_KEY` | Optional Cloudflare Turnstile public site key; configure its secret separately in Supabase Auth |
| `TERMS_URL` | Optional public HTTPS URL to the published Terms page |
| `PRIVACY_URL` | Optional public HTTPS URL to the published Privacy page |
| `PORT` | Usually leave unset on Vercel; local server defaults to 3000 |
| `TRUST_PROXY` | Usually leave unset on Vercel; Vercel proxy detection is automatic |

### Generate `LOGIN_CODE_KEY`

On a trusted local computer with Node.js installed, run:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the output into the Vercel `LOGIN_CODE_KEY` value. Save it in an approved password manager. Never paste it into chat, GitHub, screenshots, support tickets or logs.

**Keep the same value across normal deployments.** It encrypts the portal's one-time handoff payloads and derives a separate portal-owned EdDSA key. Changing it is a key migration, not a routine deploy setting.

### Rate-limit storage

`RATE_LIMIT_STORE=database` uses the portal's database-backed rate-limit RPC and is preferable when requests can be served by multiple serverless instances. If the database RPC is unavailable, the app fails closed when database storage is explicitly selected. Use `memory` only for local/single-process testing or if you have deliberately accepted per-instance counters.

### Secret handling rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or any `NEXT_PUBLIC_*` variable.
- Never expose `LOGIN_CODE_KEY` in frontend code.
- Do not put SMTP passwords or SMS provider credentials in GitHub.
- Do not add a Supabase secret key to product sites. Product clients should receive only their public OAuth client ID.
- Do not decrypt or print secret values just to check that environment-variable names exist.

After editing Vercel environment variables, trigger a new deployment so the production functions receive the updated values.

## 3. Configure Supabase Auth URL settings

Open the [CAGED_DRAGON Supabase project](https://supabase.com/dashboard/project/gbeurqibcfvquacasofq).

Go to **Authentication → URL Configuration**.

Set:

- **Site URL:** `https://caged-dragon-auth.vercel.app`
- **Additional Redirect URLs:** add the exact central portal callback/origin used by the app, including `https://caged-dragon-auth.vercel.app/`.
- For local-only development, add `http://localhost:3000/` to a non-production test setup. Remove development URLs from production allow-lists when no longer needed.

The portal uses Supabase Auth for email confirmation and recovery redirects. OAuth client redirect URIs are a different configuration and are registered per product in Section 7.

## 4. Enable the Supabase OAuth 2.1 server

This is a required dashboard action. The prior live audit recorded an Auth API response of `404: OAuth server is disabled`, so the portal's health check passing does **not** prove OAuth is active.

1. In Supabase, open **Authentication → OAuth Server**.
2. Enable OAuth 2.1 server capabilities.
3. Set **Authorization Path** to exactly `/oauth/consent`.
4. Save the setting.
5. Return to **Authentication → URL Configuration** and verify the Site URL is exactly `https://caged-dragon-auth.vercel.app`.

Supabase combines the Site URL and Authorization Path to form the central authorization UI URL:

`https://caged-dragon-auth.vercel.app/oauth/consent`

A product must start authorization at Supabase's authorization endpoint. Supabase validates the OAuth request and then redirects the user to the central consent page with `authorization_id`.

### Check the OAuth metadata endpoints

After enabling the server, open each URL or run `curl -i <URL>`:

```text
OAuth authorization-server metadata:
https://gbeurqibcfvquacasofq.supabase.co/.well-known/oauth-authorization-server/auth/v1

OpenID Connect discovery:
https://gbeurqibcfvquacasofq.supabase.co/auth/v1/.well-known/openid-configuration

Supabase Auth public signing keys (JWKS):
https://gbeurqibcfvquacasofq.supabase.co/auth/v1/.well-known/jwks.json
```

The metadata URLs should return JSON, not an OAuth feature-disabled error. Confirm that the issuer and JWKS URLs refer to the CAGED_DRAGON Supabase Auth project.

## 5. Configure JWT signing keys (RS256)

OIDC ID tokens requested with the `openid` scope require an asymmetric signing algorithm. Supabase supports RS256 and ES256 for asymmetric signing. This section explains the requested RS256 path.

### Create the standby key first

1. In Supabase, open **Authentication → JWT Signing Keys**.
2. Review the current key and its status.
3. If prompted to **Migrate JWT secret**, review the migration guide and the dependencies in your applications before proceeding. Supabase's migration process imports the legacy secret into the new signing-key system and prepares an asymmetric standby key.
4. If you need specifically RS256, create a new asymmetric RSA 2048 / RS256 standby key using the supported Dashboard flow. If the Dashboard does not offer an RS256 option in the current project UI, stop and consult the current Supabase signing-key guide/CLI rather than creating your own untracked key.
5. Verify that the new key is in **Standby** state.

A standby key is not yet used for newly issued JWTs. Do not select **Rotate keys** until the shared-project compatibility audit is complete.

### Audit the other services before rotating

Because this Supabase project is shared, inspect every Caged Dragon backend, API, Edge Function, worker and scheduled job that verifies Supabase access tokens. Search for:

- a hard-coded legacy JWT secret used with `jsonwebtoken`, `jose` or similar;
- code that assumes the JWT algorithm is `HS256`;
- manually constructed JWT verification that does not use Supabase's supported claims/JWKS mechanism;
- Edge Functions whose built-in **Verify JWT** behavior may be affected by a signing-key migration.

Update and test those consumers first. Prefer Supabase's supported `auth.getClaims()` verification path or maintained JWT verification against the Supabase JWKS. Do not put a private JWT signing key in Vercel or application code.

### Rotate only after the audit

When dependent services are compatible:

1. Return to **JWT Signing Keys**.
2. Select **Rotate keys** to make the RS256 key current.
3. Verify newly issued JWT headers use `alg=RS256` and a `kid` published in the Supabase JWKS.
4. Keep the previous key in **Previously used** state while old tokens may still be valid.
5. Wait for the old token lifetime to expire plus a safety margin. Supabase gives at least 1 hour 15 minutes as an example when access tokens have a one-hour lifetime.
6. Revoke the old key only after confirming no dependent service still needs it.

Do not permanently delete the old key as part of the first rotation. Supabase documents reversible key states, allowing a rollback if a dependent application was missed.

### Do not confuse the two JWKS endpoints

There are two separate issuers/keys in this codebase:

1. **Supabase OAuth/OIDC tokens:** issuer `https://gbeurqibcfvquacasofq.supabase.co/auth/v1`, verify using `https://gbeurqibcfvquacasofq.supabase.co/auth/v1/.well-known/jwks.json`.
2. **Portal legacy handoff tokens:** `https://caged-dragon-auth.vercel.app/.well-known/jwks.json` publishes a different portal-owned EdDSA key derived from `LOGIN_CODE_KEY`.

A product backend validating a Supabase-issued OAuth ID token must use the Supabase issuer/JWKS, not the portal legacy handoff JWKS.

## 6. Prepare the product callback routes

Before registering a product in the central admin page, inspect its actual router and implement its callback route. Do not guess the callback path from an example. It must be an exact production HTTPS URL that the product serves.

The OAuth flow for a product is:

1. Product creates a random `state`, PKCE verifier/challenge (`S256`) and OIDC `nonce`.
2. Browser redirects to the Supabase OAuth authorize endpoint with the product's client ID, exact callback, challenge, `state`, `nonce` and requested scopes.
3. Supabase validates the request and redirects to the portal's configured `/oauth/consent` page with `authorization_id`.
4. Portal ensures the user is signed in, shows the requesting application and scopes, then approves or denies.
5. Supabase redirects to the registered product callback with a short-lived, single-use authorization code (or an error on denial).
6. Product exchanges the code using the original PKCE verifier.
7. Product verifies the returned ID token's signature, issuer, audience, nonce, expiry and subject.
8. Product establishes its own application session.

Use only supported scopes: `openid`, `email`, `profile`, and `phone` when phone sign-in/delivery is enabled and required. Do not invent custom OAuth scopes. Enforce application-specific permissions in the product backend and database.

## 7. Register each eligible product

Only register real product applications after OAuth 2.1 is enabled and the callback route is implemented.
2. Sign in to the portal.
3. Open `https://caged-dragon-auth.vercel.app/admin`.
4. Complete TOTP verification if enabled for the administrator account.
5. Add one product at a time. The current admin form asks for:
   - a unique lowercase slug;
   - the product's display name;
   - its exact HTTPS origin;
   - its exact HTTPS callback URL.
6. Save the product and securely copy its generated public OAuth client ID into that product's deployment configuration.
7. Repeat for each product. Keep each product registration and consent grant separate so access can be revoked independently.

The current admin form provisions public OAuth clients (`token_endpoint_auth_method=none`) with PKCE and no client secret. The CLI can support multiple exact callbacks for environments where needed. Never register wildcard callbacks.

### Applications in scope

- Draco Code — `https://draco-code.vercel.app`
- Draco Chat — `https://draco-chat.vercel.app`
- Draco Office Docs — `https://draco-office-docs.vercel.app`
- Draco Office Sheets — `https://draco-office-sheets.vercel.app`
- Draco Web Hub — `https://draco-web-hub.vercel.app`
- Draco Store — `https://draco-store-murex.vercel.app`
- Draco Office Slides — only after its production deployment is fixed and healthy

Portfolio, Privacy Policy and Terms are public-content sites and do not need forced login unless account-based features are added.

**Strict exclusions:** RTC main/cart, RTC admin and RTC mail must remain untouched. Do not register them, modify their code, change DNS, or alter any of their Vercel/Supabase settings.

### Browser SDK configuration

The portal's documented browser SDK uses the following script configuration (replace placeholders with the real client and route):

```html
<script
  src="https://caged-dragon-auth.vercel.app/sdk.js"
  data-auth-url="https://gbeurqibcfvquacasofq.supabase.co/auth/v1"
  data-client-id="YOUR_PUBLIC_OAUTH_CLIENT_ID"
  data-redirect-uri="https://YOUR-PRODUCT-DOMAIN/ACTUAL-CALLBACK-PATH">
</script>
```

Use the repository's `docs/PRODUCTS.md` for the complete SDK example. The browser SDK is suitable for public clients and prototypes. For production websites with a backend, prefer a BFF: retain refresh tokens server-side in encrypted durable storage and issue a product-local Secure, HttpOnly, SameSite cookie. Never copy central portal cookies between domains.

The repository includes `docs/verify-id-token.mjs` and `examples/oidc-bff/` as starting points. The BFF example's in-memory session map is illustrative only; replace it with a durable, shared session store before production.

## 8. Configure email delivery

Email/password sign-in is implemented. `EMAIL_ENABLED=0` does **not** disable email/password sign-in; it disables password-reset-by-email and change-email functionality until delivery is ready.

For production signup confirmation, password recovery and change-email messages:

1. Select an email/transactional provider that supplies SMTP credentials.
2. Verify a sender address or domain you control.
3. Add the DNS records required by the provider (typically SPF, DKIM and DMARC).
4. In Supabase open **Authentication → Emails → SMTP Settings** (Dashboard labels can evolve).
5. Enable custom SMTP and enter the host, port, username, password, verified sender address and sender name.
6. Store the SMTP credentials in Supabase only; this portal relies on Supabase Auth to send these messages.
7. Review the email templates. Preserve Supabase's `{{ .ConfirmationURL }}` template variable for confirmation links.
8. Keep email confirmation enabled for production.
9. Test with a genuinely unused email address that you can access. Check inbox, spam and Supabase Auth logs.
10. Only after recovery and change-email flows work, set `EMAIL_ENABLED=1` in Vercel and redeploy.

Supabase's built-in sender is development-only and restricted. Successful login for an already-confirmed account does not prove signup confirmation or reset messages work.

Do not set `UNVERIFIED_SIGNUP=1` in production. Disabling email confirmation is a temporary development-only shortcut because Supabase treats supplied email addresses as confirmed when that setting is off.

## 9. Configure phone OTP (optional)

Phone OTP code exists but the UI and routes remain gated while `SMS_ENABLED=0`.

1. Enable **Authentication → Sign In / Providers → Phone** in Supabase.
2. Select and configure an SMS provider supported by Supabase.
3. Enter the provider credentials and message template in Supabase.
4. Confirm any country-specific sender ID, template and registration requirements for the countries receiving messages.
5. Test real delivery, OTP expiry, resend cooldown and rate limiting.
6. Set `SMS_ENABLED=1` in Vercel only after delivery works.
7. Redeploy and test invalid-code handling and repeated attempts.

Do not expose phone login to real users before SMS delivery is confirmed. Remove test phone numbers from production configuration.

## 10. Harden the authentication service

Before public launch:

- Enable Supabase leaked-password protection in the Auth password-security/attack-protection settings.
- Review password length/strength policy, email confirmation, OTP expiry, Auth rate limits and MFA policy.
- Enroll administrators in TOTP MFA and verify that privileged actions require the expected MFA level.
- Consider Cloudflare Turnstile for signup and exposed forms. Configure the public site key in Vercel and the matching secret in Supabase Auth Attack Protection.
- Keep `ALLOW_ACCOUNT_DELETION=0` until account deletion and cleanup across all connected applications is designed and tested.
- Review Supabase Security Advisor findings. Do not bulk-change shared-project RLS policies or SECURITY DEFINER functions without auditing the product that owns each object.
- Review logs to ensure no passwords, OTPs, access tokens, refresh tokens, client secrets or PII are recorded.

## 11. Build and deploy

From the `SIGN-IN` directory, run:

```bash
npm ci
npm run check
npm test
npm run db:check
```

Use test/staging credentials for Preview deployments. Do not run database checks with production credentials from an untrusted computer.

For production:

1. Review the Git diff and confirm no secrets or test dumps are included.
2. Merge the approved change to `main`.
3. Wait for Vercel to finish the production build.
4. Confirm the deployment is **Ready** and its commit SHA is the commit you intended to deploy.
5. Confirm the `caged-dragon-auth.vercel.app` alias points to that production deployment.
6. Test the health endpoints below.

Do not change the production project name, alias, repository connection or Root Directory as part of routine code updates.

## 12. Production health and acceptance tests

Run:

```bash
curl -i https://caged-dragon-auth.vercel.app/healthz
curl -i https://caged-dragon-auth.vercel.app/readyz
```

Expected results:

- `/healthz`: HTTP 200 and `{"ok":true}` — process liveness.
- `/readyz`: HTTP 200 and `{"ok":true,"database":"ready"}` — portal database connectivity.

Then verify in a real browser:

1. `/` renders the sign-in page.
2. English/Tamil language switching works.
3. Existing account sign-in works.
4. New account signup and email confirmation work.
5. Password recovery works after SMTP is configured.
6. `/account` shows the signed-in account and connected applications.
8. OAuth discovery and JWKS endpoints return valid JSON.
9. A registered test product can initiate PKCE authorization.
10. The central consent screen displays the requesting product and requested scopes correctly.
11. Approval returns the user to the exact product callback and token exchange succeeds.
12. Denial returns an OAuth error and does not establish a product session.
13. The product backend validates signature, issuer, audience, nonce, expiry and subject.
14. Product-local refresh and logout work.
15. Revoking the product grant prevents future authorization as intended.
16. No RTC website, project or domain was changed.

A passing health check is not proof that OAuth is enabled. A successful build is not proof that login works. Do not announce launch readiness until a full live PKCE flow succeeds.

## 13. Troubleshooting

| Symptom | What to check |
|---|---|
| `/healthz` is 200 but `/readyz` is 503 | Vercel Supabase URL/keys, Supabase availability, portal schema and service-role/secret access |
| OAuth authorize endpoint returns feature-disabled / 404 | OAuth 2.1 Server has not been enabled in Supabase Authentication → OAuth Server |
| Consent page says request invalid | It was opened without a Supabase-issued `authorization_id`; initiate login from a registered product |
| Allow on OAuth consent returns `Blocked request.` | The portal checks POST origin. This build accepts a same-origin `Referer` only if the browser omitted `Origin`; mismatched or `null` origins remain blocked. Confirm `PUBLIC_URL=https://caged-dragon-auth.vercel.app` and redeploy the portal. |
| Redirect URI rejected | Compare the complete requested callback with the OAuth client's registered URI, including scheme, host, port, path and trailing slash |
| Callback arrives but token exchange fails | Client ID, public/confidential client type, original PKCE verifier, exact redirect URI, and single-use code expiry |
| ID token validation fails | Use the Supabase issuer/JWKS, exact client ID audience, matching nonce, allowed algorithm, `kid` and expiry |
| Signup works only for existing users / email never arrives | SMTP not configured, sender not verified, or the address is already confirmed; test a new address and inspect Auth logs |
| Forgot-password control is hidden | Configure/test SMTP, then set `EMAIL_ENABLED=1` and redeploy |
| Phone tab is missing | `SMS_ENABLED=0` or phone provider is not ready |
| Admin page | Administration is hosted in the separate `admin-app/` project, not in this identity portal |
| Passkeys stop working after changing domain | Passkeys are tied to the relying-party hostname; users may need to register new passkeys on the new hostname |

## 14. Rollback and recovery

- For a bad code deployment, roll back to the previous known-good Vercel deployment before changing Supabase Auth settings.
- Do not delete the last known-good deployment.
- If JWT signing-key rotation breaks a dependent service, follow Supabase's signing-key recovery process; keep the previous key available during the transition.
- Do not rotate `LOGIN_CODE_KEY` as a normal deployment operation.
- Do not delete OAuth clients while products still depend on them. Removing a product also removes its OAuth client.
- Do not delete a shared identity account until the effect on all connected Caged Dragon products and their data-retention rules is reviewed.

## 15. Final go-live checklist

- [ ] Existing Vercel project, repository, `SIGN-IN` root, production branch and portal domain are correct.
- [ ] Production environment variables are set; private values are not exposed.
- [ ] Supabase Site URL and central Auth redirect URLs are correct.
- [ ] Supabase OAuth 2.1 Server is enabled and Authorization Path is `/oauth/consent`.
- [ ] RS256 is active only after a shared-project compatibility audit.
- [ ] OAuth metadata, OIDC discovery and Supabase JWKS endpoints return valid JSON.
- [ ] SMTP signup confirmation, recovery and change-email flows have been tested.
- [ ] Leaked-password protection is enabled.
- [ ] Administrator accounts are restricted and MFA tested.
- [ ] Product callback routes exist and exact OAuth clients are registered.
- [ ] A live product completes PKCE, consent, token exchange and backend ID-token verification.
- [ ] Denial, refresh, product-local logout and grant revocation are tested.
- [ ] RTC main/cart, RTC admin and RTC mail remain untouched.

**Launch status wording:** The portal may be deployed and database-ready while still not being a functioning central OAuth provider. Call it OAuth-ready only after Supabase OAuth is enabled, at least one real product client is registered, and an end-to-end PKCE flow succeeds.


## Administrator application boundary

The admin dashboard has been moved to the separate `admin-app/` project. Do not configure `ADMIN_EMAILS` on this identity portal. Configure the allowlist only on the standalone admin deployment. The portal source intentionally returns 404 for `/admin` and has no `/api/admin/*` routes.
