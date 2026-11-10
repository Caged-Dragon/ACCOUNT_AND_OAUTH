const $ = id => document.getElementById(id);
const say = (t, k) => { $('msg').textContent = t || ''; $('msg').className = k || ''; };
async function api(path, body) {
  const r = await fetch('/api/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 404 || r.status === 401) { location.replace('/'); throw new Error('redirecting'); }
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.');
  return d;
}
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const row = (...cells) => el('tr', {}, ...cells.map(c => el('td', {}, c)));
const when = s => new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const btn = (text, fn) => { const b = el('button', { className: 'link', type: 'button', textContent: text }); b.onclick = fn; return b; };
const run = async fn => { say(''); try { await fn(); } catch (e) { if (e.message !== 'redirecting') say(e.message, 'err'); } };

async function load() {
  const d = await api('admin/overview');
  $('stats').replaceChildren(...[['Accounts', d.stats.accounts], ['Developers', d.stats.developers], ['Passkeys', d.stats.passkeys], ['Developer apps', d.stats.devApps], ['Sign-ins (24h)', d.stats.last24]]
    .map(([k, v]) => el('div', { className: 'stat' }, el('b', { textContent: String(v) }), k)));
  $('products').replaceChildren(...d.products.map(p => row(p.name, el('code', { textContent: p.slug }), p.allowed_origin, p.is_active ? 'Yes' : 'No',
    el('span', {}, btn(p.is_active ? 'Turn off' : 'Turn on', () => run(async () => { await api('admin/products/toggle', { slug: p.slug, active: !p.is_active }); load(); })), ' · ',
      btn('Delete', () => run(async () => { if (confirm('Delete ' + p.name + '?')) { await api('admin/products/delete', { slug: p.slug }); load(); } }))))));
  $('devApps').replaceChildren(...(d.devApps.length ? d.devApps.map(a => row(a.name, a.owner, el('code', { textContent: a.client_id }),
    btn('Delete', () => run(async () => { if (confirm('Delete ' + a.name + '?')) { await api('admin/dev-apps/delete', { client_id: a.client_id }); load(); } })))) : [row('None yet.', '', '', '')]));
  $('events').replaceChildren(...d.events.map(e => row(when(e.at), e.method, e.role, e.product || '—')));
}
$('addProduct').onsubmit = e => { e.preventDefault(); run(async () => {
  await api('admin/products', { slug: $('slug').value.trim(), name: $('pname').value.trim(), origin: $('origin').value.trim() });
  $('addProduct').reset(); say('Saved.', 'ok'); load();
}); };
run(load);
