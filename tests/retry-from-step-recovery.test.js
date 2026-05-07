import test from 'node:test';
import assert from 'node:assert/strict';

test('buildRetryRecoveryDraft preserves completed steps and seeds missing outline tail steps', async () => {
  const { buildRetryRecoveryDraft } = await import('../lib/services/retry-draft-from-step-utils.ts');
  const { ensureOutlineChapters } = await import('../lib/tutorial/outline-chapters.ts');

  const outline = ensureOutlineChapters({
    meta: { title: 'Demo', description: 'desc' },
    intro: { paragraphs: ['intro'] },
    baseCode: { 'index.js': 'const app = createApp();' },
    chapters: [{ id: 'ch-1', title: 'Chapter 1', order: 0 }],
    steps: [
      {
        id: 'outline-step-1',
        chapterId: 'ch-1',
        title: 'Step 1',
        teachingGoal: 'goal 1',
        conceptIntroduced: 'concept 1',
        estimatedLocChange: 2,
      },
      {
        id: 'outline-step-2',
        chapterId: 'ch-1',
        title: 'Step 2',
        teachingGoal: 'goal 2',
        conceptIntroduced: 'concept 2',
        estimatedLocChange: 3,
      },
      {
        id: 'outline-step-3',
        chapterId: 'ch-1',
        title: 'Step 3',
        teachingGoal: 'goal 3',
        conceptIntroduced: 'concept 3',
        estimatedLocChange: 4,
      },
    ],
  });

  const recovered = buildRetryRecoveryDraft({
    tutorialDraft: {
      meta: { title: 'Demo', description: 'desc' },
      intro: { paragraphs: ['intro'] },
      baseCode: { 'index.js': 'const app = createApp();' },
      chapters: [{ id: 'ch-1', title: 'Chapter 1', order: 0 }],
      steps: [
        {
          id: 'persisted-step-1',
          chapterId: 'ch-1',
          title: 'Persisted Step 1',
          paragraphs: ['done'],
          patches: [{ find: 'createApp', replace: 'createServerApp' }],
          teachingGoal: 'done goal',
          conceptIntroduced: 'done concept',
        },
      ],
    },
    outline,
  });

  assert.equal(recovered.steps.length, 3);
  assert.equal(recovered.steps[0].id, 'persisted-step-1');
  assert.equal(recovered.steps[0].title, 'Persisted Step 1');
  assert.equal(recovered.steps[1].id, 'outline-step-2');
  assert.equal(recovered.steps[1].title, 'Step 2');
  assert.deepEqual(recovered.steps[1].paragraphs, []);
  assert.deepEqual(recovered.steps[1].patches, []);
  assert.equal(recovered.steps[2].teachingGoal, 'goal 3');
  assert.equal(recovered.steps[2].conceptIntroduced, 'concept 3');
});

test('buildRetryRecoveryDraft replaces retry tail with fresh outline placeholders', async () => {
  const { buildRetryRecoveryDraft } = await import('../lib/services/retry-draft-from-step-utils.ts');
  const { ensureOutlineChapters } = await import('../lib/tutorial/outline-chapters.ts');

  const outline = ensureOutlineChapters({
    meta: { title: 'Demo', description: 'desc' },
    intro: { paragraphs: ['intro'] },
    baseCode: { 'index.js': 'const app = createApp();' },
    chapters: [{ id: 'ch-1', title: 'Chapter 1', order: 0 }],
    steps: [
      {
        id: 'outline-step-1',
        chapterId: 'ch-1',
        title: 'Step 1',
        teachingGoal: 'goal 1',
        conceptIntroduced: 'concept 1',
        estimatedLocChange: 2,
      },
      {
        id: 'outline-step-2-edited',
        chapterId: 'ch-1',
        title: 'Edited Step 2',
        teachingGoal: 'edited goal 2',
        conceptIntroduced: 'edited concept 2',
        estimatedLocChange: 3,
      },
      {
        id: 'outline-step-3-edited',
        chapterId: 'ch-1',
        title: 'Edited Step 3',
        teachingGoal: 'edited goal 3',
        conceptIntroduced: 'edited concept 3',
        estimatedLocChange: 4,
      },
    ],
  });

  const recovered = buildRetryRecoveryDraft({
    retryStartIndex: 1,
    tutorialDraft: {
      meta: { title: 'Demo', description: 'desc' },
      intro: { paragraphs: ['intro'] },
      baseCode: { 'index.js': 'const app = createApp();' },
      chapters: [{ id: 'ch-1', title: 'Chapter 1', order: 0 }],
      steps: [
        {
          id: 'persisted-step-1',
          chapterId: 'ch-1',
          title: 'Persisted Step 1',
          paragraphs: ['done'],
          patches: [],
          teachingGoal: 'done goal',
          conceptIntroduced: 'done concept',
        },
        {
          id: 'stale-step-2',
          chapterId: 'ch-1',
          title: 'Stale Step 2',
          paragraphs: ['stale generated prose'],
          patches: [{ find: 'createApp', replace: 'createServerApp' }],
          teachingGoal: 'stale goal',
          conceptIntroduced: 'stale concept',
        },
      ],
    },
    outline,
  });

  assert.equal(recovered.steps[0].id, 'persisted-step-1');
  assert.equal(recovered.steps[1].id, 'outline-step-2-edited');
  assert.equal(recovered.steps[1].title, 'Edited Step 2');
  assert.deepEqual(recovered.steps[1].paragraphs, []);
  assert.deepEqual(recovered.steps[1].patches, []);
  assert.equal(recovered.steps[2].id, 'outline-step-3-edited');
});
