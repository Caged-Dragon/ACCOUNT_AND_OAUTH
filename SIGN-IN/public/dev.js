const $ = id => document.getElementById(id);
const t = (s, v) => T.t(s, v);
const say = (s, k) => { $('msg').textContent = s || ''; $('msg').className = k || ''; };
const goLogin = () => location.replace('/?role=developer&next=' + encodeURIComponent('/developer'));
async function api(path, body) {
  const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) { goLogin(); throw new Error('redirecting'); }
  if (!r.ok) throw new Error(t(d.error || 'Something went wrong. Try again.'));
  return d;
}
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };

let lastApps = null;
async function load() {
  const { apps } = await api('dev/apps'); lastApps = apps; draw(apps);
}
function draw(apps) {
  const box = $('apps'); box.replaceChildren();
  if (!apps.length) box.append(el('p', { className: 'fine', textContent: t('No products yet. Register your first one below.') }));
  for (const a of apps) {
    const del = el('button', { className: 'link', type: 'button', textContent: t('Delete') });
    del.onclick = async () => { if (confirm(t('Delete {name}? People will no longer be able to sign in to it.', { name: a.name }))) { try { await api('dev/apps/delete', { client_id: a.client_id }); load(); } catch (e) { say(e.message, 'err'); } } };
    const row = el('div', { className: 'item' }, el('b', { textContent: a.name }), el('span', { className: 'badge', textContent: t(a.kind === 'public' ? 'No secret' : 'Has secret') }),
      el('div', { className: 'fine' }, t('Client ID: '), el('code', { textContent: a.client_id })), el('div', { className: 'fine', textContent: t('Redirects: ') + a.redirect_uris.join(', ') }));
    if (a.kind === 'confidential') {
      const rot = el('button', { className: 'link', type: 'button', textContent: t('New secret') });
      rot.onclick = async () => { if (!confirm(t('Make a new secret? The old one stops working.'))) return; try { const d = await api('dev/apps/rotate', { client_id: a.client_id }); showCreated(a.client_id, d.client_secret); } catch (e) { say(e.message, 'err'); } };
      row.append(rot, ' · ');
    }
    row.append(del); box.append(row);
  }
}
function showCreated(id, secret) {
  $('cid').textContent = id; $('csecret').textContent = secret || ''; $('secretRow').hidden = !secret; $('created').hidden = false;
  $('copyBoth').onclick = () => navigator.clipboard?.writeText('client_id=' + id + (secret ? '\nclient_secret=' + secret : '')).then(() => say(t('Copied.'), 'ok'));
  $('created').scrollIntoView({ behavior: 'smooth' });
}
$('newApp').onsubmit = async e => {
  e.preventDefault(); say('');
  const uris = $('uris').value.split(/\s+/).filter(Boolean);
  try {
    const d = await api('dev/apps', { name: $('name').value.trim(), website: $('website').value.trim() || undefined, redirect_uris: uris, kind: $('kind').value });
    $('newApp').reset(); showCreated(d.client_id, d.client_secret); load();
  } catch (err) { say(err.message, 'err'); }
};
window.addEventListener('langchange', () => lastApps && draw(lastApps));
T.init();
(async () => {
  try {
    const i = await api('dev/info'); load();
    $('how').textContent = `1. Send the person to:
${i.authorize_url}
   ?response_type=code&client_id=YOUR_CLIENT_ID
   &redirect_uri=YOUR_REDIRECT&scope=${i.scopes.replace(/ /g, '%20')}
   &state=RANDOM&code_challenge=PKCE_CHALLENGE&code_challenge_method=S256

2. They sign in here and tap Allow. They return to your redirect address with ?code=...&state=...

3. Swap the code for tokens (POST, form-encoded):
${i.token_url}
   grant_type=authorization_code&code=...&redirect_uri=...&code_verifier=...
   (apps with a secret also send HTTP Basic auth: client_id:client_secret)

Keep your secret on your server only. Never put it in a web page or mobile app.`;
  } catch {}
})();
