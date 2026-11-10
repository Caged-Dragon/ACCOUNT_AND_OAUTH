import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const PORT = 3960 + Math.floor(Math.random() * 30), base = `http://127.0.0.1:${PORT}`;
const env = { PATH: process.env.PATH, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'b',
  LOGIN_CODE_KEY: crypto.randomBytes(32).toString('hex'), PUBLIC_URL: base, PORT: String(PORT) };
let proc;
const post = (path, body, origin) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });

before(async () => {
  proc = spawn(process.execPath, ['server.js'], { env, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/healthz'); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error('server did not start');
});
after(() => proc.kill());

test('refuses to start without its settings', () => {
  const r = spawnSync(process.execPath, ['server.js'], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /Missing environment variables/);
});
test('health check works', async () => { assert.deepEqual(await (await fetch(base + '/healthz')).json(), { ok: true }); });
test('pages are served with a strict content policy', async () => {
  for (const p of ['/', '/account', '/developer']) {
    const r = await fetch(base + p); assert.equal(r.status, 200);
    const csp = r.headers.get('content-security-policy'); assert.match(csp, /script-src 'self'/); assert.doesNotMatch(csp, /unsafe-inline.*script|script-src[^;]*unsafe/);
  }
});
test('logo and favicon files exist', async () => {
  for (const f of ['/logo.webp', '/favicon.ico', '/favicon-16.png', '/favicon-32.png', '/favicon-192.png', '/apple-touch-icon.png', '/product-128.png', '/product-512.png', '/company-128.png', '/company-256.png', '/site.webmanifest', '/sdk.js']) assert.equal((await fetch(base + f)).status, 200, f);
});
test('sdk can be loaded from other sites', async () => { assert.equal((await fetch(base + '/sdk.js')).headers.get('cross-origin-resource-policy'), 'cross-origin'); });
test('cross-site posts are blocked', async () => {
  for (const p of ['/api/email', '/api/continue', '/api/mfa/verify', '/api/password/forgot', '/api/dev/apps', '/api/account/password', '/oauth/decision', '/api/passkey/login/options', '/api/passkey/register/verify', '/api/passkey/delete'])
    assert.equal((await post(p, {}, 'https://evil.example')).status, 403, p);
});
test('bad input is rejected', async () => {
  assert.equal((await post('/api/email', { email: 'nope', password: 'x', mode: 'signin' }, base)).status, 400);
  assert.equal((await post('/api/mfa/verify', { code: 'abc' }, base)).status, 400);
});
test('signed-out people cannot reach private APIs', async () => {
  for (const p of ['/api/account', '/api/dev/apps']) assert.equal((await fetch(base + p)).status, 401, p);
});
test('token endpoint only answers registered origins', async () => { assert.equal((await post('/api/token', { code: 'x'.repeat(30) }, 'https://evil.example')).status, 403); });
test('consent page needs a request id', async () => { assert.equal((await fetch(base + '/oauth/consent')).status, 400); });
test('internal redirect cannot leave the site', async () => {
  const r = await fetch(base + '/oauth/consent?authorization_id=abc', { redirect: 'manual' });
  assert.ok([302, 400].includes(r.status)); if (r.status === 302) assert.match(r.headers.get('location'), /^\/\?next=/);
});

test('switched-off features say so', async () => {
  assert.equal((await post('/api/phone/send', { phone: '+919876543210' }, base)).status, 403);
  assert.equal((await post('/api/password/forgot', { email: 'a@b.co' }, base)).status, 403);
  const c = await (await fetch(base + '/api/context')).json();
  assert.deepEqual(c.features, { sms: false, mail: false, passkeys: true });
});
test('publishes signing keys for ID tokens', async () => {
  const k = (await (await fetch(base + '/.well-known/jwks.json')).json()).keys[0];
  assert.equal(k.kty, 'OKP'); assert.equal(k.crv, 'Ed25519'); assert.equal(k.alg, 'EdDSA'); assert.ok(k.kid && k.x && !k.d);
});
test('passkey sign-in starts with a challenge', async () => {
  const r = await post('/api/passkey/login/options', {}, base); assert.equal(r.status, 200);
  assert.ok((await r.json()).challenge); assert.match(r.headers.get('set-cookie') || '', /cd_pk=/);
});
test('consent screen speaks Tamil and Hindi', async () => {
  assert.match(await (await fetch(base + '/oauth/consent?lang=ta')).text(), /கோரிக்கை செல்லாது/);
  assert.match(await (await fetch(base + '/oauth/consent?lang=hi')).text(), /अनुरोध मान्य नहीं/);
});

test('fonts are served from this site and nothing is loaded from other sites', async () => {
  assert.equal((await fetch(base + '/fonts/barlow-latin-400.woff2')).status, 200);
  for (const p of ['/', '/account', '/developer', '/admin']) { const h = await (await fetch(base + p)).text(); assert.doesNotMatch(h, /(?:src|href)="https?:\/\//i, p); }
  const csp = (await fetch(base + '/')).headers.get('content-security-policy'); assert.match(csp, /font-src 'self'/); assert.doesNotMatch(csp, /googleapis|gstatic/);
});
test('unknown pages show the branded 404 page; private pages are not indexed', async () => {
  const r = await fetch(base + '/no-such-page'); assert.equal(r.status, 404); assert.match(await r.text(), /Page not found/);
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Disallow: \/admin/);
  assert.match(await (await fetch(base + '/account')).text(), /noindex/);
});
test('browser permissions are locked down except passkeys', async () => {
  const pp = (await fetch(base + '/')).headers.get('permissions-policy'); assert.match(pp, /camera=\(\)/); assert.match(pp, /publickey-credentials-get=\(self\)/);
});
