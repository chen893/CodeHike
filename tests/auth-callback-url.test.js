import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRelativeCallbackUrl } from '../lib/auth/callback-url.ts';

test('buildRelativeCallbackUrl keeps pathname and search only', () => {
  assert.equal(
    buildRelativeCallbackUrl({
      pathname: '/drafts/abc',
      search: '?generate=1&modelId=minimax%2FMiniMax-M2.7',
    }),
    '/drafts/abc?generate=1&modelId=minimax%2FMiniMax-M2.7'
  );
});

test('buildRelativeCallbackUrl falls back to root pathname', () => {
  assert.equal(
    buildRelativeCallbackUrl({
      pathname: '',
      search: '',
    }),
    '/'
  );
});
