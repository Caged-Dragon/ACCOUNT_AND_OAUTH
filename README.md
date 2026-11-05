# Caged Dragon: sign-in and account center

Two Next.js sites, one Supabase project (CAGED_DRAGON, ref `gbeurqibcfvquacasofq`).

| Folder | Site | What it is |
|---|---|---|
| `apps/oauth` | `oauth.caged-dragon.com` | The front door: sign-in, second step, passkeys, password reset, "Continue with Caged Dragon" consent screen, `/admin` for registering apps |
| `apps/accounts` | `accounts.caged-dragon.com` | The account center: personal info, security, connected apps, data and privacy |
| `apps/combined` | any single address, e.g. `*.vercel.app` | Both of the above in one site. Use it **until you own the domain** (see `STAGING.md`) |

**How they work together.** Both sites use one cookie on `.caged-dragon.com`, so one sign-in covers both and signing out of either signs out both.
When a signed-out visitor opens the account center, it sends them to the front door and the front door sends them back afterwards. The front door only ever returns people to itself or to the account center (a visitor cannot be redirected to any other site).

**Run locally**

    cd apps/oauth    && npm install && npm run dev     # http://localhost:3000
    cd apps/accounts && npm install && npm run dev     # http://localhost:3002

`.env.local` in each app is already filled in for localhost. Passkeys are off locally (they need the real domain).

**Host it:** no domain yet? Follow `STAGING.md`. Domain bought? Follow `DEPLOY.md`.

**Database naming:** every table, function, trigger, policy, index and bucket is prefixed `account_` or `oauth_`. Full list in `supabase/migrations/README.md` and the project's migrations.
