// Run this in your product's SERVER to trust who signed in and whether two-step was done.
// npm i jose
import { createRemoteJWKSet, jwtVerify } from 'jose';

const LOGIN_URL = process.env.LOGIN_URL;              // e.g. https://login.yourdomain.com
const JWKS = createRemoteJWKSet(new URL(LOGIN_URL + '/.well-known/jwks.json'));

export async function verifyCagedDragon(idToken, productSlug) {
  const { payload } = await jwtVerify(idToken, JWKS, { issuer: LOGIN_URL, audience: productSlug });
  // payload: { sub, email, phone, role, roles, mfa (true = two-step done), amr, auth_time }
  return payload;
}
