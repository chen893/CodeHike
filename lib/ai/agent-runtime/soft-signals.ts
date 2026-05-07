import type { TutorialStep } from '../../schemas/tutorial-draft';
import type {
  GenerationReviewReport,
  ReviewGenerationInput,
} from '../../review/generation-quality-review';

const LOC_WARNING_FLOOR = 60;
const LOC_DEFAULT_BUDGET = 8;

export interface AgentSoftSignal {
  kind: 'critique' | 'loc_warning';
  stepIndex: number;
  level: 'info' | 'warn';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AgentSoftSignalCollector {
  record(signal: AgentSoftSignal): void;
  list(): AgentSoftSignal[];
}

export function createSoftSignalCollector(): AgentSoftSignalCollector {
  const signals: AgentSoftSignal[] = [];
  return {
    record(signal) {
      signals.push(signal);
    },
    list() {
      return [...signals];
    },
  };
}

export function shouldCritiqueStep(stepIndex: number, filledStepCount: number) {
  return (stepIndex + 1) % 4 === 0 && filledStepCount >= 3;
}

export function buildCritiqueSignals(
  stepIndex: number,
  report: GenerationReviewReport,
): AgentSoftSignal[] {
  const signals: AgentSoftSignal[] = [
    {
      kind: 'critique',
      stepIndex,
      level: 'info',
      code: 'critique_score',
      message: `Critique score ${report.totalScore} after step ${stepIndex + 1}`,
      details: {
        totalScore: report.totalScore,
        issueCount: report.issues.length,
        pedagogicalProgression: report.scorecard.pedagogicalProgression,
      },
    },
  ];

  if (report.scorecard.pedagogicalProgression < 70) {
    signals.push({
      kind: 'critique',
      stepIndex,
      level: 'warn',
      code: 'pedagogical_drift',
      message: `Pedagogical progression dropped to ${report.scorecard.pedagogicalProgression} at step ${stepIndex + 1}`,
      details: {
        totalScore: report.totalScore,
        issueCount: report.issues.length,
      },
    });
  }

  return signals;
}

export function buildLocWarningSignal(params: {
  stepIndex: number;
  step: TutorialStep;
  estimatedLocChange?: number | null;
  defaultBudget?: number;
  warningFloor?: number;
}) {
  const patches = params.step.patches ?? [];
  if (patches.length === 0) return null;

  const actualLoc = patches.reduce((sum, patch) => {
    return sum + Math.abs(patch.replace.split('\n').length - patch.find.split('\n').length);
  }, 0);
  const locBudget = params.estimatedLocChange ?? params.defaultBudget ?? LOC_DEFAULT_BUDGET;
  const warningThreshold = Math.max(locBudget * 2, params.warningFloor ?? LOC_WARNING_FLOOR);

  if (actualLoc <= warningThreshold) {
    return null;
  }

  return {
    kind: 'loc_warning' as const,
    stepIndex: params.stepIndex,
    level: 'warn' as const,
    code: 'loc_budget_exceeded',
    message: `Step ${params.stepIndex + 1} changed ${actualLoc} LOC, above warning threshold ${warningThreshold}`,
    details: {
      actualLoc,
      locBudget,
      warningThreshold,
    },
  };
}

export function buildCritiqueReviewInput(input: ReviewGenerationInput) {
  return input;
}
