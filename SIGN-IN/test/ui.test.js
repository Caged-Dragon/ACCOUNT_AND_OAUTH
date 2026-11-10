import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../public/style.css', import.meta.url), 'utf8');

test('hosted identity page has no redundant Continue with Caged Dragon action', () => {
  assert.doesNotMatch(html, /id=["']cdBtn["']/);
  assert.doesNotMatch(html, /Continue with Caged-Dragon/);
  assert.doesNotMatch(app, /\$\(['"]cdBtn['"]\)/);
});

test('registered product sessions continue without a second user action', () => {
  assert.match(app, /if \(c\.client && !nextPath\)/);
  assert.match(app, /call\('continue', base\(\)\)/);
});

test('sign-in and consent layouts include compact responsive breakpoints', () => {
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /@media\(max-width:380px\)/);
  assert.match(css, /body\.plain main\.card/);
});


test('the portal exposes English and Tamil only across public pages', async () => {
  for (const page of ['index.html', 'account.html', 'developer.html', 'admin.html', '404.html', 'error.html']) {
    const source = await readFile(new URL('../public/' + page, import.meta.url), 'utf8');
    const languages = [...source.matchAll(/data-lang="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(languages, ['en', 'ta'], page);
  }
  const mainI18n = await readFile(new URL('../public/i18n.js', import.meta.url), 'utf8');
  const pageI18n = await readFile(new URL('../public/i18n-pages.js', import.meta.url), 'utf8');
  const consentI18n = await readFile(new URL('../consent-i18n.js', import.meta.url), 'utf8');
  assert.doesNotMatch(mainI18n, /\bhi\s*:/);
  assert.doesNotMatch(pageI18n, /\bhi\s*:/);
  assert.doesNotMatch(consentI18n, /\bhi\s*:/);
  assert.match(mainI18n, /lang = l === 'ta' \? 'ta' : 'en'/);
});
