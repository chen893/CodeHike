import test from 'node:test';
import assert from 'node:assert/strict';

test('generation service maps multi-phase failures to job terminal updates', async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@127.0.0.1:5432/postgres';

  const service = await import('../lib/services/generate-tutorial-draft.ts');
  const multiPhase = await import('../lib/ai/multi-phase-generator.ts');
  const modelCapabilities = await import('../lib/ai/model-capabilities.ts');

  const cancelled = service.getGenerationJobFailureUpdate(
    new multiPhase.MultiPhaseGenerationError(
      'step_fill',
      new multiPhase.GenerationCancelledError(),
      2
    )
  );
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.errorCode, 'JOB_CANCELLED');
  assert.equal(cancelled.phase, 'step_fill');
  assert.equal(cancelled.currentStepIndex, 2);

  const outlineFailed = service.getGenerationJobFailureUpdate(
    new multiPhase.MultiPhaseGenerationError(
      'outline',
      new Error('outline parse failed')
    )
  );
  assert.equal(outlineFailed.status, 'failed');
  assert.equal(outlineFailed.errorCode, 'OUTLINE_GENERATION_FAILED');
  assert.equal(outlineFailed.phase, 'outline');
  assert.equal(outlineFailed.errorMessage, 'outline parse failed');

  const capabilityMismatch = service.getGenerationJobFailureUpdate(
    new multiPhase.MultiPhaseGenerationError(
      'outline',
      new modelCapabilities.RetrievalModelRequiredError({
        modelId: 'deepseek/deepseek-reasoner',
        fileCount: 60,
        estimatedTokens: 120000,
      })
    )
  );
  assert.equal(capabilityMismatch.status, 'failed');
  assert.equal(capabilityMismatch.errorCode, 'MODEL_CAPABILITY_MISMATCH');
  assert.equal(capabilityMismatch.failureDetail.modelId, 'deepseek/deepseek-reasoner');
  assert.equal(capabilityMismatch.failureDetail.fileCount, 60);
});
