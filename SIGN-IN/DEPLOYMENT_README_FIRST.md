# Deploy this folder as the Caged Dragon central sign-in portal

Vercel project: `sigin-in-website`
Canonical domain: `https://caged-dragon-auth.vercel.app`

Set production `PUBLIC_URL` to `https://caged-dragon-auth.vercel.app` (origin only). Preserve the existing Supabase keys and `LOGIN_CODE_KEY`; do not replace them with placeholders. In Supabase OAuth Server, set Authorization Path to `/oauth/consent`.

The `/oauth/decision` endpoint is a POST form action. It should not be opened directly as a page. The updated origin guard permits a matching same-origin Referer only when Origin is omitted and continues to reject mismatched or `null` Origin headers.

Install dependencies with `npm ci`; run `npm run check` and `npm test`; deploy from this folder. No production secrets are included.
