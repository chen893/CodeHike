import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyContentPatches,
  getStepCodePreview,
} from '../lib/tutorial/draft-code.js';

// ── 1. Multi-step patch application ──

test('multi-step patch chain: each step builds on the previous result', () => {
  const baseCode = 'const x = 0;\nconst y = 0;\nconst z = 0;\n';

  const draft = {
    baseCode,
    meta: { title: 'multi-step test' },
    steps: [
      {
        id: 's1',
        title: 'Set x',
        paragraphs: [],
        patches: [{ find: 'x = 0', replace: 'x = 1' }],
      },
      {
        id: 's2',
        title: 'Set y',
        paragraphs: [],
        patches: [{ find: 'y = 0', replace: 'y = 2' }],
      },
      {
        id: 's3',
        title: 'Set z',
        paragraphs: [],
        patches: [{ find: 'z = 0', replace: 'z = 3' }],
      },
    ],
  };

  // After step 0 (s1): x=1, y=0, z=0
  const preview0 = getStepCodePreview(draft, 0, draft.steps[0]);
  assert.equal(preview0.currentCode, 'const x = 1;\nconst y = 0;\nconst z = 0;\n');

  // After step 1 (s2): x=1, y=2, z=0
  const preview1 = getStepCodePreview(draft, 1, draft.steps[1]);
  assert.equal(preview1.currentCode, 'const x = 1;\nconst y = 2;\nconst z = 0;\n');

  // After step 2 (s3): x=1, y=2, z=3
  const preview2 = getStepCodePreview(draft, 2, draft.steps[2]);
  assert.equal(preview2.currentCode, 'const x = 1;\nconst y = 2;\nconst z = 3;\n');
});

// ── 2. Multi-file patch chain ──

test('multi-file patch chain: patches target different files across steps', () => {
  const baseCode = {
    'app.js': 'const name = "world";\n',
    'utils.js': 'export function greet() { return "hi"; }\n',
  };

  const draft = {
    baseCode,
    meta: { title: 'multi-file test' },
    steps: [
      {
        id: 's1',
        title: 'Update app',
        paragraphs: [],
        patches: [{ find: '"world"', replace: '"CodeHike"', file: 'app.js' }],
      },
      {
        id: 's2',
        title: 'Update utils',
        paragraphs: [],
        patches: [{ find: '"hi"', replace: '"hello"', file: 'utils.js' }],
      },
    ],
  };

  // After step 0: app.js changed, utils.js unchanged
  const preview0 = getStepCodePreview(draft, 0, draft.steps[0]);
  assert.equal(preview0.currentFiles['app.js'], 'const name = "CodeHike";\n');
  assert.equal(preview0.currentFiles['utils.js'], 'export function greet() { return "hi"; }\n');

  // After step 1: both files reflect cumulative changes
  const preview1 = getStepCodePreview(draft, 1, draft.steps[1]);
  assert.equal(preview1.currentFiles['app.js'], 'const name = "CodeHike";\n');
  assert.equal(preview1.currentFiles['utils.js'], 'export function greet() { return "hello"; }\n');
});

// ── 3. Empty patch step ──

test('step with no patches produces same code as previous step', () => {
  const baseCode = 'const a = 1;\n';

  const draft = {
    baseCode,
    meta: { title: 'empty patch test' },
    steps: [
      {
        id: 's1',
        title: 'Change a',
        paragraphs: [],
        patches: [{ find: '1', replace: '2' }],
      },
      {
        id: 's2',
        title: 'No-op step',
        paragraphs: ['This step has no patches.'],
        patches: [],
      },
    ],
  };

  const preview1 = getStepCodePreview(draft, 1, draft.steps[1]);
  assert.equal(preview1.previousCode, 'const a = 2;\n');
  assert.equal(preview1.currentCode, 'const a = 2;\n');
});

test('step with undefined patches field is treated as no-op', () => {
  const baseCode = 'let x = 10;\n';

  const draft = {
    baseCode,
    meta: { title: 'undefined patches test' },
    steps: [
      { id: 's1', title: 'Step without patches', paragraphs: [] },
    ],
  };

  const preview = getStepCodePreview(draft, 0, draft.steps[0]);
  assert.equal(preview.currentCode, 'let x = 10;\n');
});

// ── 4. Edge cases ──

test('patch find at the very beginning of the code', () => {
  const result = applyContentPatches(
    'hello world\n',
    [{ find: 'hello', replace: 'goodbye' }]
  );
  assert.equal(result, 'goodbye world\n');
});

test('patch find at the very end of the code', () => {
  const result = applyContentPatches(
    'hello world',
    [{ find: 'world', replace: 'universe' }]
  );
  assert.equal(result, 'hello universe');
});

test('patch replace with empty string performs deletion', () => {
  const result = applyContentPatches(
    'const x = 1;\nconst y = 2;\n',
    [{ find: 'const y = 2;\n', replace: '' }]
  );
  assert.equal(result, 'const x = 1;\n');
});

// ── 5. Error cases ──

test('patch with find text not found throws an error', () => {
  assert.throws(
    () => applyContentPatches('const x = 1;\n', [{ find: 'nonexistent', replace: 'x' }]),
    (err) => err.message.includes('找不到')
  );
});

test('patch with find text matching multiple times throws an error', () => {
  const code = 'const x = 1;\nconst y = 1;\n';
  assert.throws(
    () => applyContentPatches(code, [{ find: '1', replace: '2' }]),
    (err) => err.message.includes('歧义')
  );
});
