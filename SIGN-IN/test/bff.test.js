import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bff = await readFile(new URL('../examples/oidc-bff/server.mjs', import.meta.url), 'utf8');

test('BFF uses authorization code + PKCE and keeps tokens server-side', () => {
  assert.match(bff, /code_challenge_method: 'S256'/);
  assert.match(bff, /code_verifier: pending\.verifier/);
  assert.match(bff, /HttpOnly; SameSite=Lax/);
  assert.match(bff, /createRemoteJWKSet/);
  assert.match(bff, /jwtVerify\(tokens\.id_token, jwks/);
  assert.match(bff, /issuer: AUTH_ISSUER, audience: CLIENT_ID/);
  assert.match(bff, /payload\.nonce !== pending\.nonce/);
  assert.doesNotMatch(bff, /localStorage/);
  assert.match(bff, /JSON\.stringify\(\{ authenticated: true, user:/);
  assert.doesNotMatch(bff, /JSON\.stringify\(\{[^}]*access_token/);
});

test('BFF restricts callback origin, issuer and insecure cookies', () => {
  assert.match(bff, /redirectUrl\.origin !== productOrigin\.origin/);
  assert.match(bff, /returnedIssuer\.replace/);
  assert.match(bff, /COOKIE_SECURE=0 is allowed only for localhost development/);
  assert.match(bff, /req\.headers\.origin === PUBLIC_ORIGIN/);
});

const demo = await readFile(new URL('../examples/demo-product/index.html', import.meta.url), 'utf8');
test('demo product uses the OIDC SDK and the registered exact callback', () => {
  assert.match(demo, /data-auth-url="__OIDC_ISSUER__"/);
  assert.match(demo, /data-client-id="__CLIENT_ID__"/);
  assert.match(demo, /data-redirect-uri="http:\/\/localhost:5555\/auth\/callback"/);
  assert.match(demo, /CagedDragon\.complete\(\)/);
  assert.doesNotMatch(demo, /api\/token|id_token_claims|Sign in as a developer/);
});
