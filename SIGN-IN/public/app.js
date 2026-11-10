const $ = id => document.getElementById(id);
const t = (s, v) => T.t(s, v);
const qs = new URLSearchParams(location.search);
const explicitRedirect = qs.get('redirect_to') || qs.get('redirect') || qs.get('return_to') || '';
const redirectTo = explicitRedirect || document.referrer || '';
const nextPath = /^\/(?!\/)[^\s\\]{0,2047}$/.test(qs.get('next') || '') ? qs.get('next') : '';
const requireMfa = qs.get('mfa') === 'required';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const saved = (() => { try { return localStorage.getItem('cd_role'); } catch { return null; } })();
let role = (qs.get('role') || saved) === 'developer' ? 'developer' : 'user';
let mode = 'signin';                                 // signin | reset | mfa
let ctx = { client: null, account: null }, isSignUp = false, phoneValue = '', left = 0, cdTimer;
let features = { sms: false, mail: false, passkeys: true };
let captchaOn = false, captchaToken = '', widget = null;

const base = () => ({ redirect_to: redirectTo, role, next: nextPath || undefined, require_mfa: requireMfa || undefined });
const cap = () => (captchaOn ? { captcha: captchaToken } : {});
function say(text, kind) { const m = $('msg'); m.textContent = text || ''; m.className = kind || ''; }
function busy(on) { document.querySelectorAll('button.go,button.cd').forEach(b => b.disabled = on); }
function needCaptcha() { if (captchaOn && !captchaToken) { say(t('Complete the check first.'), 'err'); return true; } return false; }
function resetCaptcha() { if (captchaOn && widget !== null) { captchaToken = ''; turnstile.reset(widget); } }

async function api(path, body) {
  const r = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(t(d.error || 'Something went wrong. Try again.'));
  if (d.pending) d.pending = t(d.pending);
  return d;
}
async function call(path, body) {
  busy(true); say('');
  try { return await api(path, body); } catch (e) { say(e.message, 'err'); return null; }
  finally { busy(false); if (body && body.captcha !== undefined) resetCaptcha(); }
}

// Everything whose text depends on language, role or mode
function render() {
  const dev = role === 'developer';
  $('card').dataset.role = role;
  $('roleUser').setAttribute('aria-selected', !dev); $('roleDev').setAttribute('aria-selected', dev);
  $('title').textContent = t(mode === 'reset' ? 'Set a new password' : mode === 'mfa' ? 'Two-step verification' : dev ? 'Developer sign in' : 'Sign in');
  $('sub').textContent = t(mode === 'reset' ? 'Choose a password you haven’t used elsewhere.' : mode === 'mfa' ? 'Enter the 6-digit code from your authenticator app.'
    : dev ? 'Publish your products and grow with Caged Dragon.' : 'Use Caged Dragon products and unlock their benefits.');
  $('emailGo').textContent = t(isSignUp ? (dev ? 'Create developer account' : 'Create account') : 'Sign in');
  $('emailToggleText').textContent = t(isSignUp ? 'Already have an account?' : dev ? 'New developer?' : 'New to Caged Dragon?');
  $('emailToggle').textContent = t(isSignUp ? 'Sign in' : dev ? 'Create a developer account' : 'Create an account');
  $('pwToggle').textContent = t($('password').type === 'password' ? 'Show' : 'Hide');
  $('newPwToggle').textContent = t($('newPw').type === 'password' ? 'Show' : 'Hide');
  $('resend').textContent = left > 0 ? t('Resend code in ') + left + 's' : t('Resend code');
  $('forgot').hidden = isSignUp || !features.mail;
}
function applyFeatures(f) {
  if (f) features = f;
  $('tabs').hidden = !features.sms; if (!features.sms) { $('panePhone').hidden = true; $('paneEmail').hidden = false; }
  $('pkBtn').hidden = !(features.passkeys && window.PublicKeyCredential);
  $('signinDivider').hidden = $('pkBtn').hidden;
  render();
}
function setRole(r) { role = r; try { localStorage.setItem('cd_role', r); } catch {} $('devPrompt').hidden = true; say(''); render(); }
$('roleUser').onclick = () => setRole('user'); $('roleDev').onclick = () => setRole('developer');
document.querySelector('.roles').addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const r = role === 'user' ? 'developer' : 'user'; setRole(r); $(r === 'user' ? 'roleUser' : 'roleDev').focus();
});
window.addEventListener('langchange', render);

function showAccount(a) {
  ctx.account = a;
  if (!$('switch')) {
    const b = document.createElement('button');
    b.className = 'link'; b.type = 'button'; b.id = 'switch';
    b.textContent = t('Use a different account');
    b.dataset.en = 'Use a different account';
    b.onclick = async () => { await api('logout', {}); location.reload(); };
    $('after').append(' · ', b);
  }
  if (!ctx.client && !nextPath) { $('after').hidden = false; $('devLinkWrap').hidden = !a.roles?.includes('developer'); }
  render();
}
function showMode(m) {
  mode = m;
  $('signin').hidden = m !== 'signin'; $('roles').hidden = m !== 'signin'; $('target').hidden = true;
  $('resetBox').hidden = m !== 'reset'; $('mfaForm').hidden = m !== 'mfa';
  render(); if (m === 'mfa') $('mfaCode').focus();
}
function done(d) {
  if (!d) return;
  if (d.pending) return say(d.pending, 'ok');
  if (d.mfa) { say(''); return showMode('mfa'); }
  if (d.account) showAccount(d.account);
  if (d.needsDeveloper) { $('devPrompt').hidden = false; return say(''); }
  if (d.needsMfaSetup) { $('mfaNeeded').hidden = false; $('mfaSetupLink').href = '/account?next=' + encodeURIComponent(location.pathname + location.search); return say(''); }
  if (d.redirect) {
    const back = ctx.client && !nextPath;
    say(t('Signed in. ') + (back ? t('Taking you back to {name}…', { name: ctx.client.name }) : t('One moment…')), 'ok');
    $('brand').classList.add('open');
    setTimeout(() => location.replace(d.redirect), reduce ? 0 : 700);
  } else say(t('You’re signed in to Caged Dragon. Your account is ready to use with connected products.'), 'ok');
}

$('devEnable').onclick = async () => done(await call('developer/enable', base()));

function tab(w) {
  const e = w === 'email';
  $('paneEmail').hidden = !e; $('panePhone').hidden = e;
  $('tabEmail').setAttribute('aria-selected', e); $('tabPhone').setAttribute('aria-selected', !e); say('');
}
$('tabEmail').onclick = () => tab('email'); $('tabPhone').onclick = () => tab('phone');

$('emailToggle').onclick = () => { isSignUp = !isSignUp; $('password').autocomplete = isSignUp ? 'new-password' : 'current-password'; say(''); render(); };
$('paneEmail').onsubmit = async e => {
  e.preventDefault();
  const email = $('email').value.trim(), password = $('password').value;
  if (!/^\S+@\S+\.\S+$/.test(email)) return say(t('Enter a valid email address.'), 'err');
  if (password.length < 8) return say(t('Password needs at least 8 characters.'), 'err');
  if (needCaptcha()) return;
  done(await call('email', { ...base(), ...cap(), email, password, mode: isSignUp ? 'signup' : 'signin' }));
};
$('forgot').onclick = async () => {
  const email = $('email').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { say(t('Enter your email above first.'), 'err'); return $('email').focus(); }
  if (needCaptcha()) return;
  if (await call('password/forgot', { ...base(), ...cap(), email })) say(t('If that email has an account, we’ve sent a reset link. Check your inbox.'), 'ok');
};

function wirePw(input, btn) {
  $(btn).onclick = () => { const show = $(input).type === 'password'; $(input).type = show ? 'text' : 'password'; $(btn).setAttribute('aria-pressed', show); render(); };
}
wirePw('password', 'pwToggle'); wirePw('newPw', 'newPwToggle');

function cooldown(s = 30) {
  clearInterval(cdTimer); left = s; $('resend').disabled = true; render();
  cdTimer = setInterval(() => { left--; if (left <= 0) { clearInterval(cdTimer); $('resend').disabled = false; } render(); }, 1000);
}
function normalizePhone(v) {
  const d = v.replace(/[^\d+]/g, '');
  if (/^\+\d{8,15}$/.test(d)) return d;
  if (/^\d{10}$/.test(d)) return '+91' + d; // 10 digits: assume India
  return null;
}
$('phoneStep1').onsubmit = async e => {
  e.preventDefault();
  const p = normalizePhone($('phone').value);
  if (!p) return say(t('Enter your number with country code, like +91 98765 43210.'), 'err');
  if (needCaptcha()) return;
  if (!(await call('phone/send', { phone: p, ...cap() }))) return;
  phoneValue = p; $('phoneStep1').hidden = true; $('phoneStep2').hidden = false;
  say(t('We sent a 6-digit code to {phone}.', { phone: p }), 'ok'); $('otp').focus(); cooldown();
};
$('resend').onclick = async () => {
  if (needCaptcha()) return;
  if (await call('phone/send', { phone: phoneValue, ...cap() })) { say(t('New code sent.'), 'ok'); cooldown(); }
};
$('phoneStep2').onsubmit = async e => {
  e.preventDefault();
  const token = $('otp').value.trim();
  if (!/^\d{6}$/.test(token)) return say(t('Enter the 6-digit code.'), 'err');
  done(await call('phone/verify', { ...base(), phone: phoneValue, token }));
};
$('phoneBack').onclick = () => { clearInterval(cdTimer); left = 0; $('phoneStep1').hidden = false; $('phoneStep2').hidden = true; $('otp').value = ''; say(''); render(); };

$('mfaForm').onsubmit = async e => {
  e.preventDefault();
  const code = $('mfaCode').value.trim();
  if (!/^\d{6}$/.test(code)) return say(t('Enter the 6-digit code.'), 'err');
  done(await call('mfa/verify', { code }));
};

$('pkBtn').onclick = async () => {
  busy(true); say('');
  try {
    const optionsJSON = await api('passkey/login/options', {});
    const response = await SimpleWebAuthnBrowser.startAuthentication({ optionsJSON });
    done(await api('passkey/login/verify', { ...base(), response }));
  } catch (e) { say(e.name === 'NotAllowedError' ? t('Cancelled.') : e.message, 'err'); }
  finally { busy(false); }
};

function showReset(tokens) {
  history.replaceState(null, '', location.pathname + location.search);
  showMode('reset');
  $('resetBox').onsubmit = async e => {
    e.preventDefault();
    const password = $('newPw').value;
    if (password.length < 8) return say(t('Password needs at least 8 characters.'), 'err');
    if (!(await call('password/reset', { access_token: tokens.access_token, password }))) return;
    say(t('Password updated. Signing you in…'), 'ok');
    showMode('signin');
    done(await call('adopt', { ...base(), ...tokens }));
  };
}

function initCaptcha(siteKey) {
  if (!siteKey) return;
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
  s.onload = () => { widget = turnstile.render('#captcha', { sitekey: siteKey, callback: k => captchaToken = k, 'expired-callback': () => captchaToken = '', 'error-callback': () => captchaToken = '' }); };
  document.head.appendChild(s); $('captcha').hidden = false; captchaOn = true;
}

(async () => {
  T.init(); render();
  const ctxUrl = 'context?explicit=' + (explicitRedirect ? 1 : 0) + '&redirect_to=' + encodeURIComponent(redirectTo);
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('access_token') && h.get('refresh_token')) { // back from an email link
    const tokens = { access_token: h.get('access_token'), refresh_token: h.get('refresh_token') };
    try { const c = await api(ctxUrl); ctx.client = c.client; initCaptcha(c.captcha); applyFeatures(c.features); } catch {}
    if (h.get('type') === 'recovery') return showReset(tokens);
    history.replaceState(null, '', location.pathname + location.search);
    return done(await call('adopt', { ...base(), ...tokens, join: qs.get('join') === '1' }));
  }
  try {
    const c = await api(ctxUrl);
    ctx.client = c.client; initCaptcha(c.captcha); applyFeatures(c.features);
    const box = $('target');
    if (c.client) { box.textContent = t('Signing in to {name}. You’ll go back there when you’re done.', { name: c.client.name }); box.hidden = false; }
    else if (c.rejected) { box.textContent = t('This product isn’t registered with Caged Dragon, so we can’t send you back to it after sign-in.'); box.classList.add('warn'); box.hidden = false; }
    if (c.links?.terms && c.links?.privacy) { $('termsLink').href = c.links.terms; $('privacyLink').href = c.links.privacy; $('legal').hidden = false; }
    if (c.account) {
      showAccount(c.account);
      if (c.client && !nextPath) {
        // The user already chose the product's sign-in action. Reuse the valid
        // Caged Dragon session and return to that product without a second CTA.
        say(t('One moment…'));
        done(await call('continue', base()));
      }
    }
  } catch { say(t('Can’t reach the sign-in service. Try again in a moment.'), 'err'); }
})();
