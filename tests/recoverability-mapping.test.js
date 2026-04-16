import test from 'node:test';
import assert from 'node:assert/strict';

test('mapJobToRecoverability returns "none" for null job', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  assert.equal(mapJobToRecoverability(null), 'none');
});

test('mapJobToRecoverability returns "none" for succeeded job', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({ status: 'succeeded' });
  assert.equal(mapJobToRecoverability(job), 'none');
});

test('mapJobToRecoverability returns "none" for running job', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({ status: 'running' });
  assert.equal(mapJobToRecoverability(job), 'none');
});

test('mapJobToRecoverability returns "none" for queued job', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({ status: 'queued' });
  assert.equal(mapJobToRecoverability(job), 'none');
});

test('mapJobToRecoverability returns "retry_from_step" for STEP_GENERATION_FAILED with stepIndex', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'failed',
    errorCode: 'STEP_GENERATION_FAILED',
    currentStepIndex: 3,
  });
  assert.equal(mapJobToRecoverability(job), 'retry_from_step');
});

test('mapJobToRecoverability returns "retry_from_step" for PATCH_VALIDATION_FAILED with stepIndex', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'failed',
    errorCode: 'PATCH_VALIDATION_FAILED',
    currentStepIndex: 1,
  });
  assert.equal(mapJobToRecoverability(job), 'retry_from_step');
});

test('mapJobToRecoverability returns "retry_from_step" when stepIndex is 0', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'failed',
    errorCode: 'STEP_GENERATION_FAILED',
    currentStepIndex: 0,
  });
  assert.equal(mapJobToRecoverability(job), 'retry_from_step');
});

test('mapJobToRecoverability returns "retry_full" for STEP_GENERATION_FAILED with null stepIndex', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'failed',
    errorCode: 'STEP_GENERATION_FAILED',
    currentStepIndex: null,
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

test('mapJobToRecoverability returns "retry_full" for OUTLINE_GENERATION_FAILED', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'failed',
    errorCode: 'OUTLINE_GENERATION_FAILED',
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

test('mapJobToRecoverability returns "retry_full" for DRAFT_VALIDATION_FAILED', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'failed',
    errorCode: 'DRAFT_VALIDATION_FAILED',
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

test('mapJobToRecoverability returns "retry_full" for PERSIST_FAILED', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'failed',
    errorCode: 'PERSIST_FAILED',
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

test('mapJobToRecoverability returns "retry_full" for JOB_CANCELLED', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'cancelled',
    errorCode: 'JOB_CANCELLED',
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

test('mapJobToRecoverability returns "retry_full" for JOB_STALE (abandoned)', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'abandoned',
    errorCode: 'JOB_STALE',
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

test('mapJobToRecoverability returns "retry_full" for MODEL_CAPABILITY_MISMATCH', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'failed',
    errorCode: 'MODEL_CAPABILITY_MISMATCH',
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

test('mapJobToRecoverability returns "retry_full" for failed job with no errorCode', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'failed',
    errorCode: null,
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

test('mapJobToRecoverability returns "retry_full" for cancelled job without STEP error code', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'cancelled',
    errorCode: null,
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

test('mapJobToRecoverability returns "retry_full" for abandoned job with no step info', async () => {
  const { mapJobToRecoverability } = await import('../lib/types/generation-job.ts');
  const job = makeJob({
    status: 'abandoned',
    errorCode: 'SOURCE_IMPORT_RATE_LIMITED',
  });
  assert.equal(mapJobToRecoverability(job), 'retry_full');
});

// --- Helpers ---

function makeJob(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    draftId: '22222222-2222-4222-8222-222222222222',
    userId: 'user-1',
    status: 'queued',
    phase: null,
    startedAt: null,
    finishedAt: null,
    heartbeatAt: null,
    leaseUntil: null,
    currentStepIndex: null,
    totalSteps: null,
    retryCount: 0,
    modelId: 'deepseek-chat',
    cancelRequested: false,
    errorCode: null,
    errorMessage: null,
    failureDetail: null,
    outlineSnapshot: null,
    stepTitlesSnapshot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
