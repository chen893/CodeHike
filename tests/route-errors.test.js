import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RouteConflictError,
  getRouteConflictCode,
  getRouteErrorMessage,
  isRouteConflictError,
} from '../lib/api/route-errors.ts';

test('RouteConflictError keeps its message and code', () => {
  const err = new RouteConflictError('结构已锁定', 'STRUCTURE_LOCKED');

  assert.equal(isRouteConflictError(err), true);
  assert.equal(getRouteConflictCode(err), 'STRUCTURE_LOCKED');
  assert.equal(getRouteErrorMessage(err, 'fallback'), '结构已锁定');
});

test('legacy conflict-prefixed errors remain supported', () => {
  const err = new Error('conflict: 正在生成中');

  assert.equal(isRouteConflictError(err), true);
  assert.equal(getRouteConflictCode(err, 'STRUCTURE_LOCKED'), 'STRUCTURE_LOCKED');
  assert.equal(getRouteErrorMessage(err, 'fallback'), '正在生成中');
});
