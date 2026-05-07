import { createHash } from 'crypto';
import type { TutorialDraft } from '../../schemas/tutorial-draft';
import type { TutorialOutline } from '../../schemas/tutorial-outline';
import type { DraftGenerationJob } from '../../types/generation-job';
import type { DraftGenerationMode } from '../../types/generation-mode';
import { getFilesAfterStep } from '../../tutorial/draft-code';
import { normalizeBaseCode } from '../../tutorial/normalize';
import type { AgentFailureCategory, AgentResumeState, AgentRuntimeAction, AgentStateSnapshot } from './types';

function sortObjectEntries(files: Record<string, string>) {
  return Object.keys(files)
    .sort()
    .map((key) => [key, files[key]]);
}

export function computeSnapshotHash(files: Record<string, string>) {
  return createHash('sha256')
    .update(JSON.stringify(sortObjectEntries(files)))
    .digest('hex');
}

export function createEmptyAgentState(
  overrides: Partial<AgentStateSnapshot> = {},
): AgentStateSnapshot {
  const base = {
    checkpointIndex: -1,
    currentAction: 'planning' as const,
    currentAttempt: 0,
    retryCount: 0,
    replanCount: 0,
    compressionCount: 0,
    lastFailure: null,
    lastCommittedSnapshotHash: null,
    ...overrides,
  };
  const driftSignals = {
    consecutiveRepairFailures:
      overrides.driftSignals?.consecutiveRepairFailures ?? 0,
    consecutiveDegradedSteps:
      overrides.driftSignals?.consecutiveDegradedSteps ?? 0,
  };

  return {
    ...base,
    driftSignals,
  };
}

export function withAgentAction(
  state: AgentStateSnapshot | null | undefined,
  action: AgentRuntimeAction,
  overrides: Partial<AgentStateSnapshot> = {},
) {
  const base = createEmptyAgentState(state ?? undefined);
  return createEmptyAgentState({
    ...base,
    currentAction: action,
    ...overrides,
  });
}

export function withCommittedCheckpoint(params: {
  state: AgentStateSnapshot | null | undefined;
  checkpointIndex: number;
  currentAction: AgentRuntimeAction;
  snapshotHash: string;
  retryCount?: number;
  replanCount?: number;
  compressionCount?: number;
  consecutiveRepairFailures?: number;
}) {
  const base = createEmptyAgentState(params.state ?? undefined);
  return createEmptyAgentState({
    ...base,
    checkpointIndex: params.checkpointIndex,
    currentAction: params.currentAction,
    retryCount: params.retryCount ?? base.retryCount,
    replanCount: params.replanCount ?? base.replanCount,
    compressionCount: params.compressionCount ?? base.compressionCount,
    currentAttempt: 0,
    driftSignals: {
      consecutiveRepairFailures:
        params.consecutiveRepairFailures ?? base.driftSignals.consecutiveRepairFailures,
      consecutiveDegradedSteps: base.driftSignals.consecutiveDegradedSteps,
    },
    lastCommittedSnapshotHash: params.snapshotHash,
    lastFailure: null,
  });
}

export function withFailureState(params: {
  state: AgentStateSnapshot | null | undefined;
  action: AgentRuntimeAction;
  stepIndex: number | null;
  category: AgentFailureCategory;
  message: string | null;
  retryCount?: number;
  currentAttempt?: number;
  consecutiveRepairFailures?: number;
}) {
  const base = createEmptyAgentState(params.state ?? undefined);
  return createEmptyAgentState({
    ...base,
    currentAction: params.action,
    retryCount: params.retryCount ?? base.retryCount,
    currentAttempt: params.currentAttempt ?? base.currentAttempt,
    driftSignals: {
      consecutiveRepairFailures:
        params.consecutiveRepairFailures ?? base.driftSignals.consecutiveRepairFailures,
      consecutiveDegradedSteps: base.driftSignals.consecutiveDegradedSteps,
    },
    lastFailure: {
      stepIndex: params.stepIndex,
      category: params.category,
      message: params.message,
    },
  });
}

export function getCommittedStepCount(partialDraft: TutorialDraft | null | undefined) {
  return partialDraft?.steps?.length ?? 0;
}

function getResumeStartStepIndex(params: {
  partialDraft: TutorialDraft;
  latestJob: DraftGenerationJob;
}) {
  const committedStepCount = getCommittedStepCount(params.partialDraft);
  const failedStepIndex = params.latestJob.currentStepIndex;
  const canResumeFromFailedStep =
    params.latestJob.errorCode === 'STEP_GENERATION_FAILED' ||
    params.latestJob.errorCode === 'PATCH_VALIDATION_FAILED' ||
    params.latestJob.errorCode === 'DRAFT_VALIDATION_FAILED';

  if (
    canResumeFromFailedStep &&
    failedStepIndex !== null &&
    failedStepIndex >= 0 &&
    failedStepIndex < committedStepCount
  ) {
    return failedStepIndex;
  }

  return committedStepCount;
}

export function getCommittedSnapshotFiles(
  partialDraft: TutorialDraft,
  checkpointIndex: number,
) {
  if (checkpointIndex < 0) {
    return normalizeBaseCode(partialDraft.baseCode, partialDraft.meta).files;
  }
  return getFilesAfterStep(partialDraft, checkpointIndex);
}

export type AgentResumeCheckpointValidation =
  | {
      status: 'valid';
      expectedCheckpointIndex: number;
      snapshotHash: string;
      agentState: AgentStateSnapshot;
    }
  | {
      status: 'realigned';
      expectedCheckpointIndex: number;
      snapshotHash: string;
      agentState: AgentStateSnapshot;
      reason: string;
    }
  | {
      status: 'invalid';
      expectedCheckpointIndex: number;
      reason: string;
      errorMessage?: string;
    };

export function validateAgentResumeCheckpoint(
  resumeState: AgentResumeState,
): AgentResumeCheckpointValidation {
  const expectedCheckpointIndex = resumeState.startStepIndex - 1;

  let snapshotHash: string;
  try {
    snapshotHash = computeSnapshotHash(
      getCommittedSnapshotFiles(
        resumeState.partialDraft,
        expectedCheckpointIndex,
      ),
    );
  } catch (error) {
    return {
      status: 'invalid',
      expectedCheckpointIndex,
      reason: 'partial_draft_invalid',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  const persistedHash = resumeState.agentState.lastCommittedSnapshotHash;
  if (
    resumeState.agentState.checkpointIndex === expectedCheckpointIndex &&
    persistedHash &&
    persistedHash !== snapshotHash
  ) {
    return {
      status: 'invalid',
      expectedCheckpointIndex,
      reason: 'checkpoint_hash_mismatch',
      errorMessage: `expected ${persistedHash}, got ${snapshotHash}`,
    };
  }

  if (resumeState.agentState.checkpointIndex !== expectedCheckpointIndex) {
    return {
      status: 'realigned',
      expectedCheckpointIndex,
      snapshotHash,
      reason: `checkpoint_index_mismatch:${resumeState.agentState.checkpointIndex}->${expectedCheckpointIndex}`,
      agentState: withCommittedCheckpoint({
        state: resumeState.agentState,
        checkpointIndex: expectedCheckpointIndex,
        currentAction: 'step_fill',
        snapshotHash,
        retryCount: resumeState.agentState.retryCount,
        replanCount: resumeState.agentState.replanCount,
        compressionCount: resumeState.agentState.compressionCount,
        consecutiveRepairFailures:
          resumeState.agentState.driftSignals.consecutiveRepairFailures,
      }),
    };
  }

  return {
    status: 'valid',
    expectedCheckpointIndex,
    snapshotHash,
    agentState: resumeState.agentState,
  };
}

export function deriveAgentResumeState(params: {
  useAgentLoop: boolean;
  generationMode: DraftGenerationMode;
  draftTutorial: TutorialDraft | null;
  latestJob: DraftGenerationJob | null;
}): AgentResumeState | null {
  if (!params.useAgentLoop) return null;
  if (params.generationMode !== 'auto') return null;
  if (!params.latestJob) return null;
  if (!params.draftTutorial) return null;
  if (
    params.latestJob.status !== 'failed' &&
    params.latestJob.status !== 'abandoned'
  ) {
    return null;
  }
  if (!params.latestJob.outlineSnapshot || !params.latestJob.agentState) return null;

  const startStepIndex = getResumeStartStepIndex({
    partialDraft: params.draftTutorial,
    latestJob: params.latestJob,
  });

  return {
    outline: params.latestJob.outlineSnapshot,
    partialDraft: params.draftTutorial,
    agentState: params.latestJob.agentState,
    startStepIndex,
  };
}
