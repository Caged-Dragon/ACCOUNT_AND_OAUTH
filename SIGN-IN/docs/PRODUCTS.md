# Connecting a Caged Dragon product (OIDC + PKCE)

## Register a product

Run this from the portal project using the CAGED_DRAGON project's server-only key:

```bash
npm run products -- add arcadevault "ArcadeVault" https://arcadevault.example.com https://arcadevault.example.com/auth/callback
npm run products -- list
npm run products -- off arcadevault
```

Use an exact callback URL for every environment. No wildcard redirect URLs are accepted. The registration creates a public OAuth client (`token_endpoint_auth_method=none`) and stores its client ID and callback allow-list in `login_client_apps`. Never ship the Supabase secret/service-role key to a product.

## Browser integration

Load the SDK with the public client ID and callback URI:

```html
<script src="https://YOUR-PORTAL-HOST/sdk.js"
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

The SDK uses OAuth authorization-code + PKCE (S256), `state`, and `nonce`. It exchanges the code at Supabase Auth and loads the user through the Auth user endpoint. Access tokens are held in memory, not localStorage. The browser SDK is a convenience for public clients; do not treat browser code as a trusted authorization boundary.

## Production recommendation: BFF

For production websites, prefer a backend-for-frontend:

1. Backend creates the PKCE verifier/challenge and an unpredictable `state` bound to a short-lived server-side session.
2. Browser is redirected to the portal's Supabase OAuth authorize endpoint.
3. Portal authenticates the user and asks for consent when required.
4. Supabase redirects to the exact registered callback with a one-time authorization code.
5. Backend validates `state`, exchanges the code with the verifier, validates issuer/audience/nonce/signature/expiry, and stores refresh tokens server-side.
6. Backend creates its own Secure, HttpOnly, SameSite session cookie for that product.

Never pass the central portal's cookies or refresh token between websites. Never accept an arbitrary `return_to` URL. Verify the JWT signature and claims server-side using the issuer's JWKS and a maintained OIDC/JWT library. Check authorization at the product backend and database (RLS), not only in the UI.

## Sign-out

Sign out of the product's own BFF session first. To also end the central portal session, navigate the user to the portal logout endpoint with a redirect destination that the portal has registered and validated. A product logout must not silently sign the user out of every other product unless the user explicitly chooses global sign-out.

## Security checklist

- HTTPS everywhere except local development.
- Exact callback allow-list; no wildcard, open redirect or user-controlled callback.
- Authorization code + PKCE S256; validate state and nonce.
- No implicit grant; no client secret in browser apps.
- Tokens never in URL, localStorage, analytics, logs or error reports.
- Short session lifetimes, rotation, revocation and global sign-out support.
- Enforce MFA for privileged actions at backend/database level.
- Use Supabase Auth leaked-password protection and appropriate password/OTP rate limits.
