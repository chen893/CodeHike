import type { ContentPatch, TutorialDraft } from '../../schemas/tutorial-draft';
import type { TutorialOutline } from '../../schemas/tutorial-outline';
import type { AgentSoftSignal } from './soft-signals';

export type AgentRuntimeAction =
  | 'planning'
  | 'step_fill'
  | 'repair'
  | 'replan'
  | 'compress'
  | 'validate';

export type AgentFailureCategory =
  | 'repairable'
  | 'unrecoverable'
  | 'provider'
  | 'validation'
  | 'unknown';

export interface AgentStateSnapshot {
  checkpointIndex: number;
  currentAction: AgentRuntimeAction;
  currentAttempt: number;
  retryCount: number;
  replanCount: number;
  compressionCount: number;
  driftSignals: {
    consecutiveRepairFailures: number;
    consecutiveDegradedSteps: number;
  };
  lastFailure: {
    stepIndex: number | null;
    category: AgentFailureCategory;
    message: string | null;
  } | null;
  lastCommittedSnapshotHash: string | null;
}

export interface AgentResumeState {
  outline: TutorialOutline;
  partialDraft: TutorialDraft;
  agentState: AgentStateSnapshot;
  startStepIndex: number;
}

export interface StepValidationResult {
  result: 'pass' | 'repairable' | 'unrecoverable';
  errors: string[];
  actualCode: Record<string, string>;
  appliedFiles?: Record<string, string>;
  fixedPatches?: ContentPatch[];
}

export interface RepairRecord {
  stepIndex: number;
  attempts: number;
  strategy: 'exact' | 'auto-fixed' | 'full-rewrite';
  outcome: 'pass' | 'degraded';
  errorMessage: string;
}

export interface StepOutcome {
  stepIndex: number;
  result: 'pass' | 'repaired' | 'replanned';
  repairCount: number;
  patchStrategy: 'exact' | 'auto-fixed' | 'full-rewrite';
  locChange: number;
}

export interface AgentLoopMetrics {
  outcomes: StepOutcome[];
  repairHistory: RepairRecord[];
  replanCount: number;
  compressionCount: number;
  softSignals?: AgentSoftSignal[];
}
