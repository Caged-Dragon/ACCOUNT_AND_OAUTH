# Hosting both sites on Vercel (about 45 minutes)

> **No domain yet?** Start with `STAGING.md` (one site on a free Vercel address). Come back here once you own `caged-dragon.com`.

You will end up with two Vercel projects built from one GitHub repository:

    GitHub repo "caged-dragon"
      apps/oauth     -> Vercel project "caged-dragon-oauth"     -> https://oauth.caged-dragon.com
      apps/accounts  -> Vercel project "caged-dragon-accounts"  -> https://accounts.caged-dragon.com
    Supabase project CAGED_DRAGON  (one database, one login for both sites)

You need: a GitHub account, a Vercel account, and control of the DNS for `caged-dragon.com` (where you bought the domain).
Plan note: Vercel's free Hobby plan is meant for personal, non-commercial projects. If Caged Dragon is a business, check Vercel's current terms and pricing before choosing a plan.

---

## Step 1: Put the code on GitHub
Unzip, then in the `caged-dragon-sites` folder:

    git init
    git add .
    git commit -m "Caged Dragon sign-in and account center"
    git branch -M main
    git remote add origin https://github.com/YOUR-NAME/caged-dragon.git
    git push -u origin main

(Create the empty repository `caged-dragon` on github.com first. Make it **private**.) The `.gitignore` keeps `.env.local` out of the repo.

## Step 2: Create the two Vercel projects
Do this twice, once per site.

1. Vercel dashboard > **Add New** > **Project** > import the `caged-dragon` repository.
2. Click **Edit** next to **Root Directory** and pick the site's folder:
   - first project: `apps/oauth`, name it `caged-dragon-oauth`
   - second project: `apps/accounts`, name it `caged-dragon-accounts`
3. Framework should show **Next.js**. Leave build settings alone.
4. Before clicking Deploy, open **Environment Variables** and add the values from Step 3.

## Step 3: Environment variables
Open `apps/oauth/.env.example` and `apps/accounts/.env.example` and paste each file into its project (Vercel accepts pasting a whole `.env` block).
Set them for **Production** (tick Preview too if you like).

| Variable | oauth | accounts | Value |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | `https://gbeurqibcfvquacasofq.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes | `sb_publishable_nsSCuh8LeO3ug4CjHbeZuw_O-d4IMCM` (public by design) |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN` | yes | yes | `draco-mail.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://oauth.caged-dragon.com` | `https://accounts.caged-dragon.com` | each site's own address |
| `NEXT_PUBLIC_ACCOUNTS_URL` | `https://accounts.caged-dragon.com` | | the other site |
| `NEXT_PUBLIC_OAUTH_URL` | | `https://oauth.caged-dragon.com` | the other site |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.caged-dragon.com` | `.caged-dragon.com` | **same in both** (leading dot) |
| `NEXT_PUBLIC_WEBAUTHN_RP_ID` | `caged-dragon.com` | `caged-dragon.com` | **same in both; never change once users enrol** |
| `NEXT_PUBLIC_PASSKEYS` | `true` | `true` | |
| `NEXT_PUBLIC_REQUIRE_MFA` | `false` | `false` | turn on later (Step 9) |
| `NEXT_PUBLIC_MAIL_URL`, `NEXT_PUBLIC_ALLOW_SIGNUP`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | yes | | see `.env.example` |
| `ADMIN_EMAILS` | yes | | your @draco-mail.com address (server-only) |
| `SUPABASE_SECRET_KEY` | optional | | only if you want to register apps from `/admin`; mark **Sensitive**; never in `NEXT_PUBLIC_*` |

Important: every `NEXT_PUBLIC_*` value is baked in when the site is **built**. After you change one, press **Redeploy** (Deployments > the latest > Redeploy) or it will not take effect.

Now click **Deploy** on both projects. The first builds will work but sign-in will not until Steps 4 and 5 are done.

## Step 4: Connect your domains
For each project: **Settings > Domains > Add**.
- `caged-dragon-oauth`: add `oauth.caged-dragon.com`
- `caged-dragon-accounts`: add `accounts.caged-dragon.com`

Vercel then shows a **CNAME** record for each (the value is unique to each project; copy exactly what Vercel shows). At your domain registrar's DNS page create:

| Type | Name | Value |
|---|---|---|
| CNAME | `oauth` | the value Vercel shows for caged-dragon-oauth |
| CNAME | `accounts` | the value Vercel shows for caged-dragon-accounts |

Wait until both domains show a green "Valid Configuration" (minutes to an hour). Vercel issues the HTTPS certificates automatically. Then open both addresses; each should load (the account center sends you to the sign-in page).

## Step 5: Configure Supabase (dashboard, project CAGED_DRAGON)
These cannot be set from code. In this order:

1. **Project Settings > JWT Keys**: create an **ES256** key and make it the current signing key.
2. **Authentication > URL Configuration**
   - Site URL: `https://oauth.caged-dragon.com` (the consent screen lives on this site)
   - Redirect URLs: `https://oauth.caged-dragon.com/auth/callback` and, for local work, `http://localhost:3000/auth/callback`
3. **Authentication > OAuth Server**: enable it; Authorization Path `/oauth/consent`; dynamic registration **off**.
4. **Authentication > Sign In / Providers > Email**: enable; confirm email **on**; minimum password length 10; require upper, lower, digits. Add **custom SMTP** (Authentication > SMTP Settings): the built-in email sender is only for testing.
5. **Authentication > MFA**: enable enrolment and verification for **Authenticator app (TOTP)** and **WebAuthn**.
6. **Authentication > Passkeys**: enable. Display name `Caged Dragon`; **Relying Party ID `caged-dragon.com`**; origins `https://oauth.caged-dragon.com` and `https://accounts.caged-dragon.com`.
7. Optional: **Attack Protection** > CAPTCHA (Cloudflare Turnstile); put the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on the oauth project and redeploy.
8. Optional, Teams/Enterprise plans only: **Authentication > Hooks**: Password Verification Attempt = `public.account_hook_password_verification_attempt`; MFA Verification Attempt = `public.account_hook_mfa_verification_attempt`.

## Step 6: Create your first account
Sign-up needs an inbox that can receive the confirmation email. To start without one:
Supabase > **Authentication > Users > Add user > Create new user**, tick **Auto Confirm User**, use an `@draco-mail.com` address and a strong password.
Put that address in `ADMIN_EMAILS` on the oauth project, then **Redeploy** it.

## Step 7: Test (in order)
1. Open `https://accounts.caged-dragon.com`. You should be sent to `oauth.caged-dragon.com/login`.
2. Sign in. You should land back on the account center.
3. **Security > 2-Step Verification**: add a passkey or authenticator app, then add a second method as a backup.
4. Open `https://oauth.caged-dragon.com/admin`. All three setup checks should be green. If not, they tell you which Supabase step is missing (Step 5, items 1 and 3).
5. Register a test app in `/admin` (needs `SUPABASE_SECRET_KEY`) or in Supabase > Authentication > OAuth Apps. Redirect URIs must match exactly.
6. From that app, click Continue with Caged Dragon: you should see the consent screen, approve, and arrive signed in. The app then shows under **Connected apps** in the account center.
7. Sign out on one site: the other should be signed out too.

## Step 8: Use "Continue with Caged Dragon" in an app
- Issuer: `https://gbeurqibcfvquacasofq.supabase.co/auth/v1`
- Scopes: `openid email profile`, PKCE on, redirect URI exactly as registered.
- A Supabase-based app: Authentication > Providers > New provider > Auto-discovery (OIDC), identifier `custom:caged-dragon`.
- Any other app: an OIDC library; Auth.js example in the older notes uses `type: "oidc"` with the issuer above.

## Step 9: Turn on mandatory second step
When you and your admins have at least two methods each, set `NEXT_PUBLIC_REQUIRE_MFA=true` on **both** projects and redeploy both.

## Updating later
`git push` to `main` redeploys whichever site's folder changed. Changing an environment variable needs a manual Redeploy.

## Things that will bite you
| Symptom | Cause and fix |
|---|---|
| `404 NOT_FOUND` on the Vercel URL | Wrong Root Directory. Project > Settings > General > Root Directory must be `apps/oauth` or `apps/accounts`, then redeploy |
| Account center redirects to a URL that fails | `NEXT_PUBLIC_OAUTH_URL` missing or has a typo; redeploy after fixing |
| Sign-in works on one site but the other asks again | `NEXT_PUBLIC_COOKIE_DOMAIN` is not exactly `.caged-dragon.com` in **both** projects, or one was not redeployed |
| "Invalid redirect URL" after email confirmation | Step 5, item 2: add `https://oauth.caged-dragon.com/auth/callback` |
| Consent screen never appears | Site URL or Authorization Path wrong (Step 5, items 2 and 3) |
| Admin check "asymmetric key" is red | Still on the old signing key (Step 5, item 1) |
| Passkey prompt fails or says not allowed | RP ID or origins do not match (Step 5, item 6), or you are on a `*.vercel.app` or `localhost` address |
| Confirmation emails never arrive | Built-in email limits; set custom SMTP (Step 5, item 4) |
| Testing on a preview deployment fails | Previews run on other addresses, so the shared cookie and passkey domain do not apply. Test sign-in on the real domains |
| Changed a variable but nothing changed | `NEXT_PUBLIC_*` is baked in at build time: Redeploy |
