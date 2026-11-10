/* Caged Dragon OIDC client for first-party browser applications.
 * Uses authorization-code + PKCE (S256). Tokens are memory-only; prefer a BFF
 * for production apps that can keep refresh tokens on their own server.
 */
(() => {
  'use strict';
  const script = document.currentScript;
  const portalOrigin = new URL(script.src).origin;
  const authUrlRaw = script.dataset.authUrl;
  if (!authUrlRaw) throw new Error('Caged Dragon SDK needs data-auth-url pointing to the Supabase Auth endpoint.');
  let authUrl;
  try {
    const parsed = new URL(authUrlRaw);
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error('HTTPS required');
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    if (!parsed.pathname.endsWith('/auth/v1')) throw new Error('Expected a Supabase /auth/v1 endpoint');
    parsed.search = ''; parsed.hash = '';
    authUrl = parsed.href.replace(/\/+$/, '');
  } catch { throw new Error('Caged Dragon data-auth-url must be a valid HTTPS Supabase /auth/v1 endpoint.'); }
  const authEndpoint = path => authUrl + '/' + String(path).replace(/^\/+/, '');
  const portalLogout = portalOrigin + '/logout';
  const random = n => { const b = crypto.getRandomValues(new Uint8Array(n)); return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };
  const digest = async s => { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); };
  let tokenSet = null;
  const config = (o={}) => {
    const clientId = o.clientId || script.dataset.clientId;
    const redirectUri = o.redirectUri || script.dataset.redirectUri || location.origin + location.pathname;
    if (!clientId) throw new Error('Caged Dragon clientId is required.');
    const u = new URL(redirectUri);
    if (u.origin !== location.origin) throw new Error('redirectUri must be on this website origin.');
    return { clientId, redirectUri: u.href };
  };
  async function signIn(options={}) {
    const c = config(options), verifier = random(48), state = random(24), nonce = random(24);
    const challenge = await digest(verifier);
    sessionStorage.setItem('cd_oidc_pending', JSON.stringify({ ...c, verifier, state, nonce, created: Date.now() }));
    const u = new URL(authEndpoint('oauth/authorize'));
    for (const [k,v] of Object.entries({client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:'openid email profile',code_challenge:challenge,code_challenge_method:'S256',state,nonce})) u.searchParams.set(k,v);
    location.assign(u.href);
  }
  async function complete() {
    const p = new URLSearchParams(location.search), code = p.get('code'), returnedState = p.get('state');
    const oauthError = p.get('error'), returnedIssuer = p.get('iss');
    if (!code && !oauthError) return null;
    const pending = JSON.parse(sessionStorage.getItem('cd_oidc_pending') || 'null');
    sessionStorage.removeItem('cd_oidc_pending');
    for (const key of ['code','state','iss','error','error_description']) p.delete(key);
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
    if (!pending || Date.now()-pending.created > 5*60*1000) throw new Error('Sign-in expired. Please try again.');
    if (returnedState !== pending.state) throw new Error('Sign-in state validation failed.');
    if (returnedIssuer && returnedIssuer !== authUrl) throw new Error('The authorization response came from an unexpected issuer.');
    if (oauthError) throw new Error('Caged Dragon sign-in was cancelled or denied.');
    if (!code) throw new Error('The authorization response did not include a code.');
    const body = new URLSearchParams({grant_type:'authorization_code',code,client_id:pending.clientId,redirect_uri:pending.redirectUri,code_verifier:pending.verifier});
    const r = await fetch(authEndpoint('oauth/token'), {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,credentials:'omit'});
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token || !data.id_token) throw new Error('Could not complete Caged Dragon sign-in.');
    let idClaims;
    try {
      const encoded = data.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      idClaims = JSON.parse(atob(encoded + '='.repeat((4 - encoded.length % 4) % 4)));
    } catch { throw new Error('The identity token is invalid.'); }
    const audiences = Array.isArray(idClaims.aud) ? idClaims.aud : [idClaims.aud];
    const now = Math.floor(Date.now() / 1000);
    if (idClaims.iss !== authUrl || idClaims.nonce !== pending.nonce || !audiences.includes(pending.clientId) ||
        !Number.isFinite(Number(idClaims.exp)) || Number(idClaims.exp) <= now ||
        (idClaims.nbf != null && Number(idClaims.nbf) > now + 5)) {
      throw new Error('The identity token does not match this sign-in request.');
    }
    // These browser checks are defense in depth only. Product backends must verify
    // the JWT signature, issuer, audience, nonce and expiry against the Supabase JWKS.
    const ur = await fetch(authEndpoint('oauth/userinfo'), {headers:{Authorization:'Bearer '+data.access_token},credentials:'omit'});
    const claims = await ur.json().catch(() => ({}));
    if (!ur.ok || !claims.sub) throw new Error('Could not load the signed-in account.');
    const user = { id:claims.sub, sub:claims.sub, email:claims.email, email_verified:claims.email_verified === true, phone:claims.phone_number, phone_verified:claims.phone_number_verified === true, user_metadata:{ full_name:claims.name, avatar_url:claims.picture } };
    tokenSet = { access_token:data.access_token, refresh_token:data.refresh_token || null, client_id:pending.clientId, expires_at:Date.now()+(data.expires_in||3600)*1000, user };
    return { user, accessToken:tokenSet.access_token, expiresAt:tokenSet.expires_at };
  }
  window.CagedDragon = {
    signIn,
    async complete() { return complete(); },
    getSession() {
      if (!tokenSet) return null;
      const { refresh_token, client_id, ...safe } = tokenSet;
      return { ...safe };
    },
    async refreshSession() {
      if (!tokenSet?.refresh_token || !tokenSet?.client_id) throw new Error('No refreshable Caged Dragon session is available.');
      const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokenSet.refresh_token, client_id: tokenSet.client_id });
      const r = await fetch(authEndpoint('oauth/token'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, credentials: 'omit' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.access_token) { tokenSet = null; throw new Error('Your Caged Dragon session has expired. Please sign in again.'); }
      const ur = await fetch(authEndpoint('oauth/userinfo'), { headers: { Authorization: 'Bearer ' + data.access_token }, credentials: 'omit' });
      const claims = await ur.json().catch(() => ({}));
      if (!ur.ok || !claims.sub) { tokenSet = null; throw new Error('Could not refresh the signed-in account.'); }
      const user = { id: claims.sub, sub: claims.sub, email: claims.email, email_verified: claims.email_verified === true, phone: claims.phone_number, phone_verified: claims.phone_number_verified === true, user_metadata: { full_name: claims.name, avatar_url: claims.picture } };
      tokenSet = { access_token: data.access_token, refresh_token: data.refresh_token || tokenSet.refresh_token, client_id: tokenSet.client_id, expires_at: Date.now() + (data.expires_in || 3600) * 1000, user };
      return window.CagedDragon.getSession();
    },
    async getValidSession() {
      if (!tokenSet) return null;
      if (tokenSet.expires_at <= Date.now() + 60_000) await window.CagedDragon.refreshSession();
      return window.CagedDragon.getSession();
    },
    async signOut(options = {}) {
      tokenSet = null;
      // Product-local sign-out is the default. Global SSO sign-out is explicit.
      if (options.global === true) {
        const u = new URL(portalLogout); u.searchParams.set('scope', 'global'); u.searchParams.set('redirect_to', location.href);
        location.assign(u.href);
      }
    }
  };
})();
