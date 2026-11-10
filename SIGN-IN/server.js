import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountExtra } from './routes-extra.js';
import { mountPasskey } from './routes-passkey.js';
import { consentT, langOf } from './consent-i18n.js';

// ---------- configuration (everything comes from env; values are never printed) ----------
const PROD = process.env.NODE_ENV === 'production';
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'PUBLIC_URL', 'LOGIN_CODE_KEY'];
const missing = REQUIRED.filter(k => !process.env[k]?.trim());
if (missing.length) { console.error('Missing environment variables: ' + missing.join(', ') + '\nCopy .env.example to .env and fill them in.'); process.exit(1); }
const fatal = m => { console.error(m); process.exit(1); };
const urlEnv = (key, { allowLocalHttp = false } = {}) => {
  try {
    const raw = process.env[key].trim();
    const u = new URL(raw);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (!['http:', 'https:'].includes(u.protocol) || (PROD && u.protocol !== 'https:') ||
        (u.protocol === 'http:' && !(allowLocalHttp && local)) || u.username || u.password ||
        u.search || u.hash || (u.pathname !== '/' && u.pathname !== '')) throw new Error('invalid origin');
    return u.origin;
  } catch {
    return fatal(key + ' must be a valid ' + (PROD ? 'https ' : 'web ') + 'origin without a path, query, or fragment');
  }
};
const SB_URL = urlEnv('SUPABASE_URL', { allowLocalHttp: true });
const PUBLIC_ORIGIN = urlEnv('PUBLIC_URL', { allowLocalHttp: true });
const ANON = process.env.SUPABASE_ANON_KEY.trim(), SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
if (SERVICE.startsWith('sb_publishable_')) fatal('SUPABASE_SERVICE_ROLE_KEY must be a server-only secret/service_role key, never a publishable key');
if (!/^[0-9a-fA-F]{64}$/.test(process.env.LOGIN_CODE_KEY.trim())) fatal('LOGIN_CODE_KEY must be exactly 64 hexadecimal characters');
const ENC_KEY = Buffer.from(process.env.LOGIN_CODE_KEY.trim(), 'hex');
if (ENC_KEY.length !== 32) fatal('LOGIN_CODE_KEY must be 64 hex characters');
const CODE_TTL_MS = 60_000;
const optUrl = k => { try { const u = new URL(process.env[k]?.trim()); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const TURNSTILE_KEY = process.env.TURNSTILE_SITE_KEY?.trim() || null; // optional captcha (Cloudflare Turnstile)
const CF = TURNSTILE_KEY ? ['https://challenges.cloudflare.com'] : [];
const flag = k => ['1', 'true', 'yes', 'on'].includes((process.env[k] || '').trim().toLowerCase());
const SMS_ENABLED = flag('SMS_ENABLED'), EMAIL_ENABLED = flag('EMAIL_ENABLED'), UNVERIFIED_SIGNUP = flag('UNVERIFIED_SIGNUP');
if (UNVERIFIED_SIGNUP && PROD) fatal('UNVERIFIED_SIGNUP is development-only. For production without SMTP, disable Confirm Email in Supabase Auth until custom SMTP is configured.');
if (UNVERIFIED_SIGNUP) console.warn('WARNING: UNVERIFIED_SIGNUP is on. New email addresses are auto-confirmed; development only.');
const AT = PROD ? '__Host-cd_at' : 'cd_at', RT = PROD ? '__Host-cd_rt' : 'cd_rt'; // __Host- cookies can't be set or read from other subdomains
const ALLOW_DELETE = flag('ALLOW_ACCOUNT_DELETION'), RATE_DB = (process.env.RATE_LIMIT_STORE || '').trim().toLowerCase() === 'database';
const positiveInt = (key, fallback, min = 1, max = 1000) => {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) fatal(key + ' must be an integer between ' + min + ' and ' + max);
  return n;
};
const AUTH_LIMIT = positiveInt('AUTH_RATE_LIMIT', 15, 1, 1000);
const EMAIL_LIMIT = positiveInt('AUTH_RATE_LIMIT_EMAIL', 10, 1, 1000);
const PORT = positiveInt('PORT', 3000, 1, 65535);
const TRUST_PROXY = process.env.TRUST_PROXY?.trim();
if (TRUST_PROXY && (!/^[1-9]\d*$/.test(TRUST_PROXY) || Number(TRUST_PROXY) > 32)) fatal('TRUST_PROXY must be a hop count from 1 to 32, or unset');
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const LINKS = { terms: optUrl('TERMS_URL'), privacy: optUrl('PRIVACY_URL') };

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(SB_URL, SERVICE, opts);   // server only: reads/writes login_* tables
const anon = () => createClient(SB_URL, ANON, opts);  // per request: acts as the signing-in user

// ---------- helpers ----------
const cookieBase = { httpOnly: true, sameSite: 'lax', secure: PROD, path: '/' };
const setCookies = (res, s) => {
  res.cookie(AT, s.access_token, { ...cookieBase, maxAge: 3600e3 });
  res.cookie(RT, s.refresh_token, { ...cookieBase, maxAge: 30 * 864e5 });
};
const clearCookies = res => { res.clearCookie(AT, cookieBase); res.clearCookie(RT, cookieBase); };
const ident = u => u.email || u.phone || 'your account';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SAFE_NEXT = /^\/(?!\/)[^\s\\]{0,2047}$/;   // internal paths only
const COMMON = new Set('password password1 password123 passw0rd 12345678 123456789 1234567890 11111111 00000000 qwerty123 qwertyuiop iloveyou admin123 welcome1 letmein123 abc12345 abcd1234 dragon123 cageddragon caged-dragon cageddragon1 caged-dragon123 changeme1 football1 whatever1 trustno1 monkey123 sunshine1 princess1 baseball1 superman1 1q2w3e4r 1qaz2wsx qazwsx123 zaq12wsx'.split(' '));
const weakPassword = (pw, email = '') => { const p = pw.toLowerCase(), local = String(email).split('@')[0].toLowerCase(); return COMMON.has(p) || /^(.)\1+$/.test(pw) || (local.length >= 4 && p.includes(local)); };
const WEAK = 'Choose a stronger password. Avoid common passwords and your email.';
const authError = e => {
  const m = (e?.message || '').toLowerCase();
  if (e?.status === 429 || m.includes('rate')) return 'Too many tries. Wait a minute and try again.';
  if (m.includes('not confirmed')) return 'Confirm your email first, then sign in.';
  return 'Those details didn’t work. Check them and try again.';
};
const seal = obj => {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
};
const unseal = str => {
  const b = Buffer.from(str, 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
};
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

const claimsOf = t => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url')); } catch { return {}; } };
const aalOf = t => claimsOf(t).aal || 'aal1';
const hasTotp = u => !!u?.factors?.some(f => f.status === 'verified' && f.factor_type === 'totp');
// ID token: a signed statement of who signed in and how (EdDSA). Products verify it with /.well-known/jwks.json
const seedBuf = Buffer.from(crypto.hkdfSync('sha256', ENC_KEY, Buffer.alloc(0), 'caged-dragon-id-token-v1', 32));
const signKey = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seedBuf]), format: 'der', type: 'pkcs8' });
const pubJwk = crypto.createPublicKey(signKey).export({ format: 'jwk' });
const KID = sha(pubJwk.x).slice(0, 12);
const JWKS = { keys: [{ ...pubJwk, kid: KID, use: 'sig', alg: 'EdDSA' }] };
const b64u = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const signIdToken = claims => { const h = b64u({ alg: 'EdDSA', typ: 'JWT', kid: KID }), p = b64u(claims); return h + '.' + p + '.' + crypto.sign(null, Buffer.from(h + '.' + p), signKey).toString('base64url'); };

// Only registered, active products (login_client_apps) are valid places to send a person back to.
async function resolveClient(urlStr) {
  if (!urlStr) return null;
  let u; try { u = new URL(urlStr); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
  const { data, error } = await admin.rpc('login_resolve_client', { p_redirect: u.href });
  if (error) throw error;
  return data?.[0] ?? null;
}
async function assertAccountActive(user, res) {
  const { data, error } = await admin.from('login_accounts').select('status').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (data?.status === 'suspended') {
    clearCookies(res);
    const blocked = new Error('This Caged Dragon account is suspended. Contact Caged Dragon support.');
    blocked.status = 403;
    throw blocked;
  }
}
async function currentSession(req, res) {
  const at = req.cookies[AT], rt = req.cookies[RT];
  if (at) {
    const { data, error } = await anon().auth.getUser(at);
    if (!error && data.user) {
      await assertAccountActive(data.user, res);
      return { user: data.user, at, rt };
    }
  }
  if (rt) {
    const { data, error } = await anon().auth.refreshSession({ refresh_token: rt });
    if (!error && data.session) {
      await assertAccountActive(data.session.user, res);
      setCookies(res, data.session);
      return { user: data.session.user, at: data.session.access_token, rt: data.session.refresh_token };
    }
  }
  clearCookies(res);
  return null;
}
async function mintSession(email) { // server-made session for an already-verified identity
  const { data: link, error: e1 } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (e1) throw e1;
  const { data, error: e2 } = await anon().auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (e2) throw e2;
  return data.session;
}
const rolesOf = async id => {
  const { data, error } = await admin.from('login_account_roles').select('role').eq('user_id', id);
  if (error) throw error;
  return new Set(['user', ...(data ?? []).map(r => r.role)]);
};
const grantDeveloper = async id => {
  const { error } = await admin.from('login_account_roles').upsert({ user_id: id, role: 'developer' }, { onConflict: 'user_id,role' });
  if (error) throw error;
};

// Records the login, then sends the person on: to an internal page (o.next) or back to the product (o.to).
async function finish(req, res, user, rt, method, o = {}) {
  await assertAccountActive(user, res);
  const role = o.role === 'developer' ? 'developer' : 'user';
  const have = await rolesOf(user.id);
  if (role === 'developer' && o.join && !have.has('developer')) { await grantDeveloper(user.id); have.add('developer'); }
  const account = { identifier: ident(user), roles: [...have] };
  if (role === 'developer' && !have.has('developer')) return { account, needsDeveloper: true };

  const aal2 = aalOf(o.at) === 'aal2', strong = aal2 || !!o.strong; // authenticator code, or a passkey with fingerprint/face/PIN
  if (o.requireMfa && !strong) return { account, needsMfaSetup: true };

  const client = await resolveClient(o.to);
  const { error: recordError } = await admin.rpc('login_record', {
    p_user_id: user.id, p_method: method, p_role: role,
    p_client_slug: client?.slug ?? null, p_user_agent: req.get('user-agent') ?? null
  });
  if (recordError) throw recordError;
  if (o.next && SAFE_NEXT.test(o.next)) return { account, redirect: o.next };
  if (!client) return { account, redirect: null };

  let s; // give the product its own session so it never shares a refresh token with this site
  if (user.email) s = await mintSession(user.email);
  else { // phone-only account: hand this session over and ask for a fresh code next time
    const { data, error } = await anon().auth.refreshSession({ refresh_token: rt });
    if (error) throw error;
    s = data.session; clearCookies(res);
  }
  const now = Math.floor(Date.now() / 1000);
  const id_token = signIdToken({ iss: PUBLIC_ORIGIN, aud: client.slug, sub: user.id, email: user.email ?? null, phone: user.phone || null, role, roles: account.roles,
    mfa: strong, amr: [method, ...(aal2 ? ['totp'] : []), ...(o.strong ? ['user_verified'] : [])], auth_time: now, iat: now, exp: now + 600 });
  const code = crypto.randomBytes(32).toString('base64url');
  const { error } = await admin.from('login_codes').insert({
    code_hash: sha(code), user_id: user.id, client_app_id: client.id,
    payload: seal({ access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, role, roles: account.roles,
      mfa_verified: strong, mfa_enrolled: strong || hasTotp(user), id_token }),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString()
  });
  if (error) throw error;
  const target = new URL(o.to); target.hash = ''; target.searchParams.set('code', code);
  return { account, redirect: target.href };
}

// After a correct password/code: ask for the authenticator code if two-step is on, else finish.
const mfaCookie = { ...cookieBase, path: '/api/mfa', maxAge: 5 * 60_000 };
async function proceed(req, res, s, user, method, o) {
  // A user-verified passkey is already a strong second factor; otherwise honor enrolled TOTP.
  if (aalOf(s.access_token) !== 'aal2' && !o.strong) {
    const c = anon();
    const { error: sessionError } = await c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    if (sessionError) throw sessionError;
    const { data: f, error: factorsError } = await c.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    const totp = f?.totp?.[0]; // `totp` lists verified factors only
    if (totp) {
      res.cookie('cd_mfa', seal({ at: s.access_token, rt: s.refresh_token, factorId: totp.id, method, o, exp: Date.now() + 300_000 }), mfaCookie);
      return { mfa: true };
    }
  }
  setCookies(res, s);
  return finish(req, res, user, s.refresh_token, method, { ...o, at: s.access_token });
}

// Protect browser POST endpoints against cross-site requests. Browsers normally
// send Origin on POST; some navigation/form contexts omit it, so accept a
// same-origin Referer only when Origin is genuinely absent. Never let Referer
// override a present (including 'null' or mismatched) Origin header.
const sameOrigin = (req, res, next) => {
  const originHeader = req.get('origin');
  let requestOrigin = null;
  if (originHeader !== undefined) {
    try { requestOrigin = new URL(originHeader).origin; } catch { requestOrigin = null; }
  } else {
    const refererHeader = req.get('referer');
    if (refererHeader) {
      try { requestOrigin = new URL(refererHeader).origin; } catch { requestOrigin = null; }
    }
  }
  return requestOrigin === PUBLIC_ORIGIN
    ? next()
    : res.status(403).json({ error: 'Blocked request.' });
};
const wrap = fn => (req, res, next) => fn(req, res).catch(next);
const parse = (schema, body) => { const r = schema.safeParse(body); if (!r.success) { const e = new Error('Check the details and try again.'); e.status = 400; throw e; } return r.data; };

// ---------- app ----------
const app = express();
if (TRUST_PROXY) app.set('trust proxy', Number(TRUST_PROXY));
else if (process.env.VERCEL) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => { // structured logs: method, path (no query string), status, time. No personal data.
  const t = Date.now();
  res.on('finish', () => { if (req.path !== '/healthz') console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: req.path, s: res.statusCode, ms: Date.now() - t })); });
  next();
});
app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: { useDefaults: false, directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'", ...CF], connectSrc: ["'self'", ...CF], frameSrc: CF.length ? CF : ["'none'"], imgSrc: ["'self'", 'data:'],
  styleSrc: ["'self'"], fontSrc: ["'self'"],
  frameAncestors: ["'none'"], baseUri: ["'none'"], objectSrc: ["'none'"] } } }));
app.use((req, res, next) => { res.set('Cross-Origin-Resource-Policy', req.path === '/sdk.js' ? 'cross-origin' : 'same-origin'); next(); });
app.use((req, res, next) => { res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), publickey-credentials-get=(self), publickey-credentials-create=(self)'); next(); });
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '2kb' }));
app.use(cookieParser());
app.use(['/api', '/oauth'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(['/api', '/oauth'], rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
class DbStore { // shared between server copies (RATE_LIMIT_STORE=database)
  constructor(prefix) { this.prefix = prefix; }
  init(o) { this.windowMs = o.windowMs; }
  async increment(key) {
    const { data, error } = await admin.rpc('login_rate_hit', { p_key: this.prefix + key, p_window_ms: this.windowMs });
    if (error || !data?.[0]) {
      console.error('rate limit store unavailable:', error?.message || 'no counter row returned');
      throw new Error('Shared rate-limit store unavailable'); // fail closed when shared limiting is explicitly requested
    }
    return { totalHits: data[0].hits, resetTime: new Date(data[0].reset_at) };
  }
  async decrement() {}
  async resetKey(key) { await admin.from('login_rate_limits').delete().eq('key', this.prefix + key).then(() => {}, () => {}); }
}
const store = prefix => (RATE_DB ? new DbStore(prefix) : undefined);
const perEmail = rateLimit({ windowMs: 15 * 60_000, limit: EMAIL_LIMIT, standardHeaders: true, legacyHeaders: false, store: store('email:'),
  skip: req => !req.body?.email, keyGenerator: req => sha(String(req.body.email).toLowerCase().trim()), message: { error: 'Too many tries. Wait a few minutes and try again.' } });
const strict = rateLimit({ store: store('strict:'), windowMs: 15 * 60_000, limit: AUTH_LIMIT, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many tries. Wait a few minutes and try again.' } });
const perPhoneSend = rateLimit({ windowMs: 15 * 60_000, limit: 3, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => sha(String(req.body?.phone || 'missing-phone').trim()),
  message: { error: 'Too many codes requested for this number. Try again later.' } });
const perPhoneVerify = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => sha(String(req.body?.phone || 'missing-phone').trim()),
  message: { error: 'Too many code attempts for this number. Request a new code later.' } });

const common = {
  redirect_to: z.string().max(2048).optional(), next: z.string().max(2048).optional(),
  role: z.enum(['user', 'developer']).optional(), join: z.boolean().optional(), require_mfa: z.boolean().optional(), captcha: z.string().max(2048).optional()
};
const opt = b => ({ to: b.redirect_to, next: b.next, role: b.role, join: b.join, requireMfa: b.require_mfa });
const cap = b => (b.captcha ? { captchaToken: b.captcha } : {});

app.get('/api/context', wrap(async (req, res) => {
  const to = String(req.query.redirect_to || '').slice(0, 2048);
  const client = await resolveClient(to);
  const cur = await currentSession(req, res);
  res.json({
    client: client ? { name: client.name } : null,
    rejected: !client && req.query.explicit === '1',
    links: LINKS, captcha: TURNSTILE_KEY, features: { sms: SMS_ENABLED, mail: EMAIL_ENABLED, passkeys: true },
    account: cur ? { identifier: ident(cur.user), roles: [...await rolesOf(cur.user.id)] } : null
  });
}));

app.post('/api/email', sameOrigin, strict, perEmail, wrap(async (req, res) => {
  const b = parse(z.object({ ...common, email: z.string().email().max(254), password: z.string().min(8).max(72), mode: z.enum(['signin', 'signup']) }), req.body);
  if (b.mode === 'signup' && weakPassword(b.password, b.email)) return res.status(400).json({ error: WEAK });
  const back = new URL(PUBLIC_ORIGIN + '/');
  for (const [k, v] of Object.entries({ redirect_to: b.redirect_to, next: b.next, role: b.role })) if (v) back.searchParams.set(k, v);
  if (b.mode === 'signup' && b.role === 'developer') back.searchParams.set('join', '1');
  let r;
  if (b.mode === 'signup' && UNVERIFIED_SIGNUP) { // development only: skips the confirmation email
    const { error: ce } = await admin.auth.admin.createUser({ email: b.email, password: b.password, email_confirm: true });
    if (ce) return res.status(400).json({ error: /already|registered|exists/i.test(ce.message || '') ? 'That email already has an account. Sign in instead.' : authError(ce) });
    r = await anon().auth.signInWithPassword({ email: b.email, password: b.password });
  } else r = b.mode === 'signup'
    ? await anon().auth.signUp({ email: b.email, password: b.password, options: { emailRedirectTo: back.href, ...cap(b) } })
    : await anon().auth.signInWithPassword({ email: b.email, password: b.password, options: cap(b) });
  const { data, error } = r;
  if (error) return res.status(400).json({ error: authError(error) });
  if (!data.session) return res.json({ pending: 'Check your inbox. Open the confirmation link to finish creating your account.' });
  res.json(await proceed(req, res, data.session, data.user, 'email', { ...opt(b), join: b.mode === 'signup' && b.role === 'developer' }));
}));

app.post('/api/phone/send', sameOrigin, strict, perPhoneSend, wrap(async (req, res) => {
  if (!SMS_ENABLED) return res.status(403).json({ error: 'Mobile sign-in isn’t switched on yet.' });
  const b = parse(z.object({ phone: z.string().regex(/^\+\d{8,15}$/), captcha: z.string().max(2048).optional() }), req.body);
  const { error } = await anon().auth.signInWithOtp({ phone: b.phone, options: cap(b) });
  if (error) { console.error('phone otp:', error.message); return res.status(400).json({ error: 'Couldn’t send a code. Check the number and try again.' }); }
  res.json({ sent: true });
}));

app.post('/api/phone/verify', sameOrigin, strict, perPhoneVerify, wrap(async (req, res) => {
  const b = parse(z.object({ ...common, phone: z.string().regex(/^\+\d{8,15}$/), token: z.string().regex(/^\d{6}$/) }), req.body);
  const { data, error } = await anon().auth.verifyOtp({ phone: b.phone, token: b.token, type: 'sms' });
  if (error || !data.session) return res.status(400).json({ error: 'That code didn’t work. Check it or request a new one.' });
  res.json(await proceed(req, res, data.session, data.user, 'phone', opt(b)));
}));

// Returning from the email confirmation link: the browser posts the tokens from the URL fragment.
app.post('/api/adopt', sameOrigin, strict, wrap(async (req, res) => {
  const b = parse(z.object({ ...common, access_token: z.string().max(4096), refresh_token: z.string().max(512) }), req.body);
  const { data, error } = await anon().auth.getUser(b.access_token);
  if (error || !data.user) return res.status(401).json({ error: 'That link has expired. Sign in again.' });
  res.json(await proceed(req, res, { access_token: b.access_token, refresh_token: b.refresh_token }, data.user, 'email', opt(b)));
}));

// Second step of sign-in (authenticator app code)
app.post('/api/mfa/verify', sameOrigin, strict, wrap(async (req, res) => {
  const b = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
  let p; try { p = unseal(String(req.cookies.cd_mfa || '')); } catch {}
  if (!p || p.exp < Date.now()) return res.status(401).json({ error: 'That step expired. Sign in again.' });
  const c = anon(); await c.auth.setSession({ access_token: p.at, refresh_token: p.rt });
  const { data, error } = await c.auth.mfa.challengeAndVerify({ factorId: p.factorId, code: b.code });
  if (error || !data) return res.status(400).json({ error: 'That code didn’t work. Check it and try again.' });
  res.clearCookie('cd_mfa', { ...cookieBase, path: '/api/mfa' });
  setCookies(res, data);
  res.json(await finish(req, res, data.user, data.refresh_token, p.method, { ...p.o, at: data.access_token }));
}));

// One tap for someone already signed in on this browser.
app.post('/api/continue', sameOrigin, wrap(async (req, res) => {
  const b = parse(z.object(common), req.body);
  const cur = await currentSession(req, res);
  if (!cur) return res.status(401).json({ error: 'Sign in first.' });
  const out = await proceed(req, res, { access_token: cur.at, refresh_token: cur.rt }, cur.user, 'caged_dragon', { ...opt(b), join: false });
  if (!out.redirect && !out.needsDeveloper && !out.mfa && !out.needsMfaSetup) return res.status(400).json({ error: 'This product isn’t registered with Caged Dragon.' });
  res.json(out);
}));

// Any signed-in person can add the developer role to their account.
app.post('/api/developer/enable', sameOrigin, wrap(async (req, res) => {
  const b = parse(z.object(common), req.body);
  const cur = await currentSession(req, res);
  if (!cur) return res.status(401).json({ error: 'Sign in first.' });
  res.json(await proceed(req, res, { access_token: cur.at, refresh_token: cur.rt }, cur.user, 'caged_dragon', { ...opt(b), role: 'developer', join: true }));
}));

// ---------- forgot / reset password ----------
app.post('/api/password/forgot', sameOrigin, strict, perEmail, wrap(async (req, res) => {
  if (!EMAIL_ENABLED) return res.status(403).json({ error: 'Password reset by email isn’t switched on yet.' });
  const b = parse(z.object({ ...common, email: z.string().email().max(254) }), req.body);
  const back = new URL(PUBLIC_ORIGIN + '/');
  for (const [k, v] of Object.entries({ redirect_to: b.redirect_to, next: b.next, role: b.role })) if (v) back.searchParams.set(k, v);
  const { error } = await anon().auth.resetPasswordForEmail(b.email, { redirectTo: back.href, ...cap(b) });
  if (error?.status === 429) return res.status(429).json({ error: authError(error) });
  res.json({ sent: true }); // same answer whether or not the email has an account
}));
app.post('/api/password/reset', sameOrigin, strict, wrap(async (req, res) => {
  const b = parse(z.object({ access_token: z.string().max(4096), password: z.string().min(8).max(72) }), req.body);
  const { data, error } = await anon().auth.getUser(b.access_token);
  let iat = 0; try { iat = JSON.parse(Buffer.from(b.access_token.split('.')[1], 'base64url')).iat; } catch {}
  if (error || !data.user || Date.now() / 1000 - iat > 900) return res.status(401).json({ error: 'That link has expired. Ask for a new one.' });
  if (weakPassword(b.password, data.user.email)) return res.status(400).json({ error: WEAK });
  const { error: e2 } = await admin.auth.admin.updateUserById(data.user.id, { password: b.password });
  if (e2) return res.status(400).json({ error: 'Couldn’t set that password. Try a different one.' });
  res.json({ ok: true });
}));

app.post('/api/logout', sameOrigin, wrap(async (req, res) => {
  if (req.cookies[AT]) await admin.auth.admin.signOut(req.cookies[AT], 'local').catch(() => {});
  clearCookies(res);
  res.json({ ok: true });
}));

// Products trade the one-time code for their session (CORS only for their own registered origin).
app.use('/api/token', async (req, res, next) => {
  try {
    const origin = req.get('origin');
    const client = origin && await resolveClient(origin);
    if (!client) return res.status(403).json({ error: 'Unknown origin.' });
    res.set({ 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    req.client = client; next();
  } catch (e) { next(e); }
});
app.post('/api/token', rateLimit({ windowMs: 60_000, limit: 60 }), wrap(async (req, res) => {
  const b = parse(z.object({ code: z.string().min(20).max(100) }), req.body);
  const { data } = await admin.from('login_codes').delete()   // delete-returning = single use
    .eq('code_hash', sha(b.code)).eq('client_app_id', req.client.id).gt('expires_at', new Date().toISOString())
    .select('payload').maybeSingle();
  if (!data) return res.status(400).json({ error: 'Invalid or expired code.' });
  res.json(unseal(data.payload));
}));

// ---------- OAuth consent (the Authorization Path configured in Supabase: /oauth/consent) ----------
const shell = (title, inner, lang = 'en') => {
  const t = consentT(lang);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} – Caged Dragon</title><link rel="icon" href="/favicon.ico?v=3" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=3"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3"><link rel="stylesheet" href="/style.css"></head><body class="plain"><main class="card"><header class="head"><img class="mark" src="/product-128.png" alt="Caged Dragon Sign-In" width="52" height="52"><span class="who"><span class="brandname">Sign-In</span><small class="by">${t('by Caged Dragon')}</small></span></header><h1>${esc(title)}</h1>${inner}<footer class="co"><img src="/company-128.png" alt="Caged Dragon" width="56" height="56"><span><b>Caged Dragon Studios</b><br>Unleash Possibilities</span></footer></main></body></html>`;
};
const SCOPES = { openid: 'Confirm that it is you', email: 'See your email address', profile: 'See your name and username', phone: 'See your phone number' };
const hostOf = u => { try { return new URL(u).host; } catch { return String(u); } };
const consentPath = id => '/oauth/consent?authorization_id=' + encodeURIComponent(id);
const needsCode = cur => hasTotp(cur.user) && aalOf(cur.at) !== 'aal2'; // signed in without the authenticator code
async function userClient(cur) { const c = anon(); await c.auth.setSession({ access_token: cur.at, refresh_token: cur.rt }); return c; }

app.get('/oauth/consent', wrap(async (req, res) => {
  const L = langOf(req), t = consentT(L);
  const id = String(req.query.authorization_id || '').slice(0, 200);
  if (!id) return res.status(400).send(shell(t('Request not valid'), `<p>${t('Open this page from a Caged Dragon product, then try again.')}</p>`, L));
  const cur = await currentSession(req, res);
  if (!cur || needsCode(cur)) return res.redirect('/?next=' + encodeURIComponent(consentPath(id)));
  const { data: d, error } = await (await userClient(cur)).auth.oauth.getAuthorizationDetails(id);
  if (error || !d) return res.status(400).send(shell(t('Request expired'), `<p>${t('This sign-in request is no longer valid. Go back to the product and try again.')}</p>`, L));
  if (!('authorization_id' in d)) return res.redirect(d.redirect_url); // already allowed before
  const scopes = String(d.scope || '').split(' ').filter(Boolean);
  const secure = /^https:/.test(d.redirect_uri) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(d.redirect_uri);
  res.send(shell(t('Sign in to {name}?', { name: esc(d.client.name) }, true), `
<p>${t('<b>{name}</b> wants to sign you in as <b>{who}</b>. It will be able to:', { name: esc(d.client.name), who: esc(ident(cur.user)) })}</p>
<ul class="scopes">${scopes.map(s => `<li>${SCOPES[s] ? t(SCOPES[s]) : esc(s)}</li>`).join('')}</ul>
<p class="fine">${t('It can’t change your account or see your password.')}</p>
${secure ? '' : `<p id="msg" class="err" role="alert">${t('Warning: this product isn’t using a secure address.')}</p>`}
<p class="fine">${t('You’ll be sent to <b>{host}</b> afterwards.', { host: hostOf(d.redirect_uri) })}</p>
<form method="post" action="/oauth/decision" class="actions"><input type="hidden" name="authorization_id" value="${esc(id)}"><button class="go" name="decision" value="approve">${t('Allow')}</button><button class="cd" name="decision" value="deny">${t('Cancel')}</button></form>
<form method="post" action="/oauth/switch" class="row"><input type="hidden" name="authorization_id" value="${esc(id)}"><button class="link">${t('Not you? Use a different account')}</button></form>`, L));
}));

app.post('/oauth/decision', sameOrigin, wrap(async (req, res) => {
  const L = langOf(req), t = consentT(L);
  const id = String(req.body.authorization_id || '').slice(0, 200), approve = req.body.decision === 'approve';
  const cur = await currentSession(req, res);
  if (!cur || !id || needsCode(cur)) return res.redirect('/');
  const c = await userClient(cur);
  let authorizationDetails = null;
  if (approve) {
    const details = await c.auth.oauth.getAuthorizationDetails(id);
    if (details.error || !details.data || !('authorization_id' in details.data))
      return res.status(400).send(shell(t('Request expired'), `<p>${t('This sign-in request is no longer valid. Go back to the product and try again.')}</p>`, L));
    authorizationDetails = details.data;
  }
  const { data, error } = approve ? await c.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
                                  : await c.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) return res.status(400).send(shell(t('Something went wrong'), `<p>${t('We couldn’t finish that. Go back to the product and try again.')}</p>`, L));
  if (approve && authorizationDetails?.client?.id && authorizationDetails?.redirect_uri) {
    const { error: auditError } = await admin.rpc('login_record_oauth_grant_v2', {
      p_user_id: cur.user.id,
      p_oauth_client_id: authorizationDetails.client.id,
      p_redirect_uri: authorizationDetails.redirect_uri,
      p_user_agent: req.get('user-agent') || null
    });
    // OAuth approval has already succeeded. Do not strand the user if audit
    // persistence is temporarily unavailable; emit no token or PII to logs.
    if (auditError) console.error('OAuth grant audit persistence failed:', auditError.code || 'unknown');
  }
  res.redirect(303, data.redirect_url);
}));

app.post('/oauth/switch', sameOrigin, wrap(async (req, res) => {
  const id = String(req.body.authorization_id || '').slice(0, 200);
  if (req.cookies[AT]) await admin.auth.admin.signOut(req.cookies[AT], 'local').catch(() => {});
  clearCookies(res);
  res.redirect(303, id ? '/?next=' + encodeURIComponent(consentPath(id)) : '/');
}));

app.get('/logout', wrap(async (req, res) => { // product logout is local unless global scope is explicitly requested
  const scope = req.query.scope === 'global' ? 'global' : 'local';
  if (req.cookies[AT]) {
    const { error } = await admin.auth.admin.signOut(req.cookies[AT], scope);
    if (error) console.error('Central sign-out failed:', error.code || 'unknown');
  }
  clearCookies(res);
  const to = String(req.query.redirect_to || '').slice(0, 2048);
  res.redirect((await resolveClient(to)) ? to : '/');
}));
app.get('/.well-known/jwks.json', (req, res) => { res.set({ 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' }); res.json(JWKS); });

mountExtra(app, { z, admin, anon, currentSession, sameOrigin, strict, wrap, parse, rolesOf, ident, clearCookies, setCookies, SB_URL, ALLOW_DELETE, EMAIL_ENABLED, aalOf, hasTotp, weakPassword, WEAK, PUBLIC_ORIGIN });
mountPasskey(app, { z, admin, currentSession, sameOrigin, strict, wrap, parse, seal, unseal, mintSession, proceed, setCookies, cookieBase, PUBLIC_ORIGIN, common, opt, aalOf, hasTotp });
app.get('/readyz', async (req, res) => {
  try {
    const { error } = await admin.from('login_client_apps').select('id').limit(1);
    if (error) return res.status(503).json({ ok: false, database: 'unavailable' });
    return res.json({ ok: true, database: 'ready' });
  } catch {
    return res.status(503).json({ ok: false, database: 'unavailable' });
  }
});
app.get(['/admin', '/admin.html'], (req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.static(PUBLIC_DIR, { index: 'index.html', extensions: ['html'], maxAge: PROD ? '1h' : 0 }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html')));
app.use((err, req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err);
  const ok = err.status && err.status < 500;
  if (req.path.startsWith('/api')) return res.status(ok ? err.status : 500).json({ error: ok ? err.message : 'Something went wrong. Try again.' });
  res.status(ok ? err.status : 500).sendFile(path.join(PUBLIC_DIR, 'error.html'));
});

if (!process.env.VERCEL) {
  setInterval(() => {
    admin.from('login_codes').delete().lt('expires_at', new Date().toISOString()).then(() => {}, () => {});
    admin.from('login_rate_limits').delete().lt('reset_at', new Date(Date.now() - 3600e3).toISOString()).then(() => {}, () => {});
  }, 300_000).unref();
  app.listen(PORT, () => console.log('Caged Dragon login on ' + PUBLIC_ORIGIN));
}

export default app;
