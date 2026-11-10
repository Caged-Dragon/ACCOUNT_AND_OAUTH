// A small fake of Supabase Auth (GoTrue) + PostgREST, just enough to run the whole sign-in flow in tests.
import http from 'node:http';
import crypto from 'node:crypto';

export function startMock(port) {
  const st = { users: new Map(), sessions: new Map(), refresh: new Map(), links: new Map(), revoked: new Set(),
    t: { login_client_apps: [], login_account_roles: [], login_codes: [], login_accounts: [], login_methods: [], login_app_grants: [], login_events: [], login_developer_apps: [], login_passkeys: [], login_rate_limits: [] }, oauthGrants: [], oauthAuthorizations: new Map(), oauthClients: new Map() };
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (u, sid, aal) => { const n = Math.floor(Date.now() / 1000); return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, email: u.email, aal, session_id: sid, role: 'authenticated', iat: n, exp: n + 3600 })}.sig`; };
  const claims = t => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url')); } catch { return null; } };
  const pub = u => ({ id: u.id, email: u.email, phone: u.phone || '', email_confirmed_at: u.confirmed ? new Date().toISOString() : null, factors: u.factors, aud: 'authenticated', role: 'authenticated' });
  const newSession = (u, aal = 'aal1') => {
    const sid = crypto.randomUUID(), rt = crypto.randomBytes(8).toString('hex');
    st.sessions.set(sid, { uid: u.id, aal }); st.refresh.set(rt, sid);
    return { access_token: jwt(u, sid, aal), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: rt, user: pub(u) };
  };
  const authUser = req => { const c = claims((req.headers.authorization || '').replace(/^Bearer /, '')); if (!c || st.revoked.has(c.session_id)) return null; const u = st.users.get(c.sub); return u ? { u, c } : null; };
  const addUser = (email, password, confirmed = true) => { const u = { id: crypto.randomUUID(), email, password, confirmed, factors: [] }; st.users.set(u.id, u); return u; };
  const byEmail = e => [...st.users.values()].find(u => u.email === e);

  // ----- PostgREST -----
  const match = (row, q) => { for (const [k, v] of q) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const i = v.indexOf('.'), op = v.slice(0, i), val = v.slice(i + 1), x = row[k];
    if (op === 'eq' && String(x) !== val) return false; if (op === 'gt' && !(x > val)) return false; if (op === 'gte' && !(x >= val)) return false;
    if (op === 'lt' && !(x < val)) return false; if (op === 'lte' && !(x <= val)) return false;
    if (op === 'in' && !val.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '')).includes(String(x))) return false; }
    return true; };
  function rest(req, res, url, body) {
    const name = url.pathname.replace('/rest/v1/', ''), q = url.searchParams, prefer = req.headers.prefer || '';
    if (name.startsWith('rpc/')) return rpc(name.slice(4), body, res);
    const rows = st.t[name]; if (!rows) return send(res, 404, { message: 'no table ' + name });
    const single = (req.headers.accept || '').includes('vnd.pgrst.object');
    const out = list => {
      let l = list; const o = q.get('order'); if (o) { const [c, d] = o.split('.'); l = [...l].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (d === 'desc' ? -1 : 1)); }
      if (q.get('limit')) l = l.slice(0, Number(q.get('limit')));
      if (single) return l.length === 1 ? send(res, 200, l[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${l.length} rows`, hint: null });
      send(res, 200, l);
    };
    if (req.method === 'HEAD' || req.method === 'GET') {
      const l = rows.filter(r => match(r, q));
      if (req.method === 'HEAD') { res.writeHead(200, { 'content-range': `*/${l.length}` }); return res.end(); }
      return out(l);
    }
    if (req.method === 'POST') {
      const items = Array.isArray(body) ? body : [body], conflict = q.get('on_conflict');
      for (const it of items) { const row = { id: it.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), ...it };
        if (prefer.includes('merge-duplicates') && conflict) { const keys = conflict.split(','); const ex = rows.find(r => keys.every(k => r[k] === row[k])); if (ex) { Object.assign(ex, it); continue; } }
        rows.push(row); }
      return q.get('select') ? out(rows.slice(-items.length)) : (res.writeHead(201), res.end());
    }
    if (req.method === 'PATCH') { const l = rows.filter(r => match(r, q)); l.forEach(r => Object.assign(r, body)); return q.get('select') ? out(l) : (res.writeHead(204), res.end()); }
    if (req.method === 'DELETE') { const l = rows.filter(r => match(r, q)); l.forEach(r => rows.splice(rows.indexOf(r), 1)); return q.get('select') ? out(l) : (res.writeHead(204), res.end()); }
    send(res, 405, {});
  }
  function rpc(fn, a, res) {
    if (fn === 'login_resolve_client') { const o = (String(a.p_redirect).match(/^(https?:\/\/[^/?#]+)/i) || [])[1]?.toLowerCase();
      return send(res, 200, st.t.login_client_apps.filter(c => c.is_active && c.allowed_origin === o).map(c => ({ id: c.id, slug: c.slug, name: c.name, origin: c.allowed_origin }))); }
    if (fn === 'login_record') {
      if (!['email', 'phone', 'caged_dragon', 'passkey'].includes(a.p_method) || !['user', 'developer'].includes(a.p_role)) return send(res, 400, { message: 'bad input' });
      const u = st.users.get(a.p_user_id); if (!u) return send(res, 400, { message: 'unknown user' });
      const app = st.t.login_client_apps.find(c => c.slug === a.p_client_slug && c.is_active);
      let acc = st.t.login_accounts.find(x => x.user_id === u.id); if (!acc) st.t.login_accounts.push(acc = { user_id: u.id, sign_in_count: 0 }); acc.sign_in_count++;
      if (!st.t.login_account_roles.find(r => r.user_id === u.id && r.role === 'user')) st.t.login_account_roles.push({ user_id: u.id, role: 'user' });
      st.t.login_events.push({ user_id: u.id, client_app_id: app?.id ?? null, method: a.p_method, role: a.p_role, created_at: new Date().toISOString() });
      res.writeHead(204); return res.end();
    }
    if (fn === 'login_record_oauth_grant_v2') {
      const app = st.t.login_client_apps.find(c => c.oauth_client_id === a.p_oauth_client_id && c.is_active && c.redirect_uris.includes(a.p_redirect_uri));
      if (app) {
        if (!st.t.login_app_grants.some(g => g.user_id === a.p_user_id && g.client_app_id === app.id)) st.t.login_app_grants.push({ user_id: a.p_user_id, client_app_id: app.id, last_used_at: new Date().toISOString() });
        st.t.login_events.push({ user_id: a.p_user_id, client_app_id: app.id, method: 'oauth', role: 'user', user_agent: a.p_user_agent, created_at: new Date().toISOString() });
      }
      res.writeHead(204); return res.end();
    }
    if (fn === 'login_rate_hit') return send(res, 200, [{ hits: 1, reset_at: new Date(Date.now() + a.p_window_ms).toISOString() }]);
    send(res, 404, { message: 'no rpc ' + fn });
  }

  // ----- GoTrue -----
  const bad = (res, code, msg) => send(res, code, { code, error_code: msg, msg });
  function auth(req, res, url, body) {
    const p = url.pathname.replace('/auth/v1', ''), m = req.method;
    if (p === '/token' && m === 'POST') {
      const g = url.searchParams.get('grant_type');
      if (g === 'password') { const u = byEmail(body.email); if (!u || u.password !== body.password) return bad(res, 400, 'invalid_credentials'); if (!u.confirmed) return bad(res, 400, 'email_not_confirmed'); return send(res, 200, newSession(u)); }
      if (g === 'refresh_token') { const sid = st.refresh.get(body.refresh_token); const s = sid && st.sessions.get(sid); if (!s || st.revoked.has(sid)) return bad(res, 400, 'refresh_token_not_found');
        st.refresh.delete(body.refresh_token); const u = st.users.get(s.uid), rt = crypto.randomBytes(8).toString('hex'); st.refresh.set(rt, sid);
        return send(res, 200, { access_token: jwt(u, sid, s.aal), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: rt, user: pub(u) }); }
    }
    if (p === '/admin/oauth/clients' && m === 'POST') {
      const client_id = crypto.randomUUID();
      const client = { client_id, client_name: body.client_name, client_uri: body.client_uri || '',
        redirect_uris: body.redirect_uris || [], scope: body.scope || 'openid email profile',
        client_type: 'public', token_endpoint_auth_method: body.token_endpoint_auth_method || 'none',
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      st.oauthClients.set(client_id, client);
      return send(res, 201, client);
    }
    let oauthClientMatch = p.match(/^\/admin\/oauth\/clients\/([^/]+)$/);
    if (oauthClientMatch && m === 'GET') {
      const client = st.oauthClients.get(oauthClientMatch[1]);
      return client ? send(res, 200, client) : bad(res, 404, 'oauth_client_not_found');
    }
    if (oauthClientMatch && m === 'DELETE') {
      st.oauthClients.delete(oauthClientMatch[1]);
      res.writeHead(204); return res.end();
    }
    if (p === '/signup' && m === 'POST') { if (byEmail(body.email)) return bad(res, 422, 'user_already_exists'); const u = addUser(body.email, body.password, false); return send(res, 200, pub(u)); }
    if (p === '/user' && m === 'GET') { const a = authUser(req); return a ? send(res, 200, pub(a.u)) : bad(res, 401, 'bad_jwt'); }
    if (p === '/admin/users' && m === 'POST') { if (byEmail(body.email)) return bad(res, 422, 'email_exists'); return send(res, 200, pub(addUser(body.email, body.password, !!body.email_confirm))); }
    let x;
    if ((x = p.match(/^\/admin\/users\/([^/]+)$/))) { const u = st.users.get(x[1]); if (!u) return bad(res, 404, 'user_not_found');
      if (m === 'GET') return send(res, 200, pub(u));
      if (m === 'PUT') { if (body.password) u.password = body.password; return send(res, 200, pub(u)); }
      if (m === 'DELETE') { st.users.delete(u.id); for (const t of Object.values(st.t)) for (let i = t.length - 1; i >= 0; i--) if (t[i].user_id === u.id) t.splice(i, 1); return send(res, 200, {}); } }
    if (p === '/admin/generate_link' && m === 'POST') { const u = byEmail(body.email); if (!u) return bad(res, 404, 'user_not_found'); const h = crypto.randomBytes(12).toString('hex'); st.links.set(h, u.id);
      return send(res, 200, { action_link: 'http://x/verify', email_otp: '000000', hashed_token: h, redirect_to: '', verification_type: 'magiclink', ...pub(u) }); }
    if (p === '/verify' && m === 'POST') { const id = st.links.get(body.token_hash); if (!id) return bad(res, 403, 'otp_expired'); st.links.delete(body.token_hash); return send(res, 200, newSession(st.users.get(id))); }
    if ((x = p.match(/^\/factors\/([^/]+)\/(challenge|verify)$/)) && m === 'POST') {
      const a = authUser(req); if (!a) return bad(res, 401, 'bad_jwt');
      if (x[2] === 'challenge') return send(res, 200, { id: crypto.randomUUID(), expires_at: Math.floor(Date.now() / 1000) + 300 });
      if (body.code !== '123456') return bad(res, 400, 'mfa_verification_failed');
      const sid = a.c.session_id; st.sessions.get(sid).aal = 'aal2'; const rt = crypto.randomBytes(8).toString('hex'); st.refresh.set(rt, sid);
      return send(res, 200, { access_token: jwt(a.u, sid, 'aal2'), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: rt, user: pub(a.u) }); }
    if (p === '/user/oauth/grants' && m === 'GET') {
      const a = authUser(req); if (!a) return bad(res, 401, 'bad_jwt');
      return send(res, 200, st.oauthGrants.filter(g => g.user_id === a.u.id).map(({ user_id, ...g }) => g));
    }
    if (p === '/user/oauth/grants' && m === 'DELETE') {
      const a = authUser(req); if (!a) return bad(res, 401, 'bad_jwt');
      const clientId = url.searchParams.get('client_id');
      st.oauthGrants = st.oauthGrants.filter(g => g.user_id !== a.u.id || g.client_id !== clientId);
      res.writeHead(204); return res.end();
    }
    let oauthMatch = p.match(/^\/oauth\/authorizations\/([^/]+)(?:\/consent)?$/);
    if (oauthMatch && m === 'GET' && !p.endsWith('/consent')) {
      const a = authUser(req); if (!a) return bad(res, 401, 'bad_jwt');
      const authorization = st.oauthAuthorizations.get(oauthMatch[1]);
      if (!authorization || authorization.user_id !== a.u.id) return bad(res, 404, 'authorization_not_found');
      const { user_id, ...details } = authorization;
      return send(res, 200, details);
    }
    if (oauthMatch && m === 'POST' && p.endsWith('/consent')) {
      const a = authUser(req); if (!a) return bad(res, 401, 'bad_jwt');
      const authorization = st.oauthAuthorizations.get(oauthMatch[1]);
      if (!authorization || authorization.user_id !== a.u.id) return bad(res, 404, 'authorization_not_found');
      const approved = body.action === 'approve';
      if (approved) st.oauthGrants.push({ user_id: a.u.id, client_id: authorization.client.id, client: authorization.client, scopes: authorization.scope.split(' '), granted_at: new Date().toISOString() });
      const target = new URL(authorization.redirect_uri);
      if (approved) target.searchParams.set('code', 'mock-authorization-code');
      else target.searchParams.set('error', 'access_denied');
      if (authorization.state) target.searchParams.set('state', authorization.state);
      return send(res, 200, { redirect_url: target.href });
    }
    if (p === '/logout' && m === 'POST') { const a = authUser(req); if (a) st.revoked.add(a.c.session_id); res.writeHead(204); return res.end(); }
    bad(res, 404, 'no_route ' + m + ' ' + p);
  }

  function send(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x'); let raw = '';
    req.on('data', d => raw += d);
    req.on('end', () => { let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch {}
      try { if (url.pathname.startsWith('/rest/v1/')) rest(req, res, url, body); else if (url.pathname.startsWith('/auth/v1/')) auth(req, res, url, body); else send(res, 404, {}); }
      catch (e) { console.error('mock error', e); send(res, 500, { message: String(e) }); } });
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ server, st, addUser, byEmail, addFactor: email => byEmail(email).factors.push({ id: 'f-' + email, factor_type: 'totp', status: 'verified' }) })));
}
