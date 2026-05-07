import { z } from 'zod';
import { tutorialOutlineSchema } from './tutorial-outline';

export const agentRuntimeActionSchema = z.enum([
  'planning',
  'step_fill',
  'repair',
  'replan',
  'compress',
  'validate',
]);

export const agentFailureCategorySchema = z.enum([
  'repairable',
  'unrecoverable',
  'provider',
  'validation',
  'unknown',
]);

export const agentStateSnapshotSchema = z.object({
  checkpointIndex: z.number().int(),
  currentAction: agentRuntimeActionSchema,
  currentAttempt: z.number().int().min(0),
  retryCount: z.number().int().min(0),
  replanCount: z.number().int().min(0),
  compressionCount: z.number().int().min(0),
  driftSignals: z.object({
    consecutiveRepairFailures: z.number().int().min(0),
    consecutiveDegradedSteps: z.number().int().min(0),
  }),
  lastFailure: z.object({
    stepIndex: z.number().int().nullable(),
    category: agentFailureCategorySchema,
    message: z.string().nullable(),
  }).nullable(),
  lastCommittedSnapshotHash: z.string().nullable(),
});

export const generationJobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'abandoned',
]);

export const generationJobPhaseSchema = z.enum([
  'outline',
  'step_fill',
  'validate',
  'persist',
]);

export const generationJobErrorCodeSchema = z.enum([
  'OUTLINE_GENERATION_FAILED',
  'STEP_GENERATION_FAILED',
  'PATCH_VALIDATION_FAILED',
  'DRAFT_VALIDATION_FAILED',
  'PERSIST_FAILED',
  'JOB_CANCELLED',
  'JOB_STALE',
  'MODEL_CAPABILITY_MISMATCH',
  'SOURCE_IMPORT_RATE_LIMITED',
  'PREVIEW_BUILD_FAILED',
  'PUBLISH_SLUG_CONFLICT',
]);

export const generationJobFailureDetailSchema = z.record(z.string(), z.unknown());

export const generationJobSchema = z.object({
  id: z.string().uuid(),
  draftId: z.string().uuid(),
  userId: z.string().nullable(),
  status: generationJobStatusSchema,
  phase: generationJobPhaseSchema.nullable(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  heartbeatAt: z.date().nullable(),
  leaseUntil: z.date().nullable(),
  currentStepIndex: z.number().int().nullable(),
  totalSteps: z.number().int().nullable(),
  retryCount: z.number().int().min(0),
  modelId: z.string().nullable(),
  cancelRequested: z.boolean(),
  errorCode: generationJobErrorCodeSchema.nullable(),
  errorMessage: z.string().nullable(),
  failureDetail: generationJobFailureDetailSchema.nullable(),
  outlineSnapshot: tutorialOutlineSchema.nullable(),
  stepTitlesSnapshot: z.array(z.string()).nullable(),
  agentState: agentStateSnapshotSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AgentRuntimeAction = z.infer<typeof agentRuntimeActionSchema>;
export type AgentFailureCategory = z.infer<typeof agentFailureCategorySchema>;
export type AgentStateSnapshot = z.infer<typeof agentStateSnapshotSchema>;
export type GenerationJobStatus = z.infer<typeof generationJobStatusSchema>;
export type GenerationJobPhase = z.infer<typeof generationJobPhaseSchema>;
export type GenerationJobErrorCode = z.infer<typeof generationJobErrorCodeSchema>;
export type GenerationJobFailureDetail = z.infer<
  typeof generationJobFailureDetailSchema
>;
