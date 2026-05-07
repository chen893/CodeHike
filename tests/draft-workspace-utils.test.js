import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFailedGenerationStepIndex } from '../components/drafts/draft-workspace-utils.ts';

function createDraft(overrides = {}) {
  return {
    id: 'draft-1',
    status: 'draft',
    sourceItems: [],
    teachingBrief: {
      topic: 'Topic',
      audience_level: 'beginner',
      core_question: 'Question',
      output_language: 'zh-CN',
    },
    tutorialDraft: null,
    syncState: 'stale',
    inputHash: null,
    tutorialDraftInputHash: null,
    generationState: 'failed',
    generationErrorMessage: null,
    generationModel: null,
    generationLastAt: null,
    generationOutline: {
      meta: { title: 'Demo', description: 'desc' },
      intro: { paragraphs: ['intro'] },
      baseCode: 'const x = 1;',
      steps: [
        { id: 's1', title: 'Step 1', teachingGoal: 'g1', conceptIntroduced: 'c1', estimatedLocChange: 1 },
        { id: 's2', title: 'Step 2', teachingGoal: 'g2', conceptIntroduced: 'c2', estimatedLocChange: 1 },
        { id: 's3', title: 'Step 3', teachingGoal: 'g3', conceptIntroduced: 'c3', estimatedLocChange: 1 },
      ],
    },
    generationQuality: null,
    activeGenerationJobId: null,
    validationValid: false,
    validationErrors: [],
    validationCheckedAt: null,
    publishedSlug: null,
    publishedTutorialId: null,
    publishedAt: null,
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
    ...overrides,
  };
}

test('deriveFailedGenerationStepIndex resumes from persisted partial progress', () => {
  const draft = createDraft({
    tutorialDraft: {
      meta: { title: 'Demo', description: 'desc' },
      intro: { paragraphs: ['intro'] },
      baseCode: 'const x = 1;',
      steps: [
        { id: 'p1', title: 'Persisted 1', paragraphs: [], patches: [] },
        { id: 'p2', title: 'Persisted 2', paragraphs: [], patches: [] },
      ],
    },
    generationErrorMessage: 'Step 3 failed after 3 repairs: unknown error',
  });

  assert.equal(deriveFailedGenerationStepIndex(draft), 2);
});

test('deriveFailedGenerationStepIndex falls back to the persisted error message', () => {
  const draft = createDraft({
    tutorialDraft: {
      meta: { title: 'Demo', description: 'desc' },
      intro: { paragraphs: ['intro'] },
      baseCode: 'const x = 1;',
      steps: [
        { id: 'p1', title: 'Persisted 1', paragraphs: [], patches: [] },
        { id: 'p2', title: 'Persisted 2', paragraphs: [], patches: [] },
        { id: 'p3', title: 'Persisted 3', paragraphs: [], patches: [] },
      ],
    },
    generationErrorMessage: '第 2 步重新生成失败',
  });

  assert.equal(deriveFailedGenerationStepIndex(draft), 1);
});

test('deriveFailedGenerationStepIndex parses validation failure messages', () => {
  const draft = createDraft({
    tutorialDraft: {
      meta: { title: 'Demo', description: 'desc' },
      intro: { paragraphs: ['intro'] },
      baseCode: 'const x = 1;',
      steps: [
        { id: 'p1', title: 'Persisted 1', paragraphs: [], patches: [] },
        { id: 'p2', title: 'Persisted 2', paragraphs: [], patches: [] },
        { id: 'p3', title: 'Persisted 3', paragraphs: [], patches: [] },
      ],
    },
    generationErrorMessage: '步骤 2《Persisted 2》失效：Patch 匹配失败',
  });

  assert.equal(deriveFailedGenerationStepIndex(draft), 1);
});

test('deriveFailedGenerationStepIndex returns null without a saved outline', () => {
  assert.equal(
    deriveFailedGenerationStepIndex(createDraft({ generationOutline: null })),
    null,
  );
});
