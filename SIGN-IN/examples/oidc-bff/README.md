# Caged Dragon OIDC backend-for-frontend example

This small Node.js example keeps OAuth access and refresh tokens on the product server. The browser receives only an opaque, `HttpOnly`, `SameSite=Lax` session cookie. The callback validates PKCE-bound state and nonce, then verifies the ID-token signature, issuer, audience, algorithm, expiry and subject against the Caged Dragon Supabase JWKS.

## Setup

1. Enable the Supabase OAuth Server for the CAGED_DRAGON project, set its Authorization Path to `/oauth/consent`, and choose an asymmetric JWT signing key (RS256 or ES256).
2. Register the actual product origin and exact callback `https://your-product.example.com/auth/callback` in the portal's `/admin` page. Copy the resulting public client ID.
3. Copy `.env.example` to `.env` and fill in the client ID, exact callback URI and product public origin. The issuer is the Supabase Auth issuer shown in the example.
4. Install and run:

   ```bash
   npm install
   npm start
   ```

5. Open the product at its HTTPS origin and choose **Sign in with Caged Dragon**.

## Routes

- `GET /login` starts authorization code + PKCE (S256).
- `GET /auth/callback` exchanges the one-time authorization code and verifies the ID token.
- `GET /api/me` returns a safe user profile; no token is returned to the browser.
- `POST /logout` ends this product's local session only.
- `GET /healthz` is a simple health endpoint.

## Production requirements

This example intentionally uses an in-memory session map to remain small and easy to inspect. **Do not run it as a multi-instance or production session store unchanged.** Replace the map with a durable shared session store (for example, Redis or a database) and encrypt refresh tokens at rest. Add CSRF protection appropriate to your product's forms, request logging with sensitive-field redaction, session rotation, absolute/idle expiration, rate limits and operational monitoring. Keep TLS enabled and never move the refresh token or Supabase service-role key to browser code.

Product logout is local by default. Users can revoke the product's central OAuth grant from their Caged Dragon account's **Connected apps** section.
