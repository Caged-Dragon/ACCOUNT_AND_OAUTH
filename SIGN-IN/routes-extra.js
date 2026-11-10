// Developer dashboard + account APIs. Mounted by server.js.
const validRedirect = u => {
  try {
    const x = new URL(u);
    if (x.hash || x.username || x.password || u.length > 2048) return false;
    return x.protocol === 'https:' || (x.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(x.hostname));
  } catch { return false; }
};

export function mountExtra(app, d) {
  const { z, admin, anon, currentSession, sameOrigin, strict, wrap, parse, rolesOf, ident, clearCookies, setCookies, SB_URL, ALLOW_DELETE, EMAIL_ENABLED, aalOf, hasTotp, weakPassword, WEAK, PUBLIC_ORIGIN } = d;

  const guard = needDev => async (req, res, next) => {
    try {
      const cur = await currentSession(req, res);
      if (!cur) return res.status(401).json({ error: 'Sign in first.' });
      if (hasTotp(cur.user) && aalOf(cur.at) !== 'aal2') {
        return res.status(403).json({ code: 'mfa_required', error: 'Complete two-step verification from the sign-in page, then try again.' });
      }
      if (needDev && !(await rolesOf(cur.user.id)).has('developer')) return res.status(403).json({ error: 'Developer account needed.' });
      req.cur = cur; next();
    } catch (e) { next(e); }
  };
  const userClient = async cur => { const c = anon(); await c.auth.setSession({ access_token: cur.at, refresh_token: cur.rt }); return c; };
  const owns = async (uid, clientId) => {
    const { data, error } = await admin.from('login_developer_apps').select('client_id').eq('user_id', uid).eq('client_id', clientId).maybeSingle();
    if (error) throw error;
    return !!data;
  };

  // ---------- developer dashboard ----------
  app.get('/api/dev/info', guard(true), (req, res) => res.json({
    authorize_url: SB_URL + '/auth/v1/oauth/authorize', token_url: SB_URL + '/auth/v1/oauth/token', scopes: 'openid email profile'
  }));

  app.get('/api/dev/apps', guard(true), wrap(async (req, res) => {
    const { data: rows, error: listError } = await admin.from('login_developer_apps').select('client_id,name,created_at').eq('user_id', req.cur.user.id).order('created_at');
    if (listError) throw listError;
    const apps = await Promise.all((rows ?? []).map(async r => {
      const { data, error } = await admin.auth.admin.oauth.getClient(r.client_id);
      if (error) throw error;
      return { ...r, redirect_uris: data?.redirect_uris ?? [], kind: data?.token_endpoint_auth_method === 'none' ? 'public' : 'confidential' };
    }));
    res.json({ apps });
  }));

  app.post('/api/dev/apps', sameOrigin, strict, guard(true), wrap(async (req, res) => {
    const b = parse(z.object({
      name: z.string().trim().min(2).max(100), website: z.string().max(2048).optional(),
      redirect_uris: z.array(z.string().max(2048)).min(1).max(5), kind: z.enum(['public', 'confidential'])
    }), req.body);
    if (!b.redirect_uris.every(validRedirect) || (b.website && !validRedirect(b.website)))
      return res.status(400).json({ error: 'Addresses must start with https:// (http only for localhost) and have no # part.' });
    const { count, error: countError } = await admin.from('login_developer_apps').select('*', { count: 'exact', head: true }).eq('user_id', req.cur.user.id);
    if (countError) throw countError;
    if ((count ?? 0) >= 10) return res.status(400).json({ error: 'You can register up to 10 apps.' });
    const { data, error } = await admin.auth.admin.oauth.createClient({
      client_name: b.name, client_uri: b.website || undefined, redirect_uris: b.redirect_uris,
      scope: 'openid email profile', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: b.kind === 'public' ? 'none' : 'client_secret_basic'
    });
    if (error || !data) { console.error('create oauth client:', error?.message); return res.status(400).json({ error: 'Couldn’t create the app. Check the details and try again.' }); }
    const { error: e2 } = await admin.from('login_developer_apps').insert({ client_id: data.client_id, user_id: req.cur.user.id, name: b.name });
    if (e2) { await admin.auth.admin.oauth.deleteClient(data.client_id); throw e2; }
    res.json({ client_id: data.client_id, client_secret: data.client_secret ?? null });
  }));

  app.post('/api/dev/apps/delete', sameOrigin, guard(true), wrap(async (req, res) => {
    const b = parse(z.object({ client_id: z.string().max(100) }), req.body);
    if (!(await owns(req.cur.user.id, b.client_id))) return res.status(404).json({ error: 'App not found.' });
    const { error: oauthError } = await admin.auth.admin.oauth.deleteClient(b.client_id);
    if (oauthError) throw oauthError;
    const { error } = await admin.from('login_developer_apps').delete().eq('client_id', b.client_id);
    if (error) throw error;
    res.json({ ok: true });
  }));

  app.post('/api/dev/apps/rotate', sameOrigin, strict, guard(true), wrap(async (req, res) => {
    const b = parse(z.object({ client_id: z.string().max(100) }), req.body);
    if (!(await owns(req.cur.user.id, b.client_id))) return res.status(404).json({ error: 'App not found.' });
    const { data, error } = await admin.auth.admin.oauth.regenerateClientSecret(b.client_id);
    if (error || !data?.client_secret) return res.status(400).json({ error: 'Only apps with a secret can be rotated.' });
    res.json({ client_secret: data.client_secret });
  }));

  // ---------- account ----------
  app.get('/api/account', guard(false), wrap(async (req, res) => {
    const u = req.cur.user, c = await userClient(req.cur);
    const [{ data: f, error: factorError }, { data: ev, error: eventError }, { data: gr, error: grantError }, roles] = await Promise.all([
      c.auth.mfa.listFactors(),
      admin.from('login_events').select('method,role,created_at,client_app_id').eq('user_id', u.id).order('created_at', { ascending: false }).limit(10),
      admin.from('login_app_grants').select('last_used_at,client_app_id').eq('user_id', u.id).order('last_used_at', { ascending: false }),
      rolesOf(u.id)
    ]);
    if (factorError || eventError || grantError) throw factorError || eventError || grantError;
    // OAuth Server may be disabled during initial setup. Keep the account page
    // usable until it is enabled, but expose grant management automatically once live.
    let oauthAvailable = false, oauthGrants = [];
    if (typeof c.auth.oauth?.listGrants === 'function') {
      const oauthResult = await c.auth.oauth.listGrants();
      if (!oauthResult.error) {
        oauthAvailable = true;
        oauthGrants = (oauthResult.data || []).map(g => ({
          clientId: g.client?.id,
          name: g.client?.name || 'Product',
          uri: validRedirect(g.client?.uri || '') ? g.client.uri : null,
          scopes: Array.isArray(g.scopes) ? g.scopes : [],
          grantedAt: g.granted_at
        })).filter(g => typeof g.clientId === 'string' && g.clientId.length > 0);
      } else if (oauthResult.error.code !== 'feature_disabled' && oauthResult.error.status !== 404 && oauthResult.error.statusCode !== 404) {
        throw oauthResult.error;
      }
    }
    const ids = [...new Set([...(ev ?? []), ...(gr ?? [])].map(r => r.client_app_id).filter(Boolean))];
    const { data: apps, error: appsError } = ids.length ? await admin.from('login_client_apps').select('id,name').in('id', ids) : { data: [], error: null };
    if (appsError) throw appsError;
    const nm = Object.fromEntries((apps ?? []).map(a => [a.id, a.name]));
    res.json({
      identifier: ident(u), canChangePassword: !!u.email, canChangeEmail: !!u.email && EMAIL_ENABLED, canDelete: ALLOW_DELETE && !!u.email,
      roles: [...roles], mfa: !!f?.totp?.length,
      events: (ev ?? []).map(e => ({ method: e.method, role: e.role, at: e.created_at, product: nm[e.client_app_id] ?? null })),
      products: (gr ?? []).map(g => ({ name: nm[g.client_app_id] ?? 'Product', at: g.last_used_at })),
      oauthAvailable,
      oauthGrants
    });
  }));

  app.post('/api/account/oauth-grants/revoke', sameOrigin, strict, guard(false), wrap(async (req, res) => {
    const b = parse(z.object({ client_id: z.string().min(1).max(200) }), req.body);
    const c = await userClient(req.cur);
    if (typeof c.auth.oauth?.revokeGrant !== 'function') return res.status(503).json({ error: 'Connected-app management is unavailable right now.' });
    const { error } = await c.auth.oauth.revokeGrant({ clientId: b.client_id });
    if (error) {
      if (error.code === 'feature_disabled' || error.status === 404 || error.statusCode === 404)
        return res.status(503).json({ error: 'Connected-app management is not enabled yet.' });
      throw error;
    }
    // Keep the portal's own per-product usage registry in sync with the Auth
    // server's authoritative OAuth grant revocation.
    const { data: app, error: appError } = await admin.from('login_client_apps')
      .select('id').eq('oauth_client_id', b.client_id).maybeSingle();
    if (appError) throw appError;
    if (app) {
      const { error: cleanupError } = await admin.from('login_app_grants')
        .delete().eq('user_id', req.cur.user.id).eq('client_app_id', app.id);
      if (cleanupError) throw cleanupError;
    }
    res.json({ ok: true });
  }));

  app.post('/api/account/password', sameOrigin, strict, guard(false), wrap(async (req, res) => {
    const b = parse(z.object({ current: z.string().min(1).max(72), password: z.string().min(8).max(72) }), req.body);
    const u = req.cur.user;
    if (!u.email) return res.status(400).json({ error: 'This account has no password.' });
    if (weakPassword(b.password, u.email)) return res.status(400).json({ error: WEAK });
    const { error } = await anon().auth.signInWithPassword({ email: u.email, password: b.current });
    if (error) return res.status(400).json({ error: 'Your current password isn’t right.' });
    const { error: e2 } = await admin.auth.admin.updateUserById(u.id, { password: b.password });
    if (e2) return res.status(400).json({ error: 'Couldn’t set that password. Try a different one.' });
    res.json({ ok: true });
  }));

  app.post('/api/account/signout-all', sameOrigin, guard(false), wrap(async (req, res) => {
    const { error } = await admin.auth.admin.signOut(req.cur.at, 'global');
    if (error) throw error;
    clearCookies(res);
    res.json({ ok: true });
  }));

  // Two-step verification (authenticator app)
  app.post('/api/account/mfa/enroll', sameOrigin, strict, guard(false), wrap(async (req, res) => {
    const c = await userClient(req.cur);
    const { data: f, error: listError } = await c.auth.mfa.listFactors();
    if (listError) throw listError;
    if (f?.totp?.length) return res.status(400).json({ error: 'Two-step verification is already on.' });
    for (const x of f?.all ?? []) if (x.status === 'unverified') await c.auth.mfa.unenroll({ factorId: x.id });
    const { data, error } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator ' + Date.now() });
    if (error || !data) return res.status(400).json({ error: 'Couldn’t start set-up. Try again.' });
    res.json({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }));

  app.post('/api/account/mfa/confirm', sameOrigin, strict, guard(false), wrap(async (req, res) => {
    const b = parse(z.object({ factorId: z.string().max(100), code: z.string().regex(/^\d{6}$/) }), req.body);
    const c = await userClient(req.cur);
    const { data, error } = await c.auth.mfa.challengeAndVerify({ factorId: b.factorId, code: b.code });
    if (error || !data) return res.status(400).json({ error: 'That code didn’t work. Check it and try again.' });
    setCookies(res, data);
    res.json({ ok: true });
  }));

  app.post('/api/account/mfa/disable', sameOrigin, strict, guard(false), wrap(async (req, res) => {
    const b = parse(z.object({ code: z.string().regex(/^\d{6}$/) }), req.body);
    const c = await userClient(req.cur);
    const { data: f, error: listError } = await c.auth.mfa.listFactors();
    if (listError) throw listError;
    const factor = f?.totp?.[0];
    if (!factor) return res.status(400).json({ error: 'Two-step verification is off.' });
    const v = await c.auth.mfa.challengeAndVerify({ factorId: factor.id, code: b.code });
    if (v.error) return res.status(400).json({ error: 'That code didn’t work. Check it and try again.' });
    const { error } = await c.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return res.status(400).json({ error: 'Couldn’t turn it off. Try again.' });
    setCookies(res, v.data);
    res.json({ ok: true });
  }));

  app.post('/api/account/email', sameOrigin, strict, guard(false), wrap(async (req, res) => {
    if (!EMAIL_ENABLED) return res.status(403).json({ error: 'Changing email isn’t switched on yet.' });
    const b = parse(z.object({ email: z.string().email().max(254), password: z.string().min(1).max(72) }), req.body);
    const u = req.cur.user;
    if (!u.email) return res.status(400).json({ error: 'This account has no password.' });
    const { error } = await anon().auth.signInWithPassword({ email: u.email, password: b.password });
    if (error) return res.status(400).json({ error: 'Your current password isn’t right.' });
    const c = await userClient(req.cur);
    const { error: e2 } = await c.auth.updateUser({ email: b.email }, { emailRedirectTo: PUBLIC_ORIGIN + '/account' });
    if (e2) return res.status(400).json({ error: 'Couldn’t change the email. Try a different address.' });
    res.json({ ok: true });
  }));

  // Deletes the account in EVERY Caged Dragon product (they share one login). Off unless ALLOW_ACCOUNT_DELETION=1.
  app.post('/api/account/delete', sameOrigin, strict, guard(false), wrap(async (req, res) => {
    if (!ALLOW_DELETE) return res.status(403).json({ error: 'Account deletion isn’t switched on yet.' });
    const b = parse(z.object({ confirm: z.literal('DELETE'), password: z.string().max(72).optional(), code: z.string().regex(/^\d{6}$/).optional() }), req.body);
    const u = req.cur.user;
    if (!u.email) return res.status(400).json({ error: 'For security, phone-only account deletion is not enabled. Add a verified email or contact Caged Dragon support.' });
    if (u.email) {
      if (!b.password) return res.status(400).json({ error: 'Your current password isn’t right.' });
      const { error } = await anon().auth.signInWithPassword({ email: u.email, password: b.password });
      if (error) return res.status(400).json({ error: 'Your current password isn’t right.' });
    }
    const c = await userClient(req.cur);
    const { data: f } = await c.auth.mfa.listFactors();
    if (f?.totp?.length) {
      if (!b.code) return res.status(400).json({ error: 'Enter the 6-digit code.' });
      const v = await c.auth.mfa.challengeAndVerify({ factorId: f.totp[0].id, code: b.code });
      if (v.error) return res.status(400).json({ error: 'That code didn’t work. Check it and try again.' });
    }
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw error;
    clearCookies(res);
    res.json({ ok: true });
  }));

}
