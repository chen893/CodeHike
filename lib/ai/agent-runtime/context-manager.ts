import {
  autoSummarize,
  microCompact,
  type DistilledContext,
} from '../agent-context';
import { createSessionMemory } from '../agent-memory';
import { estimateTokens, getMaxInputTokens } from '../token-budget';
import type { TutorialStep } from '../../schemas/tutorial-draft';
import type { TutorialOutline } from '../../schemas/tutorial-outline';
import type { SourceItem } from '../../schemas/source-item';
import type { TeachingBrief } from '../../schemas/teaching-brief';
import type { RepairRecord, StepOutcome } from './types';
import { shouldCompress } from './recovery-policy';

export interface CompressionResult {
  action: 'none' | 'summary' | 'replan';
  attemptedAction: 'summary' | 'replan' | null;
  tokensBefore: number;
  tokensAfter: number;
  distilledContext: DistilledContext | null;
  outline: TutorialOutline | null;
  error: unknown;
}

export interface AgentContextManager {
  recordStepOutcome(outcome: StepOutcome): void;
  recordRepair(record: RepairRecord): void;
  detectDrift(): { drifting: boolean; consecutiveDegraded: number };
  getStepOutcomes(): StepOutcome[];
  getRepairHistory(): RepairRecord[];
  getCompressionCount(): number;
  getTokenUsage(): { used: number; budget: number };
  getDistilledContext(): DistilledContext | null;
  getDistilledPromptSection(): string;
  maybeCompress(params: {
    filledSteps: TutorialStep[];
    currentCode: Record<string, string>;
    outline: TutorialOutline;
    currentStepIndex: number;
    teachingBrief: TeachingBrief;
    sourceItems: SourceItem[];
    replanRemainingOutline: () => Promise<TutorialOutline>;
    onBeforeAction?: (event: {
      action: 'compress';
      mode: 'summary' | 'replan';
      tokensBefore: number;
      tokensAfter: number;
    }) => Promise<void> | void;
  }): Promise<CompressionResult>;
}

type AutoSummarizeFn = typeof autoSummarize;
type EstimateTokenCountFn = typeof estimateTokens;

export function createAgentContextManager(params: {
  modelId?: string;
  initialCompressionCount?: number;
  tokenBudget?: number;
  summarizeContext?: AutoSummarizeFn;
  estimateTokenCount?: EstimateTokenCountFn;
} = {}): AgentContextManager {
  const sessionMemory = createSessionMemory();
  const summarizeContext =
    params.summarizeContext ??
    ((input, modelId) => autoSummarize(input, modelId));
  const estimateTokenCount = params.estimateTokenCount ?? estimateTokens;
  const tokenBudget =
    params.tokenBudget ??
    getMaxInputTokens(params.modelId ?? 'deepseek/deepseek-chat');

  let estimatedTokenUsage = 0;
  let compressionCount = params.initialCompressionCount ?? 0;
  let distilledContext: DistilledContext | null = null;

  return {
    recordStepOutcome(outcome) {
      sessionMemory.recordStepOutcome(outcome);
    },
    recordRepair(record) {
      sessionMemory.recordRepair(record);
    },
    detectDrift() {
      return sessionMemory.detectDrift();
    },
    getStepOutcomes() {
      return sessionMemory.getStepOutcomes();
    },
    getRepairHistory() {
      return sessionMemory.getRepairHistory();
    },
    getCompressionCount() {
      return compressionCount;
    },
    getTokenUsage() {
      return { used: estimatedTokenUsage, budget: tokenBudget };
    },
    getDistilledContext() {
      return distilledContext;
    },
    getDistilledPromptSection() {
      return buildDistilledContextPromptSection(distilledContext);
    },
    async maybeCompress({
      filledSteps,
      currentCode,
      outline,
      currentStepIndex,
      teachingBrief,
      sourceItems,
      replanRemainingOutline,
      onBeforeAction,
    }) {
      const completedStepsSummary = microCompact(filledSteps, filledSteps.length);
      estimatedTokenUsage += estimateTokenCount(completedStepsSummary);

      const attemptedAction = shouldCompress({
        used: estimatedTokenUsage,
        budget: tokenBudget,
      });
      if (attemptedAction !== 'summary' && attemptedAction !== 'replan') {
        return {
          action: 'none',
          attemptedAction: null,
          tokensBefore: estimatedTokenUsage,
          tokensAfter: estimatedTokenUsage,
          distilledContext,
          outline: null,
          error: null,
        };
      }

      const tokensBefore = estimatedTokenUsage;
      compressionCount++;

      if (attemptedAction === 'summary') {
        try {
          await onBeforeAction?.({
            action: 'compress',
            mode: attemptedAction,
            tokensBefore,
            tokensAfter: estimatedTokenUsage,
          });
          distilledContext = await summarizeContext(
            {
              completedStepsSummary,
              currentCode,
              repairHistory: sessionMemory.getRepairHistory(),
              outline,
              currentStepIndex,
              teachingBrief,
            },
            params.modelId,
          );
          estimatedTokenUsage = estimateTokenCount(JSON.stringify(distilledContext));
          return {
            action: 'summary',
            attemptedAction,
            tokensBefore,
            tokensAfter: estimatedTokenUsage,
            distilledContext,
            outline: null,
            error: null,
          };
        } catch (error) {
          return {
            action: 'none',
            attemptedAction,
            tokensBefore,
            tokensAfter: estimatedTokenUsage,
            distilledContext,
            outline: null,
            error,
          };
        }
      }

      try {
        await onBeforeAction?.({
          action: 'compress',
          mode: attemptedAction,
          tokensBefore,
          tokensAfter: estimatedTokenUsage,
        });
        const revisedOutline = await replanRemainingOutline();
        estimatedTokenUsage = estimateTokenCount(JSON.stringify(revisedOutline));
        return {
          action: 'replan',
          attemptedAction,
          tokensBefore,
          tokensAfter: estimatedTokenUsage,
          distilledContext,
          outline: revisedOutline,
          error: null,
        };
      } catch (error) {
        return {
          action: 'none',
          attemptedAction,
          tokensBefore,
          tokensAfter: estimatedTokenUsage,
          distilledContext,
          outline: null,
          error,
        };
      }
    },
  };
}

export function buildDistilledContextPromptSection(
  distilledContext: DistilledContext | null,
) {
  if (!distilledContext) return '';

  return `

## Compressed context from previous steps
${distilledContext.completedStepsSummary}

## Key code structure
${distilledContext.currentCodeSignatures}

## Error and repair history
${distilledContext.errorAndRepairHistory}`;
}
