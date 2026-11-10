const $ = id => document.getElementById(id);
const t = (s, v) => T.t(s, v);
const say = (s, k) => { $('msg').textContent = s || ''; $('msg').className = k || ''; };
async function api(path, body) {
  const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 || (r.status === 403 && d.code === 'mfa_required')) {
    location.replace('/?next=' + encodeURIComponent('/account'));
    throw new Error('redirecting');
  }
  if (!r.ok) throw new Error(t(d.error || 'Something went wrong. Try again.'));
  return d;
}
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const when = s => new Date(s).toLocaleString(T.lang === 'en' ? undefined : T.lang, { dateStyle: 'medium', timeStyle: 'short' });
const METHOD = { email: 'Email', phone: 'Mobile', caged_dragon: 'Continue with Caged-Dragon', passkey: 'Passkey' };
const next = new URLSearchParams(location.search).get('next');
let factorId = null, A = null, P = null;

function draw() {
  if (!A) return;
  $('who').textContent = A.identifier;
  $('roles').replaceChildren(...A.roles.map(r => el('span', { className: 'badge' + (r === 'developer' ? ' dev' : ''), textContent: t(r === 'developer' ? 'Developer' : 'User') })));
  $('devLink').hidden = !A.roles.includes('developer');
  $('emailSection').hidden = !A.canChangeEmail; $('delSection').hidden = !A.canDelete; $('delPwRow').hidden = !A.canChangePassword; $('delCodeRow').hidden = !A.mfa;
  $('mfaOn').hidden = !A.mfa; $('mfaOff').hidden = A.mfa; $('pwSection').hidden = !A.canChangePassword;
  $('products').replaceChildren(...(A.products.length ? A.products.map(p => el('div', { className: 'item' }, el('b', { textContent: p.name }), el('span', { className: 'fine', textContent: t(' last used ') + when(p.at) }))) : [el('p', { className: 'fine', textContent: t('None yet.') })]));
  $('oauthGrantSection').hidden = !A.oauthAvailable;
  const grants = A.oauthGrants || [];
  $('oauthGrants').replaceChildren(...(grants.length ? grants.map(g => {
    const revoke = el('button', { className: 'link', type: 'button', textContent: t('Revoke access') });
    revoke.onclick = () => run(async () => {
      if (!confirm(t('Remove {name} access?', { name: g.name }))) return;
      await api('account/oauth-grants/revoke', { client_id: g.clientId });
      say(t('App access removed.'), 'ok');
      await load();
    });
    const details = [g.scopes.length ? g.scopes.join(', ') : '', g.grantedAt ? t('Connected ') + when(g.grantedAt) : ''].filter(Boolean).join(' · ');
    const host = g.uri ? (() => { try { return new URL(g.uri).hostname; } catch { return ''; } })() : '';
    return el('div', { className: 'item' }, el('b', { textContent: g.name }), el('span', { className: 'fine', textContent: host ? ' · ' + host : '' }), el('span', { className: 'fine', textContent: details }), revoke);
  }) : [el('p', { className: 'fine', textContent: t('No connected apps yet.') })]));
  $('events').replaceChildren(...(A.events.length ? A.events.map(e => el('div', { className: 'item fine', textContent: `${when(e.at)} · ${t(METHOD[e.method] || e.method)} · ${t(e.role === 'developer' ? 'Developer' : 'User')}${e.product ? ' · ' + e.product : ''}` })) : [el('p', { className: 'fine', textContent: t('Nothing yet.') })]));
  if (P) {
    $('pkAdd').hidden = !(P.canAdd && window.PublicKeyCredential);
    $('passkeys').replaceChildren(...P.passkeys.map(k => {
      const rm = el('button', { className: 'link', type: 'button', textContent: t('Remove') });
      rm.onclick = () => run(async () => { await api('passkey/delete', { id: k.id }); say(t('Passkey removed.'), 'ok'); await load(); });
      return el('div', { className: 'item' }, el('b', { textContent: k.name }), el('span', { className: 'fine', textContent: ' · ' + when(k.created_at) + ' · ' }), rm);
    }));
  }
}
async function load() { [A, P] = await Promise.all([api('account'), api('passkey/list')]); draw(); }
const run = async fn => { say(''); try { await fn(); } catch (e) { if (e.message !== 'redirecting') say(e.name === 'NotAllowedError' ? t('Cancelled.') : e.message, 'err'); } };

$('mfaStart').onclick = () => run(async () => {
  const d = await api('account/mfa/enroll', {}); factorId = d.factorId;
  $('qr').src = d.qr; $('secret').textContent = d.secret; $('mfaSetup').hidden = false; $('mfaStart').hidden = true; $('mfaCode').focus();
});
$('mfaConfirm').onsubmit = e => { e.preventDefault(); run(async () => {
  await api('account/mfa/confirm', { factorId, code: $('mfaCode').value.trim() });
  $('mfaSetup').hidden = true; $('mfaStart').hidden = false; $('mfaCode').value = ''; say(t('Two-step verification is on.'), 'ok'); await load();
}); };
$('mfaOffForm').onsubmit = e => { e.preventDefault(); run(async () => {
  await api('account/mfa/disable', { code: $('offCode').value.trim() }); $('offCode').value = ''; say(t('Two-step verification is off.'), 'ok'); await load();
}); };
$('pkAdd').onclick = () => run(async () => {
  const optionsJSON = await api('passkey/register/options', {});
  const response = await SimpleWebAuthnBrowser.startRegistration({ optionsJSON });
  await api('passkey/register/verify', { response, name: 'Passkey ' + new Date().toLocaleDateString() });
  say(t('Passkey added.'), 'ok'); await load();
});
$('pwForm').onsubmit = e => { e.preventDefault(); run(async () => {
  if ($('next').value.length < 8) throw new Error(t('Password needs at least 8 characters.'));
  await api('account/password', { current: $('cur').value, password: $('next').value }); $('pwForm').reset(); say(t('Password changed.'), 'ok');
}); };
$('emailForm').onsubmit = e => { e.preventDefault(); run(async () => {
  await api('account/email', { email: $('newEmail').value.trim(), password: $('emailPw').value }); $('emailForm').reset(); say(t('Check both inboxes to confirm the change.'), 'ok');
}); };
$('delForm').onsubmit = e => { e.preventDefault(); run(async () => {
  if ($('delConfirm').value.trim() !== 'DELETE') throw new Error(t('Type DELETE to confirm.'));
  if (!confirm(t('This permanently deletes your account in every Caged Dragon product. This can’t be undone.'))) return;
  await api('account/delete', { confirm: 'DELETE', password: $('delPw').value || undefined, code: $('delCode').value.trim() || undefined });
  say(t('Account deleted.'), 'ok'); setTimeout(() => location.replace('/'), 1200);
}); };
$('out').onclick = () => run(async () => { await api('account/signout-all', {}); location.replace('/'); });
window.addEventListener('langchange', draw);
if (next && /^\/(?!\/)[^\s\\]{0,2047}$/.test(next)) { $('cont').hidden = false; $('contLink').href = next; }
T.init(); run(load);
