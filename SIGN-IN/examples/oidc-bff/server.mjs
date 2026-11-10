import http from 'node:http';
import crypto from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const AUTH_ISSUER = required('CAGED_DRAGON_OIDC_ISSUER').replace(/\/$/, '');
const CLIENT_ID = required('CAGED_DRAGON_CLIENT_ID');
const REDIRECT_URI = required('CAGED_DRAGON_REDIRECT_URI');
const PUBLIC_ORIGIN = required('PRODUCT_PUBLIC_ORIGIN').replace(/\/$/, '');
const COOKIE_SECURE = process.env.COOKIE_SECURE !== '0';
const authIssuerUrl = new URL(AUTH_ISSUER);
const redirectUrl = new URL(REDIRECT_URI);
const productOrigin = new URL(PUBLIC_ORIGIN);
if (authIssuerUrl.protocol !== 'https:' || authIssuerUrl.pathname !== '/auth/v1' || authIssuerUrl.search || authIssuerUrl.hash) {
  throw new Error('CAGED_DRAGON_OIDC_ISSUER must be the Supabase HTTPS /auth/v1 issuer.');
}
if (productOrigin.pathname !== '/' || productOrigin.search || productOrigin.hash || productOrigin.username || productOrigin.password) {
  throw new Error('PRODUCT_PUBLIC_ORIGIN must be an origin only, without a path, query or fragment.');
}
if (redirectUrl.origin !== productOrigin.origin || redirectUrl.search || redirectUrl.hash || redirectUrl.username || redirectUrl.password) {
  throw new Error('CAGED_DRAGON_REDIRECT_URI must be an exact callback on PRODUCT_PUBLIC_ORIGIN, without query or fragment.');
}
if ((productOrigin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(productOrigin.hostname)) || productOrigin.username || productOrigin.password) {
  throw new Error('PRODUCT_PUBLIC_ORIGIN must use HTTPS (HTTP is only allowed on localhost).');
}
if (!COOKIE_SECURE && !['localhost', '127.0.0.1'].includes(productOrigin.hostname)) {
  throw new Error('COOKIE_SECURE=0 is allowed only for localhost development.');
}

const authorizeUrl = `${AUTH_ISSUER}/oauth/authorize`;
const tokenUrl = `${AUTH_ISSUER}/oauth/token`;
const userInfoUrl = `${AUTH_ISSUER}/oauth/userinfo`;
const jwks = createRemoteJWKSet(new URL(`${AUTH_ISSUER}/.well-known/jwks.json`));
const sessions = new Map();
const PORT = Number(process.env.PORT || 5556);
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;

const random = bytes => crypto.randomBytes(bytes).toString('base64url');
const cookieName = 'cd_bff';
const cookie = (sid, maxAge) => `${cookieName}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${COOKIE_SECURE ? '; Secure' : ''}`;
const cookieClear = `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? '; Secure' : ''}`;
const html = content => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Product account</title><body style="font:16px system-ui;max-width:42rem;margin:4rem auto;padding:0 1rem">${content}</body></html>`;
const send = (res, status, body, headers = {}) => { res.writeHead(status, { 'Cache-Control': 'no-store', ...headers }); res.end(body); };
const redirect = (res, location, headers = {}) => { res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...headers }); res.end(); };
const parseCookies = header => Object.fromEntries(String(header || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
  const i = v.indexOf('='); return i < 0 ? [v, ''] : [v.slice(0, i), decodeURIComponent(v.slice(i + 1))];
}));
const sessionCleanup = setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) if (session.expiresAt <= now) sessions.delete(sid);
}, 60_000);
sessionCleanup.unref();
const getSession = req => {
  const sid = parseCookies(req.headers.cookie)[cookieName];
  const session = sid && sessions.get(sid);
  if (!session || session.expiresAt <= Date.now()) { if (sid) sessions.delete(sid); return null; }
  return { sid, session };
};
const isSameOrigin = req => req.headers.origin === PUBLIC_ORIGIN;
const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.msg === 'string' ? data.msg : 'Authentication request failed.';
    throw new Error(message);
  }
  return data;
};
const refreshIfNeeded = async session => {
  if (!session.tokens?.access_token) return false;
  if (session.tokens.expiresAt > Date.now() + 60_000) return true;
  if (!session.tokens.refresh_token) return false;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: session.tokens.refresh_token,
    client_id: CLIENT_ID,
  });
  const tokens = await fetchJson(tokenUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  if (!tokens.access_token) return false;
  session.tokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || session.tokens.refresh_token,
    expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
  };
  session.user = await fetchJson(userInfoUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  if (session.identity?.sub && session.user.sub !== session.identity.sub) return false;
  return true;
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', PUBLIC_ORIGIN);
  try {
    if (req.method === 'GET' && requestUrl.pathname === '/healthz') return send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json' });

    if (req.method === 'GET' && requestUrl.pathname === '/login') {
      const sid = random(32), state = random(32), nonce = random(32), verifier = random(48);
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      sessions.set(sid, {
        createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS,
        pending: { state, nonce, verifier, createdAt: Date.now() }, tokens: null, user: null,
      });
      const authorize = new URL(authorizeUrl);
      for (const [key, value] of Object.entries({
        client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code',
        scope: 'openid email profile', code_challenge: challenge,
        code_challenge_method: 'S256', state, nonce,
      })) authorize.searchParams.set(key, value);
      return redirect(res, authorize.href, { 'Set-Cookie': cookie(sid, Math.floor(SESSION_TTL_MS / 1000)) });
    }

    if (req.method === 'GET' && requestUrl.pathname === '/auth/callback') {
      const current = getSession(req), pending = current?.session.pending;
      const state = requestUrl.searchParams.get('state'), code = requestUrl.searchParams.get('code');
      const oauthError = requestUrl.searchParams.get('error');
      if (!current || !pending || pending.createdAt + PENDING_TTL_MS < Date.now() || !state || state !== pending.state) {
        return send(res, 400, html('<h1>Sign-in expired</h1><p>Return to the product and try again.</p>'));
      }
      if (oauthError || !code) return send(res, 400, html('<h1>Sign-in was not completed</h1><p>Return to the product and try again.</p>'));
      const returnedIssuer = requestUrl.searchParams.get('iss');
      if (returnedIssuer && returnedIssuer.replace(/\/$/, '') !== AUTH_ISSUER) return send(res, 400, html('<h1>Unexpected issuer</h1>'));

      current.session.pending = null;
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code', code, client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI, code_verifier: pending.verifier,
      });
      const tokens = await fetchJson(tokenUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody,
      });
      if (!tokens.id_token || !tokens.access_token) throw new Error('The identity provider did not return the required tokens.');
      const { payload, protectedHeader } = await jwtVerify(tokens.id_token, jwks, {
        issuer: AUTH_ISSUER, audience: CLIENT_ID, clockTolerance: 5,
        algorithms: ['RS256', 'ES256'],
      });
      if (!['RS256', 'ES256'].includes(protectedHeader.alg) || payload.nonce !== pending.nonce || typeof payload.sub !== 'string' || !payload.sub) {
        throw new Error('The identity token failed issuer, audience, nonce or subject validation.');
      }
      current.session.tokens = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
      };
      current.session.user = await fetchJson(userInfoUrl, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      if (current.session.user.sub !== payload.sub) throw new Error('The user-info subject did not match the verified identity token.');
      current.session.identity = { sub: payload.sub, email: payload.email, email_verified: payload.email_verified === true };
      current.session.expiresAt = Date.now() + SESSION_TTL_MS;
      // Rotate the pre-authentication cookie after validating the callback.
      const authenticatedSid = random(32);
      sessions.delete(current.sid);
      sessions.set(authenticatedSid, current.session);
      return redirect(res, '/', { 'Set-Cookie': cookie(authenticatedSid, Math.floor(SESSION_TTL_MS / 1000)) });
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/me') {
      const current = getSession(req);
      if (!current || !(await refreshIfNeeded(current.session))) return send(res, 401, JSON.stringify({ authenticated: false }), { 'Content-Type': 'application/json', 'Set-Cookie': cookieClear });
      const user = current.session.user || {};
      return send(res, 200, JSON.stringify({ authenticated: true, user: {
        id: current.session.identity?.sub || user.sub,
        email: user.email || current.session.identity?.email || null,
        email_verified: user.email_verified === true || current.session.identity?.email_verified === true,
        name: user.name || null,
      } }), { 'Content-Type': 'application/json' });
    }

    if (req.method === 'POST' && requestUrl.pathname === '/logout') {
      if (!isSameOrigin(req)) return send(res, 403, 'Forbidden');
      const current = getSession(req);
      if (current) sessions.delete(current.sid);
      return redirect(res, '/', { 'Set-Cookie': cookieClear });
    }

    if (req.method === 'GET' && requestUrl.pathname === '/') {
      const current = getSession(req);
      const authenticated = current && await refreshIfNeeded(current.session);
      const content = authenticated
        ? `<h1>Signed in with Caged Dragon</h1><p>Welcome, ${escapeHtml(current.session.user?.name || current.session.user?.email || 'Caged Dragon user')}.</p><p><a href="/api/me">View session profile JSON</a></p><form method="post" action="/logout"><button>Sign out of this product</button></form>`
        : '<h1>Example product</h1><p>Your central Caged Dragon tokens are kept on this server, not in browser storage.</p><p><a href="/login">Sign in with Caged Dragon</a></p>';
      return send(res, 200, html(content), { 'Content-Type': 'text/html; charset=utf-8' });
    }
    return send(res, 404, 'Not found');
  } catch (error) {
    // Do not log authorization codes, tokens, user emails, or raw request URLs.
    console.error('Caged Dragon BFF request failed:', error?.message || 'unknown error');
    return send(res, 500, html('<h1>Something went wrong</h1><p>Please return to the product and try again.</p>'));
  }
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

server.listen(PORT, () => console.log(`OIDC BFF example listening on ${PUBLIC_ORIGIN} (port ${PORT})`));
