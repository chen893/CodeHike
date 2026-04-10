import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyContentPatches,
  findFirstInvalidStep,
  summarizeCodeDiff,
} from '../lib/tutorial/draft-code.js';

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
