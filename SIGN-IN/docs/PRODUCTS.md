# Connecting a Caged Dragon product (OIDC + PKCE)

## Register a product

Run this from the portal project using the CAGED_DRAGON project's server-only key, or use the protected `/admin` page. The admin form asks for the same exact origin and callback values and displays the generated public client ID:

```bash
npm run products -- add arcadevault "ArcadeVault" https://arcadevault.example.com https://arcadevault.example.com/auth/callback
npm run products -- list
npm run products -- delete arcadevault
```

Use an exact callback URL for every environment. No wildcard redirect URLs are accepted. The admin form supports one callback per product; the CLI supports up to ten exact callback URLs for products with separate preview and production hosts. The registration creates a public OAuth client (`token_endpoint_auth_method=none`) and stores its client ID and callback allow-list in `login_client_apps`. Deleting a product also deletes its OAuth client. Never ship the Supabase secret/service-role key to a product.

## Browser integration

Load the SDK with the public client ID and callback URI:

```html
<script src="https://caged-dragon-auth.vercel.app/sdk.js"
        data-auth-url="https://gbeurqibcfvquacasofq.supabase.co/auth/v1"
        data-client-id="YOUR_PUBLIC_OAUTH_CLIENT_ID"
        data-redirect-uri="https://arcadevault.example.com/auth/callback"></script>
<script>
  document.querySelector('#sign-in').addEventListener('click', () => CagedDragon.signIn());
  // On the exact callback page, after the SDK is loaded:
  CagedDragon.complete().then(session => {
    if (session) console.log('Signed in:', session.user);
  }).catch(console.error);
</script>
```

The project pins `@supabase/supabase-js` to 2.119.0 so the consent/account grant wrappers use the released API (`listGrants()` and `revokeGrant({ clientId })`). The admin product form in `/admin` follows the same OAuth-client creation/deletion path as this CLI; both require an exact callback URL. The SDK uses OAuth authorization-code + PKCE (S256), `state`, and `nonce`. It exchanges the code at Supabase Auth and loads the user through the Auth user endpoint. Access tokens are held in memory, not localStorage. The browser SDK is a convenience for public clients; do not treat browser code as a trusted authorization boundary.

## Production recommendation: BFF

For production websites, prefer a backend-for-frontend:

1. Backend creates the PKCE verifier/challenge and an unpredictable `state` bound to a short-lived server-side session.
2. Browser is redirected to the portal's Supabase OAuth authorize endpoint.
3. Portal authenticates the user and asks for consent when required.
4. Supabase redirects to the exact registered callback with a one-time authorization code.
5. Backend validates `state`, exchanges the code with the verifier, calls `verifyCagedDragon()` from `docs/verify-id-token.mjs` with the exact OAuth `client_id` and expected nonce, and stores refresh tokens server-side.
6. Backend creates its own Secure, HttpOnly, SameSite session cookie for that product.

Never pass the central portal's cookies or refresh token between websites. Never accept an arbitrary `return_to` URL. Verify the JWT signature and claims server-side using the issuer's JWKS and a maintained OIDC/JWT library. Check authorization at the product backend and database (RLS), not only in the UI.

## Sign-out

Sign out of the product's own BFF session first. This is local sign-out and does not silently end other product sessions. To end the central Caged Dragon session everywhere, explicitly redirect to the portal logout endpoint with `scope=global` and a registered product redirect destination.

## Security checklist

- HTTPS everywhere except local development.
- Exact callback allow-list; no wildcard, open redirect or user-controlled callback.
- Authorization code + PKCE S256; validate state and nonce.
- Validate ID-token signature using Supabase JWKS, plus exact issuer, OAuth client ID audience, nonce, and expiry.
- No implicit grant; no client secret in browser apps.
- Tokens never in URL after callback cleanup, localStorage, analytics, logs or error reports.
- Short session lifetimes, rotation, revocation and global sign-out support.
- Enforce MFA for privileged actions at backend/database level.
- Use Supabase Auth leaked-password protection and appropriate password/OTP rate limits.
