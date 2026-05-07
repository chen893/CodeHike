import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentContextManager } from '../lib/ai/agent-runtime/context-manager.ts';

const baseOutline = {
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

test('context manager summarizes context through the advisory compression hook', async () => {
  const manager = createAgentContextManager({
    tokenBudget: 150,
    estimateTokenCount: (text) => String(text).length,
    summarizeContext: async () => ({
      completedStepsSummary: 'summary',
      currentCodeSignatures: 'sig()',
      errorAndRepairHistory: 'none',
      remainingSteps: 'next',
      currentStepDetail: 'detail',
      nextStepPreview: 'preview',
      tokenBudget: { used: 1, budget: 150 },
    }),
  });

  const beforeActions = [];
  const result = await manager.maybeCompress({
    filledSteps: [
      { id: 'step-1', title: 'A moderately long title', paragraphs: ['x'], patches: [] },
      { id: 'step-2', title: 'Another moderate title', paragraphs: ['x'], patches: [] },
    ],
    currentCode: { 'main.ts': 'export const x = 1;\n' },
    outline: baseOutline,
    currentStepIndex: 1,
    teachingBrief,
    sourceItems: [],
    replanRemainingOutline: async () => baseOutline,
    onBeforeAction: (event) => beforeActions.push(event),
  });

  assert.equal(result.action, 'summary');
  assert.equal(beforeActions[0]?.mode, 'summary');
  assert.ok(manager.getDistilledContext());
});

test('context manager escalates to replan at the higher compression threshold', async () => {
  const manager = createAgentContextManager({
    tokenBudget: 10,
    estimateTokenCount: (text) => String(text).length,
  });

  const result = await manager.maybeCompress({
    filledSteps: [
      { id: 'step-1', title: 'A very very very long title for token pressure', paragraphs: ['x'], patches: [] },
    ],
    currentCode: { 'main.ts': 'export const x = 1;\n' },
    outline: baseOutline,
    currentStepIndex: 1,
    teachingBrief,
    sourceItems: [],
    replanRemainingOutline: async () => ({
      ...baseOutline,
      steps: [
        { id: 'step-2', title: 'Replanned', teachingGoal: 'goal' },
      ],
    }),
  });

  assert.equal(result.action, 'replan');
  assert.equal(result.outline?.steps[0]?.title, 'Replanned');
});
