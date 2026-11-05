# Staging now, before you own a domain

## Why this exists
The real setup uses two sites that share one login cookie on `.caged-dragon.com`, and passkeys tied to `caged-dragon.com`. Free `*.vercel.app` addresses cannot do either (browsers treat `vercel.app` like `.com`, so two projects cannot share a cookie or a passkey domain).
So for now deploy **`apps/combined`**: the same screens (sign-in, second step, consent, account center, admin) in **one** site on **one** address. Everything works on it. When you buy the domain you switch to `apps/oauth` + `apps/accounts` (see DEPLOY.md).

## What you can do today, with no domain
1. Push the repo to GitHub (DEPLOY.md, Step 1).
2. Create **one** Vercel project: root directory `apps/combined`, name it `caged-dragon-combined`. Vercel gives it a free address like `https://caged-dragon-combined.vercel.app` (read the real one in the dashboard; if the name was taken it adds a suffix).
3. Add the variables from `apps/combined/.env.example`. Set `NEXT_PUBLIC_WEBAUTHN_RP_ID` to your real address without `https://`. Deploy. If you had to guess the address, fix the variable and **Redeploy**.
4. Supabase dashboard (project CAGED_DRAGON):
   - JWT Keys: make an **ES256** key current
   - URL Configuration: Site URL = your `https://...vercel.app` address; Redirect URL = `https://...vercel.app/auth/callback`
   - OAuth Server: enable, Authorization Path `/oauth/consent`, dynamic registration off
   - Email: confirm email on, min password 10; custom SMTP when you have one
   - MFA: enable Authenticator app (TOTP) and WebAuthn
   - Passkeys: enable; Relying Party ID = your vercel.app host (for example `caged-dragon-combined.vercel.app`); origin = `https://` + that host. If the dashboard rejects it, set `NEXT_PUBLIC_PASSKEYS=false`, clear `NEXT_PUBLIC_WEBAUTHN_RP_ID`, redeploy, and test with authenticator-app codes.
5. Create your first user: Authentication > Users > Add user, tick Auto Confirm, an `@draco-mail.com` address. Put it in `ADMIN_EMAILS`, redeploy.
6. Test everything: sign in, add a second step, change password, upload a photo, open `/admin` (all three checks green), register a test app, run "Continue with Caged Dragon" from it, remove access in Connected apps, download your data, delete a throwaway account.
7. Optional but useful now: create an account with a mail-sending provider and set up custom SMTP (confirmation and reset emails). Verifying the sending domain needs `draco-mail.com`, not `caged-dragon.com`.

If a Vercel login page appears in front of your site, open the project's Settings > Deployment Protection and make sure the production address is public.

## What to keep in mind while on staging
- Treat every staging account and passkey as throwaway. Passkeys are tied to the address they were created on, so they will not work on the real domain: people re-add them after the switch.
- Do not set the cookie domain or the `caged-dragon.com` passkey domain yet; both must wait for the real domain.
- Apps you register for testing keep redirect URIs that point at staging. Re-register them (or edit their URIs) after the switch.
- Users, profiles, activity and the database rules all stay as they are; only addresses and the two Vercel projects change.

## Switching when you own the domain (about 30 minutes)
1. Buy `caged-dragon.com`.
2. Follow DEPLOY.md: create `caged-dragon-oauth` (`apps/oauth`) and `caged-dragon-accounts` (`apps/accounts`), add their env vars, add the domains and the CNAME records.
3. Update Supabase: Site URL `https://oauth.caged-dragon.com`; redirect URL; Passkeys relying-party ID `caged-dragon.com` with both site origins.
4. Test, then delete the `caged-dragon-combined` Vercel project.

## Choosing and buying the domain (when you are ready)
Any registrar works (for example Cloudflare Registrar, Namecheap, Porkbun, or Vercel itself). Check availability of `caged-dragon.com` first; if it is taken, the structure is the same with any name: `oauth.<yourdomain>` and `accounts.<yourdomain>`. Update the values in `.env.example` and the Supabase settings to match. Decide the final name before anyone enrols a real passkey, because the passkey domain cannot change afterwards.
