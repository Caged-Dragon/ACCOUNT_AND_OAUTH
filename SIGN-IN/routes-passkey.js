// Passkeys (WebAuthn). Stored in login_passkeys; the browser never talks to the database.
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';

const b64 = u8 => Buffer.from(u8).toString('base64url');
const fromB64 = s => new Uint8Array(Buffer.from(s, 'base64url'));

export function mountPasskey(app, d) {
  const { z, admin, currentSession, sameOrigin, strict, wrap, parse, seal, unseal, mintSession, proceed, setCookies, cookieBase, PUBLIC_ORIGIN, common, opt, aalOf, hasTotp } = d;
  const mfaRequired = cur => hasTotp(cur.user) && aalOf(cur.at) !== 'aal2';
  const mfaResponse = res => res.status(403).json({ code: 'mfa_required', error: 'Complete two-step verification from the sign-in page, then try again.' });
  const RP_ID = process.env.WEBAUTHN_RP_ID?.trim() || new URL(PUBLIC_ORIGIN).hostname; // must be the site's domain (localhost works for testing)
  const RP_NAME = process.env.WEBAUTHN_RP_NAME?.trim() || 'Caged Dragon';
  const pkCookie = { ...cookieBase, path: '/api/passkey', maxAge: 5 * 60_000 };
  const remember = (res, o) => res.cookie('cd_pk', seal({ ...o, exp: Date.now() + 300_000 }), pkCookie);
  const recall = (req, kind) => { try { const p = unseal(String(req.cookies.cd_pk || '')); return p.exp > Date.now() && p.kind === kind ? p : null; } catch { return null; } };
  const forget = res => res.clearCookie('cd_pk', { ...cookieBase, path: '/api/passkey' });
  const expired = res => res.status(400).json({ error: 'That step expired. Sign in again.' });

  // ---- add a passkey (signed in, on the account page) ----
  app.post('/api/passkey/register/options', sameOrigin, strict, wrap(async (req, res) => {
    const cur = await currentSession(req, res);
    if (!cur) return res.status(401).json({ error: 'Sign in first.' });
    if (mfaRequired(cur)) return mfaResponse(res);
    if (!cur.user.email) return res.status(400).json({ error: 'Add an email to your account to use passkeys.' });
    const { data: rows, error: rowsError } = await admin.from('login_passkeys').select('id,transports').eq('user_id', cur.user.id);
    if (rowsError) throw rowsError;
    const options = await generateRegistrationOptions({
      rpName: RP_NAME, rpID: RP_ID, userName: cur.user.email, userID: new TextEncoder().encode(cur.user.id), attestationType: 'none',
      excludeCredentials: (rows ?? []).map(r => ({ id: r.id, transports: r.transports ?? undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
    });
    remember(res, { kind: 'reg', uid: cur.user.id, challenge: options.challenge });
    res.json(options);
  }));

  app.post('/api/passkey/register/verify', sameOrigin, strict, wrap(async (req, res) => {
    const b = parse(z.object({ response: z.any(), name: z.string().trim().max(60).optional() }), req.body);
    const cur = await currentSession(req, res);
    if (!cur) return res.status(401).json({ error: 'Sign in first.' });
    if (mfaRequired(cur)) return mfaResponse(res);
    const p = recall(req, 'reg');
    if (!p || p.uid !== cur.user.id) return expired(res);
    const v = await verifyRegistrationResponse({ response: b.response, expectedChallenge: p.challenge, expectedOrigin: PUBLIC_ORIGIN, expectedRPID: RP_ID, requireUserVerification: false }).catch(() => null);
    if (!v?.verified) return res.status(400).json({ error: 'Couldn’t verify that passkey.' });
    const c = v.registrationInfo.credential;
    const { error } = await admin.from('login_passkeys').insert({
      id: c.id, user_id: cur.user.id, public_key: b64(c.publicKey), counter: c.counter, transports: c.transports ?? null,
      device_type: v.registrationInfo.credentialDeviceType, backed_up: v.registrationInfo.credentialBackedUp, name: b.name || 'Passkey'
    });
    if (error) throw error;
    forget(res); res.json({ ok: true });
  }));

  // ---- sign in with a passkey (no password, no code) ----
  app.post('/api/passkey/login/options', sameOrigin, strict, wrap(async (req, res) => {
    const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'preferred' });
    remember(res, { kind: 'auth', challenge: options.challenge });
    res.json(options);
  }));

  app.post('/api/passkey/login/verify', sameOrigin, strict, wrap(async (req, res) => {
    const b = parse(z.object({ ...common, response: z.any() }), req.body);
    const p = recall(req, 'auth');
    if (!p) return expired(res);
    const { data: row, error: rowError } = await admin.from('login_passkeys').select('*').eq('id', String(b.response?.id || '')).maybeSingle();
    if (rowError) throw rowError;
    if (!row) return res.status(400).json({ error: 'That passkey isn’t registered here.' });
    const v = await verifyAuthenticationResponse({
      response: b.response, expectedChallenge: p.challenge, expectedOrigin: PUBLIC_ORIGIN, expectedRPID: RP_ID, requireUserVerification: false,
      credential: { id: row.id, publicKey: fromB64(row.public_key), counter: Number(row.counter), transports: row.transports ?? undefined }
    }).catch(() => null);
    if (!v?.verified) return res.status(400).json({ error: 'Couldn’t verify that passkey.' });
    const { error: counterError } = await admin.from('login_passkeys').update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', row.id);
    if (counterError) throw counterError;
    const { data: u, error: userError } = await admin.auth.admin.getUserById(row.user_id);
    if (userError) throw userError;
    if (!u?.user?.email) return res.status(400).json({ error: 'Couldn’t verify that passkey.' });
    const s = await mintSession(u.user.email);
    forget(res);
    // Let the shared flow enforce enrolled TOTP unless this passkey verified the user locally.
    res.json(await proceed(req, res, s, u.user, 'passkey', { ...opt(b), strong: !!v.authenticationInfo.userVerified }));
  }));

  // ---- manage ----
  app.get('/api/passkey/list', wrap(async (req, res) => {
    const cur = await currentSession(req, res);
    if (!cur) return res.status(401).json({ error: 'Sign in first.' });
    if (mfaRequired(cur)) return mfaResponse(res);
    const { data, error } = await admin.from('login_passkeys').select('id,name,created_at,last_used_at,backed_up').eq('user_id', cur.user.id).order('created_at');
    if (error) throw error;
    res.json({ passkeys: data ?? [], canAdd: !!cur.user.email });
  }));
  app.post('/api/passkey/delete', sameOrigin, wrap(async (req, res) => {
    const b = parse(z.object({ id: z.string().max(512) }), req.body);
    const cur = await currentSession(req, res);
    if (!cur) return res.status(401).json({ error: 'Sign in first.' });
    if (mfaRequired(cur)) return mfaResponse(res);
    const { error } = await admin.from('login_passkeys').delete().eq('id', b.id).eq('user_id', cur.user.id);
    if (error) throw error;
    res.json({ ok: true });
  }));
}
