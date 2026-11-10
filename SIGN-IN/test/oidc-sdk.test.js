import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

const sdk = await readFile(new URL('../public/sdk.js', import.meta.url), 'utf8');
const AUTH_URL = 'https://gbeurqibcfvquacasofq.supabase.co/auth/v1';
const CLIENT_ID = 'example-public-client';
const REDIRECT = 'https://product.example.test/auth/callback';

function browser(fetchImpl = async () => { throw new Error('Unexpected fetch'); }) {
  const values = new Map();
  const sessionStorage = {
    getItem: k => values.has(k) ? values.get(k) : null,
    setItem: (k, v) => values.set(k, String(v)),
    removeItem: k => values.delete(k),
  };
  const location = {
    origin: 'https://product.example.test',
    pathname: '/auth/callback',
    search: '', hash: '', href: REDIRECT,
    assigned: null,
    assign(url) { this.assigned = String(url); },
  };
  const window = { location };
  const env = {
    document: { currentScript: { src: 'https://caged-dragon-auth.vercel.app/sdk.js', dataset: {
      authUrl: AUTH_URL, clientId: CLIENT_ID, redirectUri: REDIRECT,
    } } },
    window, location, sessionStorage,
    history: { replaceState(_a, _b, url) { location.cleanedUrl = url; } },
    crypto: webcrypto, TextEncoder, Uint8Array, URL, URLSearchParams,
    btoa: globalThis.btoa, atob: globalThis.atob,
    fetch: fetchImpl, Date, JSON, Object, String, Error, Number, Math,
  };
  vm.runInNewContext(sdk, env, { filename: 'public/sdk.js' });
  return { api: window.CagedDragon, location, values };
}

const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');

 test('authorization starts at the Supabase issuer and uses PKCE S256, state and nonce', async () => {
  const b = browser();
  await b.api.signIn();
  const u = new URL(b.location.assigned);
  assert.equal(u.origin, 'https://gbeurqibcfvquacasofq.supabase.co');
  assert.equal(u.pathname, '/auth/v1/oauth/authorize');
  assert.equal(u.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(u.searchParams.get('redirect_uri'), REDIRECT);
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(u.searchParams.get('code_challenge'));
  const pending = JSON.parse(b.values.get('cd_oidc_pending'));
  assert.equal(u.searchParams.get('state'), pending.state);
  assert.equal(u.searchParams.get('nonce'), pending.nonce);
});

test('callback exchanges a code at Supabase and checks state, issuer, audience and nonce', async () => {
  let tokenBody, pendingForToken;
  const b = browser(async (url, options = {}) => {
    if (String(url) === `${AUTH_URL}/oauth/token`) {
      tokenBody = new URLSearchParams(options.body);
      const claims = { iss: AUTH_URL, aud: CLIENT_ID, nonce: pendingForToken.nonce, sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 };
      const idToken = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(claims)}.fake-signature`;
      return { ok: true, json: async () => ({ access_token: 'access', refresh_token: 'refresh', id_token: idToken, expires_in: 3600 }) };
    }
    if (String(url) === `${AUTH_URL}/oauth/userinfo`) return { ok: true, json: async () => ({ sub: 'user-123', email: 'user@example.test', email_verified: true }) };
    throw new Error(`Unexpected fetch ${url}`);
  });
  await b.api.signIn();
  const pending = JSON.parse(b.values.get('cd_oidc_pending'));
  pendingForToken = pending;
  b.location.search = `?code=single-use-code&state=${encodeURIComponent(pending.state)}&iss=${encodeURIComponent(AUTH_URL)}`;
  const session = await b.api.complete();
  assert.equal(tokenBody.get('grant_type'), 'authorization_code');
  assert.equal(tokenBody.get('code'), 'single-use-code');
  assert.equal(tokenBody.get('code_verifier'), pending.verifier);
  assert.equal(session.user.email, 'user@example.test');
  assert.equal(session.accessToken, 'access');
  const publicSession = b.api.getSession();
  assert.equal(publicSession.refresh_token, undefined);
  assert.equal('client_id' in publicSession, false);
  assert.equal(b.values.has('cd_oidc_pending'), false);
});

test('callback rejects a mismatched state before exchanging the code', async () => {
  let fetchCount = 0;
  const b = browser(async () => { fetchCount++; throw new Error('must not fetch'); });
  await b.api.signIn();
  b.location.search = '?code=single-use-code&state=wrong-state';
  await assert.rejects(() => b.api.complete(), /state validation failed/i);
  assert.equal(fetchCount, 0);
});

test('denied authorization callbacks also require the original state', async () => {
  const b = browser();
  await b.api.signIn();
  const pending = JSON.parse(b.values.get('cd_oidc_pending'));
  b.location.search = '?error=access_denied&state=wrong-state';
  await assert.rejects(() => b.api.complete(), /state validation failed/i);
  await b.api.signIn();
  const nextPending = JSON.parse(b.values.get('cd_oidc_pending'));
  b.location.search = `?error=access_denied&state=${encodeURIComponent(nextPending.state)}`;
  await assert.rejects(() => b.api.complete(), /cancelled or denied/i);
  assert.equal(b.values.has('cd_oidc_pending'), false);
});

test('refresh rotates the access token and uses only granted UserInfo scopes', async () => {
  let pendingForToken, tokenCount = 0, userInfoCount = 0;
  const b = browser(async (url, options = {}) => {
    if (String(url) === `${AUTH_URL}/oauth/token`) {
      const body = new URLSearchParams(options.body);
      tokenCount++;
      if (body.get('grant_type') === 'authorization_code') {
        const claims = { iss: AUTH_URL, aud: CLIENT_ID, nonce: pendingForToken.nonce, sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 };
        return { ok: true, json: async () => ({ access_token: 'access-1', refresh_token: 'refresh-1', id_token: `${b64url({ alg: 'RS256' })}.${b64url(claims)}.sig`, expires_in: 3600 }) };
      }
      assert.equal(body.get('grant_type'), 'refresh_token');
      assert.equal(body.get('refresh_token'), 'refresh-1');
      return { ok: true, json: async () => ({ access_token: 'access-2', expires_in: 3600 }) };
    }
    if (String(url) === `${AUTH_URL}/oauth/userinfo`) {
      userInfoCount++;
      assert.equal(options.headers.Authorization, `Bearer ${userInfoCount === 1 ? 'access-1' : 'access-2'}`);
      return { ok: true, json: async () => ({ sub: 'user-123', email: 'user@example.test', email_verified: true }) };
    }
    throw new Error(`Unexpected fetch ${url}`);
  });
  await b.api.signIn();
  pendingForToken = JSON.parse(b.values.get('cd_oidc_pending'));
  b.location.search = `?code=abc&state=${encodeURIComponent(pendingForToken.state)}`;
  await b.api.complete();
  const refreshed = await b.api.refreshSession();
  assert.equal(tokenCount, 2);
  assert.equal(userInfoCount, 2);
  assert.equal(refreshed.access_token, 'access-2');
  assert.equal(refreshed.user.id, 'user-123');
  assert.equal('refresh_token' in refreshed, false);
});

test('product sign-out is local by default; global sign-out is explicit', async () => {
  const b = browser();
  await b.api.signIn();
  b.location.assigned = null;
  await b.api.signOut();
  assert.equal(b.location.assigned, null);
  assert.equal(b.api.getSession(), null);
  await b.api.signOut({ global: true });
  const u = new URL(b.location.assigned);
  assert.equal(u.origin, 'https://caged-dragon-auth.vercel.app');
  assert.equal(u.pathname, '/logout');
  assert.equal(u.searchParams.get('redirect_to'), REDIRECT);
  assert.equal(u.searchParams.get('scope'), 'global');
});
