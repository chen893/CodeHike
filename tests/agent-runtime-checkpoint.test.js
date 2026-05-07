import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSnapshotHash,
  createEmptyAgentState,
  deriveAgentResumeState,
  validateAgentResumeCheckpoint,
  withCommittedCheckpoint,
} from '../lib/ai/agent-runtime/checkpoint-adapter.ts';

test('computeSnapshotHash is deterministic across object key order', () => {
  const a = computeSnapshotHash({
    'b.ts': 'export const b = 2;\n',
    'a.ts': 'export const a = 1;\n',
  });
  const b = computeSnapshotHash({
    'a.ts': 'export const a = 1;\n',
    'b.ts': 'export const b = 2;\n',
  });

  assert.equal(a, b);
});

test('deriveAgentResumeState returns committed-step resume only for failed auto agent jobs', () => {
  const agentState = withCommittedCheckpoint({
    state: createEmptyAgentState(),
    checkpointIndex: 1,
    currentAction: 'step_fill',
    snapshotHash: 'hash-1',
  });

  const resume = deriveAgentResumeState({
    useAgentLoop: true,
    generationMode: 'auto',
    draftTutorial: {
      meta: { title: 'T', description: 'D', lang: 'ts', fileName: 'main.ts' },
      intro: { paragraphs: ['intro'] },
      chapters: [{ id: 'ch-1', title: 'One', description: '', order: 0 }],
      baseCode: { 'main.ts': 'export const x = 1;\n' },
      steps: [
        { id: 'step-1', chapterId: 'ch-1', title: 'One', paragraphs: ['a'] },
        { id: 'step-2', chapterId: 'ch-1', title: 'Two', paragraphs: ['b'] },
      ],
    },
    latestJob: {
      id: 'job-1',
      draftId: 'draft-1',
      userId: 'user-1',
      status: 'failed',
      phase: 'step_fill',
      startedAt: null,
      finishedAt: null,
      heartbeatAt: null,
      leaseUntil: null,
      currentStepIndex: 2,
      totalSteps: 4,
      retryCount: 3,
      modelId: 'deepseek/deepseek-chat',
      cancelRequested: false,
      errorCode: 'STEP_GENERATION_FAILED',
      errorMessage: 'broken',
      failureDetail: null,
      outlineSnapshot: {
        meta: { title: 'T', description: 'D' },
        intro: { paragraphs: ['intro'] },
        baseCode: 'export const x = 1;\n',
        steps: [
          { id: 'step-1', title: 'One', teachingGoal: 'a' },
          { id: 'step-2', title: 'Two', teachingGoal: 'b' },
          { id: 'step-3', title: 'Three', teachingGoal: 'c' },
          { id: 'step-4', title: 'Four', teachingGoal: 'd' },
        ],
      },
      stepTitlesSnapshot: ['One', 'Two', 'Three', 'Four'],
      agentState,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  assert.equal(resume?.startStepIndex, 2);
  assert.equal(resume?.agentState.checkpointIndex, 1);
});

test('deriveAgentResumeState resumes validation failures from the failed indexed step', () => {
  const agentState = withCommittedCheckpoint({
    state: createEmptyAgentState(),
    checkpointIndex: 2,
    currentAction: 'validate',
    snapshotHash: 'final-invalid-hash',
  });

  const resume = deriveAgentResumeState({
    useAgentLoop: true,
    generationMode: 'auto',
    draftTutorial: {
      meta: { title: 'T', description: 'D', lang: 'ts', fileName: 'main.ts' },
      intro: { paragraphs: ['intro'] },
      chapters: [{ id: 'ch-1', title: 'One', description: '', order: 0 }],
      baseCode: { 'main.ts': 'export const x = 1;\n' },
      steps: [
        { id: 'step-1', chapterId: 'ch-1', title: 'One', paragraphs: ['a'] },
        { id: 'step-2', chapterId: 'ch-1', title: 'Two', paragraphs: ['b'] },
        { id: 'step-3', chapterId: 'ch-1', title: 'Three', paragraphs: ['c'] },
      ],
    },
    latestJob: {
      id: 'job-1',
      draftId: 'draft-1',
      userId: 'user-1',
      status: 'failed',
      phase: 'persist',
      startedAt: null,
      finishedAt: null,
      heartbeatAt: null,
      leaseUntil: null,
      currentStepIndex: 1,
      totalSteps: 3,
      retryCount: 0,
      modelId: 'deepseek/deepseek-chat',
      cancelRequested: false,
      errorCode: 'DRAFT_VALIDATION_FAILED',
      errorMessage: 'step 2 invalid',
      failureDetail: null,
      outlineSnapshot: {
        meta: { title: 'T', description: 'D' },
        intro: { paragraphs: ['intro'] },
        baseCode: 'export const x = 1;\n',
        steps: [
          { id: 'step-1', title: 'One', teachingGoal: 'a' },
          { id: 'step-2', title: 'Two', teachingGoal: 'b' },
          { id: 'step-3', title: 'Three', teachingGoal: 'c' },
        ],
      },
      stepTitlesSnapshot: ['One', 'Two', 'Three'],
      agentState,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  assert.equal(resume?.startStepIndex, 1);

  const checkpoint = validateAgentResumeCheckpoint(resume);
  assert.equal(checkpoint.status, 'realigned');
  assert.equal(checkpoint.expectedCheckpointIndex, 0);
});

test('deriveAgentResumeState ignores non-auto resume modes', () => {
  const resume = deriveAgentResumeState({
    useAgentLoop: true,
    generationMode: 'fill_from_saved_outline',
    draftTutorial: {
      meta: { title: 'T', description: 'D', lang: 'ts', fileName: 'main.ts' },
      intro: { paragraphs: ['intro'] },
      chapters: [{ id: 'ch-1', title: 'One', description: '', order: 0 }],
      baseCode: { 'main.ts': 'export const x = 1;\n' },
      steps: [],
    },
    latestJob: null,
  });

  assert.equal(resume, null);
});

test('validateAgentResumeCheckpoint rejects hash mismatches at the committed boundary', () => {
  const partialDraft = {
    meta: { title: 'T', description: 'D', lang: 'ts', fileName: 'main.ts' },
    intro: { paragraphs: ['intro'] },
    chapters: [{ id: 'ch-1', title: 'One', description: '', order: 0 }],
    baseCode: { 'main.ts': 'export const x = 1;\n' },
    steps: [
      { id: 'step-1', chapterId: 'ch-1', title: 'One', paragraphs: ['a'] },
    ],
  };

  const result = validateAgentResumeCheckpoint({
    outline: {
      meta: { title: 'T', description: 'D' },
      intro: { paragraphs: ['intro'] },
      baseCode: 'export const x = 1;\n',
      steps: [{ id: 'step-1', title: 'One', teachingGoal: 'a' }],
    },
    partialDraft,
    startStepIndex: 1,
    agentState: withCommittedCheckpoint({
      state: createEmptyAgentState(),
      checkpointIndex: 0,
      currentAction: 'step_fill',
      snapshotHash: 'stale-hash',
    }),
  });

  assert.equal(result.status, 'invalid');
  assert.equal(result.reason, 'checkpoint_hash_mismatch');
});

test('validateAgentResumeCheckpoint realigns stale checkpoint index to partial draft truth', () => {
  const partialDraft = {
    meta: { title: 'T', description: 'D', lang: 'ts', fileName: 'main.ts' },
    intro: { paragraphs: ['intro'] },
    chapters: [{ id: 'ch-1', title: 'One', description: '', order: 0 }],
    baseCode: { 'main.ts': 'export const x = 1;\n' },
    steps: [
      { id: 'step-1', chapterId: 'ch-1', title: 'One', paragraphs: ['a'] },
      { id: 'step-2', chapterId: 'ch-1', title: 'Two', paragraphs: ['b'] },
    ],
  };

  const result = validateAgentResumeCheckpoint({
    outline: {
      meta: { title: 'T', description: 'D' },
      intro: { paragraphs: ['intro'] },
      baseCode: 'export const x = 1;\n',
      steps: [
        { id: 'step-1', title: 'One', teachingGoal: 'a' },
        { id: 'step-2', title: 'Two', teachingGoal: 'b' },
      ],
    },
    partialDraft,
    startStepIndex: 2,
    agentState: withCommittedCheckpoint({
      state: createEmptyAgentState(),
      checkpointIndex: 0,
      currentAction: 'step_fill',
      snapshotHash: computeSnapshotHash({ 'main.ts': 'export const x = 1;\n' }),
    }),
  });

  assert.equal(result.status, 'realigned');
  assert.equal(result.expectedCheckpointIndex, 1);
  assert.equal(result.agentState.checkpointIndex, 1);
  assert.equal(result.agentState.lastCommittedSnapshotHash, result.snapshotHash);
});
