/* Caged Dragon OIDC client for first-party browser applications.
 * Uses authorization-code + PKCE (S256). Tokens are memory-only; prefer a BFF
 * for production apps that can keep refresh tokens on their own server.
 */
(() => {
  'use strict';
  const script = document.currentScript;
  const issuer = new URL(script.src).origin;
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
    const u = new URL(issuer + '/auth/v1/oauth/authorize');
    for (const [k,v] of Object.entries({client_id:c.clientId,redirect_uri:c.redirectUri,response_type:'code',scope:'openid email profile',code_challenge:challenge,code_challenge_method:'S256',state,nonce})) u.searchParams.set(k,v);
    location.assign(u.href);
  }
  async function complete() {
    const p = new URLSearchParams(location.search), code = p.get('code'), returnedState = p.get('state'), oauthError = p.get('error');
    if (oauthError) throw new Error('Caged Dragon sign-in was cancelled or denied.');
    if (!code) return null;
    const pending = JSON.parse(sessionStorage.getItem('cd_oidc_pending') || 'null');
    sessionStorage.removeItem('cd_oidc_pending');
    p.delete('code'); p.delete('state'); p.delete('iss');
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
    if (!pending || Date.now()-pending.created > 5*60*1000 || p.has('error')) throw new Error('Sign-in expired. Please try again.');
    if (returnedState !== pending.state) throw new Error('Sign-in state validation failed.');
    const body = new URLSearchParams({grant_type:'authorization_code',code,client_id:pending.clientId,redirect_uri:pending.redirectUri,code_verifier:pending.verifier});
    const r = await fetch(issuer + '/auth/v1/oauth/token', {method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,credentials:'omit'});
    const data = await r.json();
    if (!r.ok || !data.access_token || !data.id_token) throw new Error('Could not complete Caged Dragon sign-in.');
    let idClaims;
    try { idClaims = JSON.parse(atob(data.id_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); } catch { throw new Error('The identity token is invalid.'); }
    if (idClaims.nonce !== pending.nonce || idClaims.aud !== pending.clientId || Number(idClaims.exp) * 1000 <= Date.now()) throw new Error('The identity token does not match this sign-in request.');
    const ur = await fetch(issuer + '/auth/v1/user', {headers:{Authorization:'Bearer '+data.access_token},credentials:'omit'});
    const user = await ur.json();
    if (!ur.ok) throw new Error('Could not load the signed-in account.');
    tokenSet = { access_token:data.access_token, refresh_token:data.refresh_token || null, expires_at:Date.now()+(data.expires_in||3600)*1000, user };
    return { user, accessToken:tokenSet.access_token, expiresAt:tokenSet.expires_at };
  }
  window.CagedDragon = {
    signIn,
    async complete() { return complete(); },
    getSession() { return tokenSet ? { ...tokenSet, refresh_token:undefined } : null; },
    async signOut() {
      tokenSet = null;
      const u = new URL(issuer + '/logout'); u.searchParams.set('redirect_to', location.href);
      location.assign(u.href);
    }
  };
})();
