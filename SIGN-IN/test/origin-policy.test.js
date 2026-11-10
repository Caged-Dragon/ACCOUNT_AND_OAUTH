import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginRequest } from '../origin-policy.js';

const trusted = 'https://caged-dragon-auth.vercel.app';

test('accepts an exact same-origin Origin header', () => {
  assert.equal(isSameOriginRequest({ origin: trusted }, trusted), true);
});

test('accepts same-origin Referer only when Origin is absent', () => {
  assert.equal(isSameOriginRequest({ referer: `${trusted}/oauth/consent?authorization_id=abc` }, trusted), true);
});

test('rejects a hostile Origin even when Referer is trusted', () => {
  assert.equal(isSameOriginRequest({ origin: 'https://attacker.example', referer: trusted }, trusted), false);
});

test('rejects null, malformed, path-bearing and cross-origin Origin values', () => {
  for (const origin of ['null', 'not a URL', `${trusted}/path`, 'https://attacker.example']) {
    assert.equal(isSameOriginRequest({ origin, referer: trusted }, trusted), false, origin);
  }
});

test('rejects requests with neither a usable Origin nor Referer', () => {
  assert.equal(isSameOriginRequest({}, trusted), false);
  assert.equal(isSameOriginRequest({ referer: 'not a URL' }, trusted), false);
});
