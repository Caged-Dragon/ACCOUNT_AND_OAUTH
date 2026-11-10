// Browser-only OIDC demo product. For production, use examples/oidc-bff instead.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const LOGIN_URL = (process.env.DEMO_LOGIN_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '');
const OIDC_ISSUER = (process.env.DEMO_OIDC_ISSUER || '').replace(/\/$/, '');
const CLIENT_ID = process.env.DEMO_OAUTH_CLIENT_ID?.trim();
let loginUrl, issuerUrl;
try { loginUrl = new URL(LOGIN_URL); } catch { throw new Error('Set DEMO_LOGIN_URL to the portal origin.'); }
try { issuerUrl = new URL(OIDC_ISSUER); } catch { throw new Error('Set DEMO_OIDC_ISSUER to the Supabase Auth issuer.'); }
if ((loginUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(loginUrl.hostname)) || loginUrl.pathname !== '/' || loginUrl.search || loginUrl.hash || loginUrl.username || loginUrl.password) {
  throw new Error('DEMO_LOGIN_URL must be an HTTPS origin (HTTP is allowed for localhost), without path or query.');
}
if (issuerUrl.protocol !== 'https:' || issuerUrl.pathname !== '/auth/v1' || issuerUrl.search || issuerUrl.hash || issuerUrl.username || issuerUrl.password) {
  throw new Error('DEMO_OIDC_ISSUER must be the HTTPS Supabase /auth/v1 issuer.');
}
if (!CLIENT_ID) throw new Error('Set DEMO_OAUTH_CLIENT_ID to the public client ID created for the demo product.');

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');
const html = source.replaceAll('__LOGIN_URL__', LOGIN_URL).replaceAll('__OIDC_ISSUER__', OIDC_ISSUER).replaceAll('__CLIENT_ID__', CLIENT_ID);
http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost:5555');
  if (req.method !== 'GET' || !['/', '/auth/callback'].includes(url.pathname)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html);
}).listen(5555, () => console.log('OIDC demo product on http://localhost:5555'));
