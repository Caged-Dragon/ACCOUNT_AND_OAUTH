// End-to-end flows against a fake Supabase (see mock-supabase.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { startMock } from './mock-supabase.js';

const MPORT = 4100 + Math.floor(Math.random() * 40), PORT = MPORT + 100, base = `http://127.0.0.1:${PORT}`;
const PRODUCT = 'http://localhost:5555', PROD_URL = PRODUCT + '/app?x=1';
let mock, proc;

class Client {
  constructor() { this.jar = new Map(); }
  cookie() { return [...this.jar].map(([k, v]) => k + '=' + v).join('; '); }
  store(res) { for (const c of res.headers.getSetCookie()) { const kv = c.split(';')[0], i = kv.indexOf('='), k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    if (/expires=Thu, 01 Jan 1970/i.test(c) || v === '') this.jar.delete(k); else this.jar.set(k, v); } }
  async call(method, path, body, headers = {}) {
    const res = await fetch(base + path, { method, redirect: 'manual', headers: { Cookie: this.cookie(), ...(method !== 'GET' ? { 'Content-Type': 'application/json', Origin: base } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    this.store(res); const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text, res };
  }
  post(p, b) { return this.call('POST', p, b ?? {}); }
  get(p) { return this.call('GET', p); }
}
const exchange = async (redirect, origin = PRODUCT) => {
  const code = new URL(redirect).searchParams.get('code');
  const r = await fetch(base + '/api/token', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ code }) });
  return { status: r.status, json: await r.json() };
};
const PW = 'Str0ng-pass-9';
const signup = (c, email, extra = {}) => c.post('/api/email', { email, password: PW, mode: 'signup', ...extra });
const signin = (c, email, extra = {}) => c.post('/api/email', { email, password: PW, mode: 'signin', ...extra });
const claimsOf = t => JSON.parse(Buffer.from(t.split('.')[1], 'base64url'));

before(async () => {
  mock = await startMock(MPORT);
  mock.st.t.login_client_apps.push({ id: 'app1', slug: 'demo', name: 'Demo Product', allowed_origin: PRODUCT, is_active: true });
  proc = spawn(process.execPath, ['server.js'], { stdio: 'inherit', env: { PATH: process.env.PATH, SUPABASE_URL: `http://127.0.0.1:${MPORT}`, SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'b',
    LOGIN_CODE_KEY: crypto.randomBytes(32).toString('hex'), PUBLIC_URL: base, PORT: String(PORT), UNVERIFIED_SIGNUP: '1', ADMIN_EMAILS: 'admin@ex.com',
    ALLOW_ACCOUNT_DELETION: '1', AUTH_RATE_LIMIT: '1000', AUTH_RATE_LIMIT_EMAIL: '1000' } });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/healthz'); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error('server did not start');
});
after(() => { proc?.kill(); mock?.server.close(); });

test('sign up, go back to the product with a one-time code, and verify the signed ID token', async () => {
  const c = new Client(), r = await signup(c, 'a@ex.com', { redirect_to: PROD_URL, role: 'user' });
  assert.equal(r.status, 200, r.text); assert.match(r.json.redirect, /^http:\/\/localhost:5555\/app\?x=1&code=/);
  const t = await exchange(r.json.redirect); assert.equal(t.status, 200);
  assert.ok(t.json.access_token && t.json.refresh_token); assert.equal(t.json.role, 'user'); assert.equal(t.json.mfa_verified, false); assert.equal(t.json.mfa_enrolled, false);
  const jwks = (await (await fetch(base + '/.well-known/jwks.json')).json()).keys[0], [h, p, sig] = t.json.id_token.split('.');
  assert.ok(crypto.verify(null, Buffer.from(h + '.' + p), crypto.createPublicKey({ key: jwks, format: 'jwk' }), Buffer.from(sig, 'base64url')), 'signature');
  const cl = claimsOf(t.json.id_token); assert.equal(cl.aud, 'demo'); assert.equal(cl.email, 'a@ex.com'); assert.equal(cl.mfa, false); assert.ok(cl.exp > cl.iat);
  assert.equal((await exchange(r.json.redirect)).status, 400, 'code is single use');
});
test('a code only works for the product it was made for', async () => {
  const r = await signup(new Client(), 'wrongorigin@ex.com', { redirect_to: PROD_URL });
  assert.equal((await exchange(r.json.redirect, 'https://evil.example')).status, 403);
});
test('weak passwords are refused', async () => {
  for (const password of ['password123', '11111111', 'weakmail@ex.com']) assert.equal((await new Client().post('/api/email', { email: 'weakmail@ex.com', password, mode: 'signup' })).status, 400, password);
});
test('unregistered products never get a redirect', async () => {
  const r = await signin(new Client(), 'a@ex.com', { redirect_to: 'https://evil.example/steal' });
  assert.equal(r.status, 200); assert.equal(r.json.redirect, null); assert.equal(r.json.account.identifier, 'a@ex.com');
});
test('wrong password gives a generic error', async () => {
  const r = await new Client().post('/api/email', { email: 'a@ex.com', password: 'Wrong-pass-123', mode: 'signin' });
  assert.equal(r.status, 400); assert.match(r.json.error, /didn’t work/);
});
test('developer sign-in needs the developer profile, then works', async () => {
  const c = new Client(), r = await signin(c, 'a@ex.com', { role: 'developer', redirect_to: PROD_URL });
  assert.equal(r.json.needsDeveloper, true); assert.equal(r.json.redirect, undefined);
  const e = await c.post('/api/developer/enable', { role: 'developer', redirect_to: PROD_URL });
  assert.match(e.json.redirect, /code=/); const t = await exchange(e.json.redirect);
  assert.equal(t.json.role, 'developer'); assert.ok(t.json.roles.includes('developer'));
});
test('developer sign-up creates the developer profile straight away', async () => {
  const r = await signup(new Client(), 'dev@ex.com', { role: 'developer', redirect_to: PROD_URL });
  const t = await exchange(r.json.redirect); assert.equal(t.json.role, 'developer'); assert.ok(t.json.roles.includes('developer'));
});
test('a product can require two-step; people without it are sent to set it up', async () => {
  const r = await signin(new Client(), 'a@ex.com', { redirect_to: PROD_URL, require_mfa: true });
  assert.equal(r.json.needsMfaSetup, true); assert.equal(r.json.redirect, undefined);
});
test('two-step: code asked, wrong code refused, right code passes and is shown to the product', async () => {
  const c = new Client(); await signup(c, 'mfa@ex.com'); mock.addFactor('mfa@ex.com'); const c2 = new Client();
  const r = await signin(c2, 'mfa@ex.com', { redirect_to: PROD_URL, require_mfa: true });
  assert.equal(r.json.mfa, true); assert.equal(r.json.redirect, undefined); assert.ok(c2.jar.has('cd_mfa')); assert.ok(!c2.jar.has('cd_at'), 'no session before the code');
  assert.equal((await c2.post('/api/mfa/verify', { code: '000000' })).status, 400);
  const v = await c2.post('/api/mfa/verify', { code: '123456' }); assert.equal(v.status, 200, v.text); assert.match(v.json.redirect, /code=/);
  const t = await exchange(v.json.redirect); assert.equal(t.json.mfa_verified, true); assert.equal(t.json.mfa_enrolled, true);
  const cl = claimsOf(t.json.id_token); assert.equal(cl.mfa, true); assert.ok(cl.amr.includes('totp'));
});
test('turning on two-step later cannot be skipped with an older sign-in', async () => {
  const c = new Client(); await signup(c, 'later@ex.com'); assert.ok(c.jar.has('cd_at'));
  mock.addFactor('later@ex.com');
  const r = await c.post('/api/continue', { redirect_to: PROD_URL });
  assert.equal(r.json.mfa, true, 'must ask for the code'); assert.equal(r.json.redirect, undefined);
});
test('one tap works for someone signed in without two-step', async () => {
  const c = new Client(); await signup(c, 'tap@ex.com');
  const r = await c.post('/api/continue', { redirect_to: PROD_URL }); assert.match(r.json.redirect, /code=/);
  const ctx = (await c.get('/api/context?redirect_to=' + encodeURIComponent(PROD_URL))).json;
  assert.equal(ctx.client.name, 'Demo Product'); assert.equal(ctx.account.identifier, 'tap@ex.com');
});
test('sign-out ends the sign-in and only returns to registered products', async () => {
  const c = new Client(); await signup(c, 'out@ex.com');
  const r1 = await c.get('/logout?redirect_to=' + encodeURIComponent(PROD_URL)); assert.equal(r1.status, 302); assert.equal(r1.res.headers.get('location'), PROD_URL);
  assert.ok(!c.jar.has('cd_at')); assert.equal((await c.get('/api/account')).status, 401);
  const c2 = new Client(); await signup(c2, 'out2@ex.com');
  assert.equal((await c2.get('/logout?redirect_to=https://evil.example')).res.headers.get('location'), '/');
});
test('consent screen: signed-out goes to sign-in; two-step users must enter the code first; bad requests are explained', async () => {
  const r = await new Client().call('GET', '/oauth/consent?authorization_id=abc'); assert.equal(r.status, 302); assert.match(r.res.headers.get('location'), /^\/\?next=/);
  const c = new Client(); await signup(c, 'consent@ex.com');
  const gone = await c.get('/oauth/consent?authorization_id=abc'); assert.equal(gone.status, 400); assert.match(gone.text, /Request expired/);
  mock.addFactor('consent@ex.com'); const need = await c.get('/oauth/consent?authorization_id=abc'); assert.equal(need.status, 302);
});
test('account page data, change password, passkey list', async () => {
  const c = new Client(); await signup(c, 'acct@ex.com');
  const a = (await c.get('/api/account')).json; assert.equal(a.identifier, 'acct@ex.com'); assert.deepEqual(a.roles, ['user']); assert.equal(a.canDelete, true); assert.equal(a.canChangeEmail, false); assert.equal(a.isAdmin, false);
  assert.equal((await c.post('/api/account/password', { current: PW, password: 'password123' })).status, 400);
  assert.equal((await c.post('/api/account/password', { current: 'nope-nope-1', password: 'Another-pass-7' })).status, 400);
  assert.equal((await c.post('/api/account/password', { current: PW, password: 'Another-pass-7' })).status, 200);
  assert.deepEqual((await c.get('/api/passkey/list')).json.passkeys, []);
  assert.equal((await c.post('/api/account/email', { email: 'new@ex.com', password: 'Another-pass-7' })).status, 403, 'needs email service');
});
test('admin area is invisible to others and works for admins', async () => {
  const user = new Client(); await signup(user, 'normal@ex.com'); assert.equal((await user.get('/api/admin/overview')).status, 404);
  const a = new Client(); await signup(a, 'admin@ex.com');
  const o = await a.get('/api/admin/overview'); assert.equal(o.status, 200, o.text); assert.ok(o.json.stats.accounts >= 1); assert.equal(o.json.products[0].slug, 'demo');
  const registered = await a.post('/api/admin/products', {
    slug: 'game', name: 'Game Product', origin: 'https://game.example.com',
    redirect_uri: 'https://game.example.com/auth/callback'
  });
  assert.equal(registered.status, 200, registered.text);
  assert.ok(registered.json.client_id);
  assert.ok(mock.st.oauthClients.has(registered.json.client_id), 'creates a real public OAuth client');
  assert.equal((await a.post('/api/admin/products', { slug: 'bad', name: 'Bad', origin: 'http://game.example.com', redirect_uri: 'http://game.example.com/auth/callback' })).status, 400);
  assert.equal((await a.post('/api/admin/products', { slug: 'mismatch', name: 'Mismatch', origin: 'https://game.example.com', redirect_uri: 'https://evil.example/auth/callback' })).status, 400);
  const listed = (await a.get('/api/admin/overview')).json.products.find(p => p.slug === 'game');
  assert.equal(listed.oauth_client_id, registered.json.client_id);
  assert.deepEqual(listed.redirect_uris, ['https://game.example.com/auth/callback']);
  const removed = await a.post('/api/admin/products/delete', { slug: 'game' });
  assert.equal(removed.status, 200, removed.text);
  assert.equal(mock.st.oauthClients.has(registered.json.client_id), false, 'removing a product also removes its OAuth client');
  assert.ok(!(await a.get('/api/admin/overview')).json.products.some(p => p.slug === 'game'));
});
test('deleting an account needs the right password and removes the person everywhere', async () => {
  const c = new Client(); await signup(c, 'bye@ex.com');
  assert.equal((await c.post('/api/account/delete', { confirm: 'delete', password: PW })).status, 400);
  assert.equal((await c.post('/api/account/delete', { confirm: 'DELETE', password: 'nope-nope-1' })).status, 400);
  assert.ok(mock.byEmail('bye@ex.com'));
  assert.equal((await c.post('/api/account/delete', { confirm: 'DELETE', password: PW })).status, 200);
  assert.ok(!mock.byEmail('bye@ex.com')); assert.equal((await c.get('/api/account')).status, 401);
});
test('private pages and the API refuse requests from other websites', async () => {
  const c = new Client(); await signup(c, 'csrf@ex.com');
  const r = await fetch(base + '/api/account/signout-all', { method: 'POST', headers: { Cookie: c.cookie(), Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test('products can call the token endpoint from the browser (CORS) only from their own address', async () => {
  const ok = await fetch(base + '/api/token', { method: 'OPTIONS', headers: { Origin: PRODUCT, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), PRODUCT);
  assert.equal((await fetch(base + '/api/token', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).status, 403);
});

test('OAuth consent displays the product request, records an approved grant, and redirects back', async () => {
  const c = new Client(); await signup(c, 'oauth-consent@ex.com');
  const user = mock.byEmail('oauth-consent@ex.com');
  const client = { id: 'oauth-client-demo', name: 'Demo OAuth Product', uri: 'https://demo.example.test', logo_uri: '' };
  mock.st.t.login_client_apps.push({ id: 'oauth-app-row', slug: 'oauth-demo', name: 'Demo OAuth Product', allowed_origin: 'https://demo.example.test', is_active: true,
    oauth_client_id: client.id, redirect_uris: ['https://demo.example.test/auth/callback'] });
  mock.st.oauthAuthorizations.set('oauth-auth-1', { authorization_id: 'oauth-auth-1', user_id: user.id,
    redirect_uri: 'https://demo.example.test/auth/callback', client, scope: 'openid email profile', state: 'state-demo' });
  const page = await c.get('/oauth/consent?authorization_id=oauth-auth-1&lang=en');
  assert.equal(page.status, 200); assert.match(page.text, /Demo OAuth Product/); assert.match(page.text, /See your email address/);
  const decision = await c.post('/oauth/decision', { authorization_id: 'oauth-auth-1', decision: 'approve' });
  assert.equal(decision.status, 303); assert.match(decision.res.headers.get('location'), /^https:\/\/demo\.example\.test\/auth\/callback\?code=mock-authorization-code&state=state-demo$/);
  assert.equal(mock.st.oauthGrants.length, 1); assert.equal(mock.st.login_app_grants.length, 1);
  assert.ok(mock.st.login_events.some(e => e.method === 'oauth' && e.client_app_id === 'oauth-app-row'));
});

test('account can list and revoke an OAuth client grant', async () => {
  const c = new Client(); await signup(c, 'oauth-revoke@ex.com');
  const user = mock.byEmail('oauth-revoke@ex.com');
  mock.st.oauthGrants.push({ user_id: user.id, client_id: 'oauth-client-revoke', client: { id: 'oauth-client-revoke', name: 'Old Product', uri: 'https://old.example.test', logo_uri: '' }, scopes: ['email', 'profile'], granted_at: new Date().toISOString() });
  mock.st.t.login_client_apps.push({ id: 'local-oauth-revoke', slug: 'old-product', name: 'Old Product', allowed_origin: 'https://old.example.test', is_active: true, oauth_client_id: 'oauth-client-revoke', redirect_uris: ['https://old.example.test/callback'] });
  mock.st.t.login_app_grants.push({ user_id: user.id, client_app_id: 'local-oauth-revoke', last_used_at: new Date().toISOString() });
  const account = await c.get('/api/account');
  assert.equal(account.status, 200); assert.equal(account.json.oauthAvailable, true);
  assert.equal(account.json.oauthGrants[0].clientId, 'oauth-client-revoke');
  const revoked = await c.post('/api/account/oauth-grants/revoke', { client_id: 'oauth-client-revoke' });
  assert.equal(revoked.status, 200); assert.equal(mock.st.oauthGrants.length, 0);
  assert.equal(mock.st.t.login_app_grants.length, 0, 'portal-side grant record is removed too');
  assert.deepEqual((await c.get('/api/account')).json.oauthGrants, []);
});
