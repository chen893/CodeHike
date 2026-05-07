import test from 'node:test';
import assert from 'node:assert/strict';
import { executeStep } from '../lib/ai/agent-runtime/executor.ts';
import { computeAgentLoopMaxTurns } from '../lib/ai/agent-generator.ts';

const outline = {
  meta: { title: 'Title', description: 'Desc' },
  intro: { paragraphs: ['intro'] },
  baseCode: 'export const x = 1;\n',
  steps: [{ id: 'step-1', title: 'One', teachingGoal: 'goal' }],
};

const teachingBrief = {
  topic: 'Topic',
  audience_level: 'beginner',
  core_question: 'Why',
  output_language: 'zh-CN',
};

test('computeAgentLoopMaxTurns scales with outline length', () => {
  assert.equal(computeAgentLoopMaxTurns(1), 40);
  assert.equal(computeAgentLoopMaxTurns(20), 40);
  assert.equal(computeAgentLoopMaxTurns(36), 57);
});

test('executeStep records repair state and succeeds on the second attempt', async () => {
  const retries = [];
  const actions = [];
  const attempts = [];

  const result = await executeStep({
    stepIndex: 0,
    totalSteps: 1,
    outline,
    sourceItems: [],
    teachingBrief,
    previousFiles: { 'main.ts': 'export const x = 1;\n' },
    primaryFile: 'main.ts',
    model: {},
    modelSupportsRetrieval: false,
    useNativeStructuredOutput: false,
    totalRetries: 0,
    currentTurnCount: 0,
    maxTurns: 30,
    maxRepairsPerStep: 3,
    lifecycleHooks: {
      onAction: (event) => actions.push(event),
      onStepRetry: (event) => retries.push(event),
    },
    generateStepAttempt: async ({ attempt }) => {
      attempts.push(attempt);
      if (attempt === 0) {
        return {
          status: 'repairable',
          errorMessage: 'Patch 匹配失败: 找不到',
          failedStep: {
            id: 'step-1',
            chapterId: 'ch-1',
            title: 'Broken',
            paragraphs: ['x'],
            patches: [],
          },
          category: 'repairable',
          timings: { promptBuildMs: 1, llmCallMs: 2, validationMs: 3 },
        };
      }
      return {
        status: 'pass',
        step: {
          id: 'step-1',
          chapterId: 'ch-1',
          title: 'Fixed',
          paragraphs: ['x'],
          patches: [],
        },
        locChange: 0,
        timings: { promptBuildMs: 1, llmCallMs: 2, validationMs: 3 },
      };
    },
  });

  assert.deepEqual(attempts, [0, 1]);
  assert.equal(result.status, 'committed');
  assert.equal(result.outcome.result, 'repaired');
  assert.equal(result.retryCount, 1);
  assert.equal(actions[0]?.action, 'repair');
  assert.equal(retries.length, 1);
});

test('executeStep aborts immediately on provider failures', async () => {
  const result = await executeStep({
    stepIndex: 0,
    totalSteps: 1,
    outline,
    sourceItems: [],
    teachingBrief,
    previousFiles: { 'main.ts': 'export const x = 1;\n' },
    primaryFile: 'main.ts',
    model: {},
    modelSupportsRetrieval: false,
    useNativeStructuredOutput: false,
    totalRetries: 0,
    currentTurnCount: 0,
    maxTurns: 30,
    maxRepairsPerStep: 3,
    generateStepAttempt: async () => ({
      status: 'error',
      errorMessage: '429 rate limit',
      failedStep: null,
      category: 'provider',
      timings: { promptBuildMs: 1, llmCallMs: 1, validationMs: 1 },
    }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.retryCount, 1);
  assert.equal(result.forceReplan, false);
  assert.equal(result.forceReplanReason, '429 rate limit');
});

test('executeStep reports turn budget exhaustion explicitly', async () => {
  const attempts = [];

  const result = await executeStep({
    stepIndex: 27,
    totalSteps: 36,
    outline,
    sourceItems: [],
    teachingBrief,
    previousFiles: { 'main.ts': 'export const x = 1;\n' },
    primaryFile: 'main.ts',
    model: {},
    modelSupportsRetrieval: false,
    useNativeStructuredOutput: false,
    totalRetries: 2,
    currentTurnCount: 30,
    maxTurns: 30,
    maxRepairsPerStep: 3,
    generateStepAttempt: async ({ attempt }) => {
      attempts.push(attempt);
      return {
        status: 'pass',
        step: {
          id: 'step-28',
          chapterId: 'ch-1',
          title: 'Should not run',
          paragraphs: ['x'],
          patches: [],
        },
        locChange: 0,
        timings: { promptBuildMs: 1, llmCallMs: 1, validationMs: 1 },
      };
    },
  });

  assert.deepEqual(attempts, []);
  assert.equal(result.status, 'failed');
  assert.equal(result.retryCount, 2);
  assert.match(result.lastError, /Turn budget exhausted before step 28 attempt 1/);
});
