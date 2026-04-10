import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyContentPatches,
  findFirstInvalidStep,
  getFilesBeforeStep,
  getFilesAfterStep,
  getStepCodePreview,
  summarizeCodeDiff,
} from '../lib/tutorial/draft-code.js';
import { normalizeBaseCode, denormalizeBaseCode, guessLangFromFileName, normalizeTutorialMeta } from '../lib/tutorial/normalize.js';

test('applyContentPatches applies sequential replacements', () => {
  const result = applyContentPatches(
    'const count = 0;\nconsole.log(count);\n',
    [
      { find: '0', replace: '1' },
      { find: 'console.log(count);', replace: 'return count;' },
    ]
  );

  assert.equal(result, 'const count = 1;\nreturn count;\n');
});

test('findFirstInvalidStep reports the first broken patch chain', () => {
  const failure = findFirstInvalidStep({
    baseCode: 'const count = 0;\n',
    steps: [
      {
        id: 'step-1',
        title: '更新值',
        paragraphs: [''],
        patches: [{ find: '0', replace: '1' }],
      },
      {
        id: 'step-2',
        title: '错误 patch',
        paragraphs: [''],
        patches: [{ find: 'count = 3', replace: 'count = 4' }],
      },
    ],
  });

  assert.deepEqual(failure, {
    stepIndex: 1,
    stepId: 'step-2',
    stepTitle: '错误 patch',
    message: 'Patch 匹配失败: 找不到:\ncount = 3...',
  });
});

test('summarizeCodeDiff treats replace-in-place lines as modified', () => {
  const summary = summarizeCodeDiff(
    'const a = 1;\nconst b = 2;\n',
    'const a = 1;\nconst b = 3;\nconst c = 4;\n'
  );

  assert.deepEqual(summary, {
    added: 1,
    removed: 0,
    modified: 1,
  });
});

// ── Multi-file tests ──

test('normalizeBaseCode wraps string baseCode into Record', () => {
  const result = normalizeBaseCode('const x = 1;', { lang: 'js', fileName: 'main.js' });
  assert.deepEqual(result.files, { 'main.js': 'const x = 1;' });
  assert.equal(result.primaryFile, 'main.js');
  assert.equal(result.lang, 'js');
});

test('normalizeBaseCode uses Record baseCode as-is', () => {
  const result = normalizeBaseCode({ 'a.js': 'codeA', 'b.js': 'codeB' });
  assert.deepEqual(result.files, { 'a.js': 'codeA', 'b.js': 'codeB' });
  assert.equal(result.primaryFile, 'a.js');
});

test('normalizeBaseCode derives lang from fileName', () => {
  const result = normalizeBaseCode('print(1)', { fileName: 'main.py' });
  assert.equal(result.lang, 'python');
});

test('guessLangFromFileName maps common extensions', () => {
  assert.equal(guessLangFromFileName('app.tsx'), 'typescript');
  assert.equal(guessLangFromFileName('main.rs'), 'rust');
  assert.equal(guessLangFromFileName('style.css'), 'css');
});

test('denormalizeBaseCode collapses single-file to string', () => {
  assert.equal(denormalizeBaseCode({ 'main.js': 'code' }), 'code');
});

test('denormalizeBaseCode keeps multi-file as Record', () => {
  const result = denormalizeBaseCode({ 'a.js': 'codeA', 'b.js': 'codeB' });
  assert.deepEqual(result, { 'a.js': 'codeA', 'b.js': 'codeB' });
});

test('applyContentPatches multi-file routes patches by file field', () => {
  const files = { 'main.js': 'const x = 1;\n', 'utils.js': 'export function log() {}\n' };
  const result = applyContentPatches(files, [
    { find: '1', replace: '2', file: 'main.js' },
    { find: 'log', replace: 'debug', file: 'utils.js' },
  ], 'main.js');

  assert.deepEqual(result, {
    'main.js': 'const x = 2;\n',
    'utils.js': 'export function debug() {}\n',
  });
});

test('applyContentPatches multi-file defaults to primaryFile', () => {
  const files = { 'main.js': 'const x = 1;\n', 'utils.js': 'noop\n' };
  const result = applyContentPatches(files, [
    { find: '1', replace: '2' },
  ], 'main.js');

  assert.equal(result['main.js'], 'const x = 2;\n');
  assert.equal(result['utils.js'], 'noop\n');
});

test('getFilesBeforeStep works with multi-file baseCode', () => {
  const draft = {
    baseCode: { 'app.js': 'const a = 1;\n', 'util.js': 'export const b = 2;\n' },
    meta: { title: 'test' },
    steps: [
      { patches: [{ find: '1', replace: '10', file: 'app.js' }] },
      { patches: [{ find: '2', replace: '20', file: 'util.js' }] },
    ],
  };

  const before1 = getFilesBeforeStep(draft, 1);
  assert.equal(before1['app.js'], 'const a = 10;\n');
  assert.equal(before1['util.js'], 'export const b = 2;\n');

  const before2 = getFilesBeforeStep(draft, 2);
  assert.equal(before2['app.js'], 'const a = 10;\n');
  assert.equal(before2['util.js'], 'export const b = 20;\n');
});

test('findFirstInvalidStep works with multi-file baseCode', () => {
  const failure = findFirstInvalidStep({
    baseCode: { 'app.js': 'const a = 1;\n', 'util.js': 'export const b = 2;\n' },
    meta: { title: 'test' },
    steps: [
      { id: 's1', title: 'ok', paragraphs: [], patches: [{ find: '1', replace: '10', file: 'app.js' }] },
      { id: 's2', title: 'bad', paragraphs: [], patches: [{ find: 'not-found', replace: 'x', file: 'util.js' }] },
    ],
  });

  assert.equal(failure.stepIndex, 1);
  assert.equal(failure.stepId, 's2');
});

test('findFirstInvalidStep returns null for valid multi-file chain', () => {
  const result = findFirstInvalidStep({
    baseCode: { 'app.js': 'const a = 1;\n' },
    meta: { title: 'test' },
    steps: [
      { id: 's1', title: 'step1', paragraphs: [], patches: [{ find: '1', replace: '2' }] },
    ],
  });

  assert.equal(result, null);
});

test('getStepCodePreview returns per-file data', () => {
  const draft = {
    baseCode: { 'a.js': 'x = 1\n', 'b.js': 'y = 2\n' },
    meta: { title: 'test' },
    steps: [
      { patches: [{ find: '1', replace: '10', file: 'a.js' }] },
    ],
  };

  const preview = getStepCodePreview(draft, 0, draft.steps[0]);
  assert.equal(preview.previousFiles['a.js'], 'x = 1\n');
  assert.equal(preview.currentFiles['a.js'], 'x = 10\n');
  assert.equal(preview.currentFiles['b.js'], 'y = 2\n');
  assert.equal(preview.primaryFile, 'a.js');
});

// ── normalizeTutorialMeta tests ──

test('normalizeTutorialMeta fills lang/fileName from baseCode record', () => {
  const meta = { title: 'Test', description: 'desc' };
  const baseCode = { 'store.ts': 'const x = 1;', 'util.py': 'pass' };
  const result = normalizeTutorialMeta(meta, baseCode);
  assert.equal(result.lang, 'typescript');
  assert.equal(result.fileName, 'store.ts');
});

test('normalizeTutorialMeta preserves existing lang/fileName', () => {
  const meta = { title: 'Test', lang: 'python', fileName: 'custom.py', description: 'desc' };
  const result = normalizeTutorialMeta(meta, 'print(1)');
  assert.equal(result.lang, 'python');
  assert.equal(result.fileName, 'custom.py');
});

test('normalizeTutorialMeta fills from string baseCode', () => {
  const meta = { title: 'Test', description: 'desc' };
  const result = normalizeTutorialMeta(meta, 'const x = 1;');
  assert.equal(result.lang, 'javascript');
  assert.equal(result.fileName, 'main.js');
});

// ── Fuzzy file match tests ──

test('applyContentPatches fuzzy-matches case-insensitive file name', () => {
  const files = { 'Store.js': 'const x = 1;\n' };
  const result = applyContentPatches(files, [
    { find: '1', replace: '2', file: 'store.js' },
  ], 'Store.js');
  assert.equal(result['Store.js'], 'const x = 2;\n');
});

test('applyContentPatches throws with available files listed on bad target', () => {
  const files = { 'app.js': 'code\n' };
  assert.throws(
    () => applyContentPatches(files, [{ find: 'code', replace: 'x', file: 'nonexistent.js' }], 'app.js'),
    (err) => err.message.includes('可用: app.js')
  );
});

