# ACCOUNT: the account website

Where signed-in people manage their Caged Dragon account. Deploys to `accounts.<your-domain>`.
It has **no sign-in screen of its own**: a signed-out visitor is sent to the OAUTH website, signs in there, and is sent back. Both sites share one login cookie on your parent domain.

## Pages
`/` home and security checkup · `/personal-info` photo, name, phone, birthday, language, time zone · `/security` overview, sign out other devices or all devices ·
`/security/password` · `/security/two-step` authenticator app, passkey or security key · `/security/passkeys` · `/security/activity` sign-in history ·
`/apps` apps the person signed in to, remove access · `/data` download a copy, delete the account · `/api/health` uptime check

## Settings (`.env.local` locally, Vercel variables in production; see `.env.example`)
| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project CAGED_DRAGON (already filled in) |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` | empty = any email; or one domain |
| `NEXT_PUBLIC_SITE_URL` | this website, e.g. `https://accounts.yourdomain.com` |
| `NEXT_PUBLIC_OAUTH_URL` | the OAUTH website, e.g. `https://oauth.yourdomain.com` |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.yourdomain.com` (leading dot). **Same in both websites.** Empty on localhost |
| `NEXT_PUBLIC_WEBAUTHN_RP_ID` | `yourdomain.com`. **Same in both.** Never change after people add passkeys |
| `NEXT_PUBLIC_PASSKEYS`, `NEXT_PUBLIC_REQUIRE_MFA` | `true` / `false`. **Same in both** |
`NEXT_PUBLIC_*` values are fixed when the site is built: after changing one, redeploy.

## Run locally
    npm install
    npm run dev            # http://localhost:3002
Start OAUTH too (`http://localhost:3000`), because sign-in happens there. Locally both sites share the login automatically.

## Check the code
    npm run check          # type-check + automated tests (14 tests: redirect safety, email rules, request-origin check, and more)

## Deploy (Vercel)
New Project, import the repository, set **Root Directory** to this folder (type it exactly as it appears on GitHub; it is case-sensitive), add the variables above, deploy, then add the domain `accounts.yourdomain.com` and the CNAME record Vercel shows.
`vercel.json` pins the site to Vercel's Mumbai region (`bom1`), next to the Supabase database (`ap-south-1`), because each page makes several database calls. If you move the database, change the region to the nearest Vercel region.
Two hosted sites that share one sign-in need **your own domain**: free `*.vercel.app` addresses cannot share a login cookie between two projects.

## Folder map
`app/(hub)/` pages and their actions · `components/` forms and navigation · `lib/auth.ts` sign-in checks that hand off to OAUTH · `lib/supabase/` database clients · `middleware.ts` keeps the session fresh.
Nothing here imports from the OAUTH folder.
