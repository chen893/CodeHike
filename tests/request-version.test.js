import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestVersionTracker } from '../lib/utils/request-version.js';

test('request version tracker only accepts the latest request version', () => {
  const tracker = createRequestVersionTracker();
  const first = tracker.begin();
  const second = tracker.begin();

  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(tracker.isCurrent(first), false);
  assert.equal(tracker.isCurrent(second), true);
  assert.equal(tracker.getCurrentVersion(), 2);
});

test('invalidate retires the current request version', () => {
  const tracker = createRequestVersionTracker();
  const version = tracker.begin();
  const invalidated = tracker.invalidate();

  assert.equal(version, 1);
  assert.equal(invalidated, 2);
  assert.equal(tracker.isCurrent(version), false);
  assert.equal(tracker.getCurrentVersion(), 2);
});
