import test from 'node:test';
import assert from 'node:assert/strict';

test('generation service maps multi-phase failures to job terminal updates', async () => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgres://postgres:postgres@127.0.0.1:5432/postgres';

  const service = await import('../lib/services/generate-tutorial-draft.ts');
  const multiPhase = await import('../lib/ai/multi-phase-generator.ts');
  const modelCapabilities = await import('../lib/ai/model-capabilities.ts');
  const validation = await import('../lib/utils/validation.ts');

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

  const validationFailure = service.getGenerationJobFailureUpdate(
    new validation.TutorialDraftValidationError({
      valid: false,
      errors: ['step invalid'],
      provenance: [
        {
          category: 'patch_chain',
          stepIndex: 4,
          stepId: 'step-5',
          stepTitle: 'Broken step',
          file: 'main.ts',
          message: 'patch failed',
          recoverability: 'retry_from_step',
        },
      ],
    })
  );
  assert.equal(validationFailure.status, 'failed');
  assert.equal(validationFailure.errorCode, 'DRAFT_VALIDATION_FAILED');
  assert.equal(validationFailure.currentStepIndex, 4);
  assert.equal(validationFailure.failureDetail.validationProvenance?.[0]?.file, 'main.ts');
});
