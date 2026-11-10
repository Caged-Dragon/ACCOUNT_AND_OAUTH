import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { startMock } from './mock-supabase.js';

const MP = 4300 + Math.floor(Math.random() * 40);
const mock = await startMock(MP); const procs = [];
const boot = async (port, extra) => {
  const base = `http://127.0.0.1:${port}`;
  procs.push(spawn(process.execPath, ['server.js'], { stdio: 'ignore', env: { PATH: process.env.PATH, SUPABASE_URL: `http://127.0.0.1:${MP}`, SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 'b', LOGIN_CODE_KEY: crypto.randomBytes(32).toString('hex'), PUBLIC_URL: base, PORT: String(port), ...extra } }));
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/healthz'); return base; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error('no start');
};
const attempt = (base, email) => fetch(base + '/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password: 'Wrong-pass-123', mode: 'signin' }) });
after(() => { procs.forEach(p => p.kill()); mock.server.close(); });

test('too many tries for one email are stopped, other emails are not affected', async () => {
  const base = await boot(MP + 100, { AUTH_RATE_LIMIT: '1000', AUTH_RATE_LIMIT_EMAIL: '3' });
  const codes = []; for (let i = 0; i < 5; i++) codes.push((await attempt(base, 'victim@ex.com')).status);
  assert.deepEqual(codes.slice(0, 3), [400, 400, 400]); assert.deepEqual(codes.slice(3), [429, 429]);
  assert.notEqual((await attempt(base, 'someone-else@ex.com')).status, 429);
});
test('too many tries from one address are stopped', async () => {
  const base = await boot(MP + 101, { AUTH_RATE_LIMIT: '3', AUTH_RATE_LIMIT_EMAIL: '1000' });
  const codes = []; for (let i = 0; i < 5; i++) codes.push((await attempt(base, `u${i}@ex.com`)).status);
  assert.deepEqual(codes, [400, 400, 400, 429, 429]);
});
test('shared (database) rate limit store starts and serves requests', async () => {
  const base = await boot(MP + 102, { RATE_LIMIT_STORE: 'database', AUTH_RATE_LIMIT: '1000', AUTH_RATE_LIMIT_EMAIL: '1000' });
  assert.equal((await attempt(base, 'db@ex.com')).status, 400);
});
