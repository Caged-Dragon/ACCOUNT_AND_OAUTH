import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const bad = m => { console.error(m); process.exit(1); };
if (!url || !key) bad('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const [cmd, slug, name, originArg, ...redirectArgs] = process.argv.slice(2);
const validUrl = raw => { try { const u = new URL(raw); return !u.username && !u.password && !u.hash && (u.protocol === 'https:' || (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) ? u : null; } catch { return null; } };

if (cmd === 'list') {
  const { data, error } = await db.from('login_client_apps').select('slug,name,allowed_origin,is_active,oauth_client_id,redirect_uris').order('created_at');
  if (error) bad(error.message);
  console.table(data);
} else if (cmd === 'add') {
  if (!slug || !name || !originArg || !redirectArgs.length) bad('Usage: npm run products -- add <slug> "<Name>" <https://origin> <https://origin/auth/callback> [additional-callbacks...]');
  const origin = validUrl(originArg);
  if (!origin || (origin.pathname !== '/' && origin.pathname !== '') || origin.search) bad('Product origin must be an HTTPS origin only (HTTP localhost is allowed for development).');
  const redirects = redirectArgs.map(validUrl);
  if (redirects.some(x => !x || ![origin.origin, 'http://localhost', 'http://127.0.0.1'].includes(x.origin))) bad('Every callback must use the registered product origin (or localhost for development).');
  if (redirects.some(x => x.search || x.hash)) bad('Callback URLs must not contain query strings or fragments.');
  if (redirects.some(x => x.origin !== origin.origin && !(x.protocol === 'http:' && ['localhost','127.0.0.1'].includes(x.hostname)))) bad('Callback URLs must use the registered product origin (or a localhost development origin).');
  const { data: existing, error: findError } = await db.from('login_client_apps').select('oauth_client_id').eq('slug', slug).maybeSingle();
  if (findError) bad(findError.message);
  if (existing?.oauth_client_id) bad('This product already has an OAuth client. Use the Supabase OAuth client rotation process; do not create a duplicate.');
  const { data: client, error: oauthError } = await db.auth.admin.oauth.createClient({
    client_name: name, client_uri: origin.origin, redirect_uris: redirects.map(x => x.href),
    scope: 'openid email profile', token_endpoint_auth_method: 'none'
  });
  if (oauthError || !client?.client_id) bad(oauthError?.message || 'Supabase did not return an OAuth client ID.');
  const { error } = await db.from('login_client_apps').upsert({
    slug, name, allowed_origin: origin.origin.toLowerCase(), is_active: true,
    oauth_client_id: client.client_id, redirect_uris: redirects.map(x => x.href), client_type: 'public'
  }, { onConflict: 'slug' });
  if (error) {
    await db.auth.admin.oauth.deleteClient(client.client_id).catch(() => {});
    bad(error.message);
  }
  console.log('Registered OIDC product:', slug, 'client_id:', client.client_id);
  console.log('Redirect URIs:', redirects.map(x => x.href).join('\n'));
  console.log('Client secret: none (public PKCE client).');
} else if (cmd === 'on' || cmd === 'off') {
  if (!slug) bad('Usage: npm run products -- ' + cmd + ' <slug>');
  const { error } = await db.from('login_client_apps').update({ is_active: cmd === 'on' }).eq('slug', slug);
  if (error) bad(error.message);
  console.log(slug, cmd === 'on' ? 'enabled' : 'disabled');
} else bad('Commands: list | add <slug> "<Name>" <origin> <callback> [callbacks...] | on <slug> | off <slug>');
