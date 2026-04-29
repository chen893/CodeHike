import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canUseDevAuthBypass,
  isLoopbackHost,
  isValidDevBypassUserId,
  readDevBypassUserIdFromCookieHeader,
} from '../lib/dev-auth.ts';

const validUserId = '123e4567-e89b-12d3-a456-426614174000';

test('isValidDevBypassUserId only accepts UUID-shaped values', () => {
  assert.equal(isValidDevBypassUserId(validUserId), true);
  assert.equal(isValidDevBypassUserId('not-a-uuid'), false);
  assert.equal(isValidDevBypassUserId(''), false);
});

test('isLoopbackHost only accepts local development hosts', () => {
  assert.equal(isLoopbackHost('localhost:3001'), true);
  assert.equal(isLoopbackHost('[::1]:3001'), true);
  assert.equal(isLoopbackHost('127.0.0.1:3001'), true);
  assert.equal(isLoopbackHost('review.example.com'), false);
});

test('canUseDevAuthBypass requires development mode, loopback host, and valid UUID', () => {
  assert.equal(
    canUseDevAuthBypass({
      userId: validUserId,
      hostHeader: 'localhost:3001',
      nodeEnv: 'development',
    }),
    true
  );

  assert.equal(
    canUseDevAuthBypass({
      userId: validUserId,
      hostHeader: 'review.example.com',
      nodeEnv: 'development',
    }),
    false
  );

  assert.equal(
    canUseDevAuthBypass({
      userId: 'bad-user-id',
      hostHeader: 'localhost:3001',
      nodeEnv: 'development',
    }),
    false
  );

  assert.equal(
    canUseDevAuthBypass({
      userId: validUserId,
      hostHeader: 'localhost:3001',
      nodeEnv: 'production',
    }),
    false
  );
});

test('readDevBypassUserIdFromCookieHeader extracts the bypass cookie', () => {
  const cookieHeader = [
    'theme=dark',
    `vibedocs-dev-user-id=${encodeURIComponent(validUserId)}`,
    'next-auth=token',
  ].join('; ');

  assert.equal(readDevBypassUserIdFromCookieHeader(cookieHeader), validUserId);
  assert.equal(readDevBypassUserIdFromCookieHeader('theme=dark'), null);
});
