import { z } from 'zod';
import { tutorialOutlineSchema } from './tutorial-outline';

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
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type GenerationJobStatus = z.infer<typeof generationJobStatusSchema>;
export type GenerationJobPhase = z.infer<typeof generationJobPhaseSchema>;
export type GenerationJobErrorCode = z.infer<typeof generationJobErrorCodeSchema>;
export type GenerationJobFailureDetail = z.infer<
  typeof generationJobFailureDetailSchema
>;
