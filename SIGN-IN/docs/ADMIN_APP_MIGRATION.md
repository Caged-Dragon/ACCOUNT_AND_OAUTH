# Administrator application split

The old administrator UI and privileged admin API routes have been removed from this identity portal source. Administration now belongs in the independent `admin-app/` project at `https://caged-dragon-admin.vercel.app`, with `https://admin.caged-dragon.com` as the future custom domain.

Do not remove shared `login_*` tables or existing OAuth client registrations. Deploy the new Admin app and verify its OAuth callback, OIDC signature validation, confirmed-email allowlist and MFA AAL2 enforcement before deploying these portal changes. User sign-in, account settings, developer pages, passkeys, MFA and OAuth consent remain in this portal.
