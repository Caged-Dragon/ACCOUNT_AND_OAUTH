// Copy this helper into a product backend. Install with: npm install jose
// Verify every ID token server-side before using its claims for authorization.
import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_ISSUER = process.env.CAGED_DRAGON_OIDC_ISSUER;
if (!AUTH_ISSUER) throw new Error('CAGED_DRAGON_OIDC_ISSUER is required.');
const issuerUrl = new URL(AUTH_ISSUER);
if (issuerUrl.protocol !== 'https:' || issuerUrl.pathname !== '/auth/v1') {
  throw new Error('CAGED_DRAGON_OIDC_ISSUER must be the HTTPS Supabase /auth/v1 issuer.');
}
const JWKS = createRemoteJWKSet(new URL(issuerUrl.href.replace(/\/$/, '') + '/.well-known/jwks.json'));

/**
 * @param {string} idToken Supabase-issued OIDC ID token.
 * @param {string} oauthClientId Exact public OAuth client_id issued for this product.
 * @param {string} [expectedNonce] Nonce generated for the corresponding authorization request.
 */
export async function verifyCagedDragon(idToken, oauthClientId, expectedNonce) {
  if (typeof oauthClientId !== 'string' || !oauthClientId.trim()) {
    throw new Error('The registered Caged Dragon OAuth client ID is required.');
  }
  const { payload, protectedHeader } = await jwtVerify(idToken, JWKS, {
    issuer: issuerUrl.href.replace(/\/$/, ''),
    audience: oauthClientId,
    clockTolerance: 5,
    algorithms: ['RS256', 'ES256'],
  });
  if (!['RS256', 'ES256'].includes(protectedHeader.alg)) {
    throw new Error('Unsupported Caged Dragon ID-token signing algorithm.');
  }
  if (expectedNonce && payload.nonce !== expectedNonce) {
    throw new Error('Caged Dragon ID-token nonce validation failed.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Caged Dragon ID token has no subject.');
  }
  return payload;
}
