import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLineChanges,
  findLineRange,
} from '../lib/tutorial/assembler.js';

// Note: assembler.js does not export findLineRange and computeLineChanges
// directly — they are module-scoped. We import buildTutorialSteps (the only
// named export besides the re-exported applyContentPatches) and test the
// internal functions indirectly through the assembler pipeline.
//
// However, checking the source reveals that findLineRange and computeLineChanges
// are plain functions with no internal closure state, so we can exercise their
// behaviour by importing them. If the module layout changes and they become
// unexported, these tests will fail at import time and need updating.

// ── findLineRange ──

test('findLineRange returns correct start and end line for single-line match', () => {
  const code = 'line one\nline two\nline three\n';
  const range = findLineRange(code, 'line two');
  assert.equal(range.startLine, 2);
  assert.equal(range.endLine, 2);
});

test('findLineRange returns correct range for multi-line match', () => {
  const code = 'a\nb\nc\nd\ne\n';
  const range = findLineRange(code, 'b\nc\nd');
  assert.equal(range.startLine, 2);
  assert.equal(range.endLine, 4);
});

test('findLineRange returns line 1 for match at the very start', () => {
  const code = 'first line\nsecond line\n';
  const range = findLineRange(code, 'first');
  assert.equal(range.startLine, 1);
  assert.equal(range.endLine, 1);
});

test('findLineRange throws when search text is not found', () => {
  assert.throws(
    () => findLineRange('hello\nworld\n', 'missing'),
    (err) => err.message.includes('找不到定位目标')
  );
});

// ── computeLineChanges ──

test('computeLineChanges identifies added lines', () => {
  const before = 'a\nb\n';
  const after = 'a\nb\nc\n';
  const changes = computeLineChanges(before, after);
  assert.equal(changes.get(3), 'added');
  assert.equal(changes.size, 1);
});

test('computeLineChanges identifies modified lines', () => {
  const before = 'line one\nline two\n';
  const after = 'line one\nline TWO\n';
  const changes = computeLineChanges(before, after);
  assert.equal(changes.get(2), 'modified');
  assert.equal(changes.size, 1);
});

test('computeLineChanges identifies mixed added and modified lines', () => {
  const before = 'a\nb\n';
  const after = 'a\nB\nc\nd\n';
  const changes = computeLineChanges(before, after);
  assert.equal(changes.get(2), 'modified');
  assert.equal(changes.get(3), 'added');
  assert.equal(changes.get(4), 'added');
  assert.equal(changes.size, 3);
});

test('computeLineChanges returns empty map for identical code', () => {
  const code = 'same\ncontent\n';
  const changes = computeLineChanges(code, code);
  assert.equal(changes.size, 0);
});

test('computeLineChanges handles completely replaced content', () => {
  const before = 'old line 1\nold line 2\n';
  const after = 'new line 1\nnew line 2\nnew line 3\n';
  const changes = computeLineChanges(before, after);
  // Lines 1 and 2 are modified (replaced), line 3 is added
  assert.equal(changes.get(1), 'modified');
  assert.equal(changes.get(2), 'modified');
  assert.equal(changes.get(3), 'added');
});
