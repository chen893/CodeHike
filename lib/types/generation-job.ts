import type { TutorialOutline } from '../schemas/tutorial-outline';
import type {
  GenerationJobErrorCode,
  GenerationJobFailureDetail,
  GenerationJobPhase,
  GenerationJobStatus,
} from '../schemas/generation-job';

export const ACTIVE_DRAFT_GENERATION_JOB_STATUSES = ['queued', 'running'] as const;
export const TERMINAL_DRAFT_GENERATION_JOB_STATUSES = [
  'succeeded',
  'failed',
  'cancelled',
  'abandoned',
] as const;

export function isActiveDraftGenerationJobStatus(
  status: GenerationJobStatus
): boolean {
  return ACTIVE_DRAFT_GENERATION_JOB_STATUSES.includes(
    status as (typeof ACTIVE_DRAFT_GENERATION_JOB_STATUSES)[number]
  );
}

export function isTerminalDraftGenerationJobStatus(
  status: GenerationJobStatus
): boolean {
  return TERMINAL_DRAFT_GENERATION_JOB_STATUSES.includes(
    status as (typeof TERMINAL_DRAFT_GENERATION_JOB_STATUSES)[number]
  );
}

export type Recoverability = 'none' | 'retry_full' | 'retry_from_step';

export function mapJobToRecoverability(job: DraftGenerationJob | null): Recoverability {
  if (!job) return 'none';
  if (job.status === 'succeeded') return 'none';
  if (job.status === 'running' || job.status === 'queued') return 'none';

  // Terminal failed/cancelled/abandoned states
  if (
    (job.errorCode === 'STEP_GENERATION_FAILED' ||
      job.errorCode === 'PATCH_VALIDATION_FAILED') &&
    job.currentStepIndex != null &&
    job.currentStepIndex >= 0
  ) {
    return 'retry_from_step';
  }

  return 'retry_full';
}

export interface DraftGenerationJob {
  id: string;
  draftId: string;
  userId: string | null;
  status: GenerationJobStatus;
  phase: GenerationJobPhase | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
  leaseUntil: Date | null;
  currentStepIndex: number | null;
  totalSteps: number | null;
  retryCount: number;
  modelId: string | null;
  cancelRequested: boolean;
  errorCode: GenerationJobErrorCode | null;
  errorMessage: string | null;
  failureDetail: GenerationJobFailureDetail | null;
  outlineSnapshot: TutorialOutline | null;
  stepTitlesSnapshot: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}
