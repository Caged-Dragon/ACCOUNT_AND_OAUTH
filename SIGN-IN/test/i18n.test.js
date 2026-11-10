import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { langOf, consentT } from '../consent-i18n.js';

const mainI18n = await readFile(new URL('../public/i18n.js', import.meta.url), 'utf8');

test('server consent language is restricted to English and Tamil', () => {
  assert.equal(langOf({ query: { lang: 'ta' }, cookies: {} }), 'ta');
  assert.equal(langOf({ query: { lang: 'ta-IN' }, cookies: {} }), 'ta');
  assert.equal(langOf({ query: { lang: 'hi' }, cookies: {} }), 'en');
  assert.equal(langOf({ query: {}, cookies: { cd_lang: 'hi' } }), 'en');
  assert.equal(langOf({ query: {}, cookies: { cd_lang: 'ta' } }), 'ta');
  assert.match(consentT('ta')('Request not valid'), /கோரிக்கை/);
  assert.equal(consentT('hi')('Request not valid'), 'Request not valid');
});

test('browser language picker never activates a language outside English and Tamil', () => {
  const localStorage = { value: 'hi', getItem() { return this.value; }, setItem(_k, v) { this.value = v; } };
  const document = {
    documentElement: {},
    cookie: '',
    querySelectorAll() { return []; }
  };
  const window = { dispatchEvent() {} };
  const context = {
    window, document, localStorage,
    location: { search: '?lang=hi', protocol: 'https:' },
    navigator: { language: 'hi-IN' },
    URLSearchParams, Event
  };
  vm.runInNewContext(mainI18n, context);
  window.T.init();
  assert.equal(window.T.lang, 'en');
  window.T.set('ta');
  assert.equal(window.T.lang, 'ta');
  window.T.set('hi');
  assert.equal(window.T.lang, 'en');
  assert.equal(localStorage.value, 'en');
});
