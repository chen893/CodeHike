/**
 * Agent Loop Core Orchestrator
 *
 * Replaces the fixed pipeline with a per-step validation loop:
 *   1. Generate outline (identical to multi-phase-generator for cache optimization)
 *   2. Step-fill with immediate per-step validation
 *   3. Directed repair with actual code state injection
 *   4. Final validation
 *
 * Key differences from multi-phase-generator:
 *   - Every step-fill is immediately validated
 *   - REPAIRABLE steps receive a repair prompt with actual code state
 *   - Agent loop respects a step-scaled turn budget, maxRepairsPerStep=3, maxReplans=2
 */

import type { TutorialStep, TutorialDraft } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import { applyContentPatches } from '../tutorial/draft-code';
import { normalizeBaseCode } from '../tutorial/normalize';
import { ensureDraftChapters } from '../tutorial/chapters';
import {
  validateTutorialDraft,
  TutorialDraftValidationError,
} from '../utils/validation';
import { createProvider, getMaxOutputTokens } from './provider-registry';
import {
  materializeBaseCodeForFilledSteps,
  prepareGenerationBaseFiles,
} from './progressive-snapshot-base-code';
import {
  supportsRetrievalGeneration,
  RetrievalModelRequiredError,
  supportsNativeStructuredOutput,
} from './model-capabilities';
import { estimateTokens, getMaxInputTokens } from './token-budget';
import { recommendStepBudget } from './step-budget';
import {
  GenerationCancelledError,
  MultiPhaseGenerationError,
  type CancelToken,
  type MultiPhaseLifecycleHooks,
  type MultiPhaseStream,
  type MultiPhaseResult,
  type MultiPhaseLifecyclePhase,
  type MultiPhaseGenerationOptions,
} from './multi-phase-generator';
import {
  type AgentLoopMetrics,
  type AgentResumeState,
  type StepOutcome,
} from './agent-runtime/types';
import { createAgentContextManager } from './agent-runtime/context-manager';
import { executeStep } from './agent-runtime/executor';
import {
  replanRemainingOutline,
  resolveInitialOutline,
  reviseOutlineTail,
} from './agent-runtime/planner';
import {
  shouldAcceptDegradedStep,
  shouldReviseTail,
} from './agent-runtime/recovery-policy';
import {
  buildCritiqueSignals,
  buildLocWarningSignal,
  createSoftSignalCollector,
  shouldCritiqueStep,
} from './agent-runtime/soft-signals';
import { microCompact } from './agent-context';
import { reviewGeneratedTutorial, type ReviewGenerationInput } from '../review/generation-quality-review';
import { createAgentRunLogger } from './agent-run-logger';

// Re-export shared types so the service layer can use the same error types
export {
  GenerationCancelledError,
  MultiPhaseGenerationError,
  type CancelToken,
  type MultiPhaseLifecycleHooks,
  type MultiPhaseStream,
  type MultiPhaseResult,
};
export type {
  AgentLoopMetrics,
  RepairRecord,
  StepOutcome,
  StepValidationResult,
} from './agent-runtime/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_TURN_BUDGET = 40;
const TURN_REPAIR_BUFFER_RATIO = 0.35;
const TURN_FIXED_BUFFER = 4;
const MAX_REPAIRS_PER_STEP = 3;
const MAX_REPLANS = 2;

export function computeAgentLoopMaxTurns(totalSteps: number) {
  const normalizedTotalSteps = Number.isFinite(totalSteps)
    ? Math.max(0, Math.ceil(totalSteps))
    : 0;

  return Math.max(
    MIN_TURN_BUDGET,
    normalizedTotalSteps +
      Math.ceil(normalizedTotalSteps * TURN_REPAIR_BUFFER_RATIO) +
      MAX_REPLANS * 2 +
      TURN_FIXED_BUFFER,
  );
}

// ---------------------------------------------------------------------------
// Timing accumulator for bottleneck diagnosis
// ---------------------------------------------------------------------------

interface PhaseTiming {
  label: string;
  startMs: number;
  endMs: number;
  breakdown: {
    promptBuild: number;
    llmCall: number;
    validation: number;
    snapshot: number;
    dbPersist: number;
    contextDistill: number;
    critique: number;
    other: number;
  };
}

interface StepTiming {
  stepIndex: number;
  isRepair: boolean;
  totalMs: number;
  promptBuildMs: number;
  llmCallMs: number;
  validationMs: number;
  snapshotMs: number;
  persistMs: number;
  distillMs: number;
  critiqueMs: number;
}

class GenerationTimer {
  private phaseTimings: PhaseTiming[] = [];
  private stepTimings: StepTiming[] = [];
  private overallStart = Date.now();

  startPhase(label: string): number {
    return Date.now();
  }

  recordStep(t: StepTiming) {
    this.stepTimings.push(t);
  }

  recordPhase(label: string, startMs: number, breakdown: PhaseTiming['breakdown']) {
    this.phaseTimings.push({ label, startMs, endMs: Date.now(), breakdown });
  }

  printSummary() {
    const totalMs = Date.now() - this.overallStart;
    const lines: string[] = [
      '',
      `[agent-timing] ========== GENERATION TIMING SUMMARY ==========`,
      `[agent-timing] Total wall time: ${totalMs.toLocaleString()}ms`,
    ];

    // Per-step breakdown
    const stepRows = this.stepTimings.map(s => {
      const otherMs = s.totalMs - s.promptBuildMs - s.llmCallMs - s.validationMs - s.snapshotMs - s.persistMs - s.distillMs - s.critiqueMs;
      const label = s.isRepair ? `${s.stepIndex + 1}/repair` : `${s.stepIndex + 1}`;
      return {
        label,
        total: s.totalMs,
        prompt: s.promptBuildMs,
        llm: s.llmCallMs,
        validation: s.validationMs,
        snapshot: s.snapshotMs,
        persist: s.persistMs,
        distill: s.distillMs,
        critique: s.critiqueMs,
        other: Math.max(0, otherMs),
      };
    });

    // Aggregate categories
    let sumPrompt = 0, sumLlm = 0, sumValidation = 0, sumSnapshot = 0, sumPersist = 0, sumDistill = 0, sumCritique = 0, sumOther = 0;
    for (const r of stepRows) {
      sumPrompt += r.prompt;
      sumLlm += r.llm;
      sumValidation += r.validation;
      sumSnapshot += r.snapshot;
      sumPersist += r.persist;
      sumDistill += r.distill;
      sumCritique += r.critique;
      sumOther += r.other;
    }

    // Phase timings
    for (const p of this.phaseTimings) {
      const dur = p.endMs - p.startMs;
      lines.push(`[agent-timing] Phase ${p.label}: ${dur.toLocaleString()}ms (${(dur / totalMs * 100).toFixed(1)}%)`);
    }

    // Per-step table (only if > 0 steps)
    if (stepRows.length > 0) {
      lines.push(`[agent-timing] --- Per-step breakdown (ms) ---`);
      lines.push(`[agent-timing] ${'Step'.padEnd(8)} ${'Total'.padStart(7)} ${'Prompt'.padStart(7)} ${'LLM'.padStart(7)} ${'Valid'.padStart(7)} ${'Snap'.padStart(7)} ${'DB'.padStart(7)} ${'Distill'.padStart(7)} ${'Critiq'.padStart(7)} ${'Other'.padStart(7)}`);
      for (const r of stepRows) {
        lines.push(`[agent-timing] ${r.label.padEnd(8)} ${r.total.toLocaleString().padStart(7)} ${r.prompt.toLocaleString().padStart(7)} ${r.llm.toLocaleString().padStart(7)} ${r.validation.toLocaleString().padStart(7)} ${r.snapshot.toLocaleString().padStart(7)} ${r.persist.toLocaleString().padStart(7)} ${r.distill.toLocaleString().padStart(7)} ${r.critique.toLocaleString().padStart(7)} ${r.other.toLocaleString().padStart(7)}`);
      }
      lines.push(`[agent-timing] ${'SUM'.padEnd(8)} ${(sumPrompt + sumLlm + sumValidation + sumSnapshot + sumPersist + sumDistill + sumCritique + sumOther).toLocaleString().padStart(7)} ${sumPrompt.toLocaleString().padStart(7)} ${sumLlm.toLocaleString().padStart(7)} ${sumValidation.toLocaleString().padStart(7)} ${sumSnapshot.toLocaleString().padStart(7)} ${sumPersist.toLocaleString().padStart(7)} ${sumDistill.toLocaleString().padStart(7)} ${sumCritique.toLocaleString().padStart(7)} ${sumOther.toLocaleString().padStart(7)}`);
      lines.push(`[agent-timing] ${'PCT'.padEnd(8)} ${'100%'.padStart(7)} ${(sumPrompt / totalMs * 100).toFixed(1).padStart(7)}% ${(sumLlm / totalMs * 100).toFixed(1).padStart(7)}% ${(sumValidation / totalMs * 100).toFixed(1).padStart(7)}% ${(sumSnapshot / totalMs * 100).toFixed(1).padStart(7)}% ${(sumPersist / totalMs * 100).toFixed(1).padStart(7)}% ${(sumDistill / totalMs * 100).toFixed(1).padStart(7)}% ${(sumCritique / totalMs * 100).toFixed(1).padStart(7)}% ${(sumOther / totalMs * 100).toFixed(1).padStart(7)}%`);
    }

    lines.push(`[agent-timing] ================================================`);
    console.log(lines.join('\n'));
  }
}

interface AgentLoopState {
  turnCount: number;
  replanCount: number;
  outcomes: StepOutcome[];
}

export interface AgentGenerationOptions extends MultiPhaseGenerationOptions {
  resume?: AgentResumeState;
  trace?: {
    jobId?: string;
    draftId?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function formatStepFailureMessage(
  stepNumber: number,
  maxAttempts: number,
  lastError: string | null,
  revisedOutline: boolean,
) {
  if (lastError?.startsWith('Turn budget exhausted')) {
    return `Step ${stepNumber} could not start: ${lastError}`;
  }

  return `Step ${stepNumber} failed after ${maxAttempts} attempts${revisedOutline ? ' and outline revision' : ''}: ${lastError ?? 'unknown error'}`;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Creates an agent generation stream with per-step immediate validation.
 *
 * Returns both the SSE stream (for real-time frontend progress) and
 * a result promise (for the service layer to persist after completion).
 */
export function createAgentGenerationStream(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  modelId?: string,
  cancelToken?: CancelToken,
  lifecycleHooks: MultiPhaseLifecycleHooks = {},
  checkDbCancel?: () => Promise<boolean>,
  options: AgentGenerationOptions = {},
): MultiPhaseStream {
  const encoder = new TextEncoder();
  const model = createProvider(modelId);
  const logger = createAgentRunLogger({
    jobId: options.trace?.jobId,
    draftId: options.trace?.draftId,
    modelId: modelId ?? '(default)',
  });
  const executionMode = options.mode ?? 'full';
  const resumeState = executionMode === 'full' ? options.resume ?? null : null;

  let resolveResult: (value: MultiPhaseResult) => void;
  let rejectResult: (reason: any) => void;
  const resultPromise = new Promise<MultiPhaseResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  let resolveOutline: (value: TutorialOutline) => void;
  const outlineReadyPromise = new Promise<TutorialOutline>((resolve) => {
    resolveOutline = resolve;
  });

  /**
   * Check both in-memory cancelToken and DB cancelRequested flag.
   */
  async function isCancelRequested(): Promise<boolean> {
    if (cancelToken?.value) return true;
    if (checkDbCancel) {
      try {
        return await checkDbCancel();
      } catch {
        return false;
      }
    }
    return false;
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let currentPhase: MultiPhaseLifecyclePhase = 'outline';
      let currentStepIndex: number | null = null;
      const genTimer = new GenerationTimer();

      try {
        // ── Capability detection ──
        const modelSupportsRetrieval = await supportsRetrievalGeneration(modelId ?? '');
        const useNativeStructuredOutput = supportsNativeStructuredOutput(modelId);
        const stepBudget = recommendStepBudget(sourceItems, teachingBrief);

        const totalSourceTokens = estimateTokens(sourceItems.map(s => s.content).join('\n'));
        const isLargeRepo =
          sourceItems.length > 30 ||
          totalSourceTokens > getMaxInputTokens(modelId ?? '') * 0.6;

        logger.logEvent('init', { modelId: modelId ?? '(default)', modelSupportsRetrieval, isLargeRepo, sourceFileCount: sourceItems.length, totalSourceTokens, recommendedSteps: stepBudget.recommended });
        console.log('[agent-loop] Generation params:', {
          modelId: modelId ?? '(default)',
          modelSupportsRetrieval,
          isLargeRepo,
          sourceFileCount: sourceItems.length,
          totalSourceTokens,
          recommendedSteps: stepBudget.recommended,
          stepRange: `${stepBudget.min}-${stepBudget.max}`,
          maxInputTokens: getMaxInputTokens(modelId ?? ''),
          threshold60pct: Math.round(getMaxInputTokens(modelId ?? '') * 0.6),
          maxOutputTokens: getMaxOutputTokens(modelId),
        });

        if (isLargeRepo && !modelSupportsRetrieval) {
          throw new RetrievalModelRequiredError({
            modelId: modelId ?? 'unknown',
            fileCount: sourceItems.length,
            estimatedTokens: totalSourceTokens,
          });
        }

        // ── Phase 1: Generate Outline (identical to multi-phase-generator) ──
        currentPhase = 'outline';
        currentStepIndex = null;
        const outlinePhaseStart = Date.now();
        let outlinePromptBuildMs = 0;
        let outlineLlmMs = 0;
        let outlineValidationMs = 0;

        controller.enqueue(encoder.encode(
          sseEvent('phase', { phase: 'outline', status: 'started' })
        ));
        await lifecycleHooks.onPhase?.({ phase: 'outline' });

        let outline: TutorialOutline;
        try {
          const outlineResult = await resolveInitialOutline({
            model,
            modelId,
            sourceItems,
            teachingBrief,
            modelSupportsRetrieval,
            useNativeStructuredOutput,
            resumeOutline: resumeState?.outline ?? null,
            initialOutline: options.initialOutline ?? null,
            logger,
          });
          outline = outlineResult.outline;
          if (outlineResult.source === 'resume' && resumeState) {
            console.log(
              `[agent-loop] Resuming from committed checkpoint at step ${resumeState.startStepIndex} of ${resumeState.outline.steps.length}`,
            );
          }
          outlinePromptBuildMs = outlineResult.timing.promptBuildMs;
          outlineLlmMs = outlineResult.timing.llmCallMs;
          outlineValidationMs = outlineResult.timing.validationMs;

          controller.enqueue(encoder.encode(sseEvent('outline', outline)));
          await lifecycleHooks.onOutlineReady?.(outline);
          resolveOutline!(outline);
          logger.logEvent('outline-complete', { stepCount: outline.steps.length, title: outline.meta.title });

          const outlineTotalMs = Date.now() - outlinePhaseStart;
          console.log('[agent-timing] Outline phase:', outlineTotalMs, 'ms (prompt:', outlinePromptBuildMs, 'llm:', outlineLlmMs, 'validate:', outlineValidationMs, 'other:', outlineTotalMs - outlinePromptBuildMs - outlineLlmMs - outlineValidationMs, ')');
          genTimer.recordStep({ stepIndex: -1, isRepair: false, totalMs: outlineTotalMs, promptBuildMs: outlinePromptBuildMs, llmCallMs: outlineLlmMs, validationMs: outlineValidationMs, snapshotMs: 0, persistMs: 0, distillMs: 0, critiqueMs: 0 });
        } catch (outlineErr: any) {
          const causeChain: string[] = [];
          let cursor: any = outlineErr;
          while (cursor) {
            if (cursor.message) causeChain.push(cursor.message);
            if (cursor.cause) { cursor = cursor.cause; } else { break; }
          }
          const fullCause = causeChain.join(' | ');
          console.error('[agent-loop] Outline generation failed:', outlineErr.message, '\nCause chain:', fullCause);
          console.error('[agent-loop] Outline error details:', {
            errorClass: outlineErr.constructor?.name,
            errorMessage: outlineErr.message,
            errorString: String(outlineErr),
            causeType: outlineErr.cause?.constructor?.name,
            causeMessage: outlineErr.cause?.message,
            causeString: outlineErr.cause ? String(outlineErr.cause) : undefined,
            stackPreview: outlineErr.stack?.split('\n').slice(0, 5).join('\n'),
          });
          if (outlineErr.cause?.issues) {
            console.error('[agent-loop] Zod issues:', JSON.stringify(outlineErr.cause.issues, null, 2));
          }
          controller.enqueue(encoder.encode(
            sseEvent('error', { phase: 'outline', message: outlineErr.message, cause: fullCause })
          ));
          controller.close();
          rejectResult(new MultiPhaseGenerationError('outline', outlineErr));
          return;
        }

        if (executionMode === 'outline_only') {
          controller.enqueue(encoder.encode(
            sseEvent('done', { success: true, mode: 'outline_only' })
          ));
          resolveResult({
            draft: null,
            outline,
            retryCount: 0,
          });
          controller.close();
          return;
        }

        // ── Phase 2: Step-by-step fill with agent loop ──
        if (await isCancelRequested()) {
          controller.enqueue(encoder.encode(
            sseEvent('error', { message: 'Generation cancelled' })
          ));
          controller.close();
          rejectResult(
            new MultiPhaseGenerationError('step_fill', new GenerationCancelledError())
          );
          return;
        }

        let totalSteps = outline.steps.length;
        let maxTurns = computeAgentLoopMaxTurns(totalSteps);
        logger.logEvent('turn-budget', { totalSteps, maxTurns });
        const resumedDraft = resumeState?.partialDraft ?? null;
        const resumeStartStepIndex = resumeState?.startStepIndex ?? 0;
        const filledSteps: TutorialStep[] = resumedDraft
          ? [...resumedDraft.steps.slice(0, resumeStartStepIndex)]
          : [];
        let totalRetries = resumeState?.agentState.retryCount ?? 0;

        // Normalize baseCode to multi-file representation
        const baseSnapshot = resumedDraft ?? outline;
        const { primaryFile } = normalizeBaseCode(
          baseSnapshot.baseCode,
          baseSnapshot.meta,
        );
        const generationBase = prepareGenerationBaseFiles(outline, sourceItems);
        const initialFiles = resumedDraft
          ? normalizeBaseCode(resumedDraft.baseCode, resumedDraft.meta).files
          : generationBase.files;
        const insertedProgressiveFiles = generationBase.insertedFiles;

        // Snapshot cache
        const snapshots: Map<number, Record<string, string>> = new Map();
        snapshots.set(-1, initialFiles);
        for (let stepIndex = 0; stepIndex < filledSteps.length; stepIndex++) {
          const previousFiles = snapshots.get(stepIndex - 1)!;
          const step = filledSteps[stepIndex];
          snapshots.set(
            stepIndex,
            step.patches?.length
              ? applyContentPatches(previousFiles, step.patches, primaryFile)
              : previousFiles,
          );
        }

        // Agent loop state
        const loopState: AgentLoopState = {
          turnCount: 0,
          replanCount: resumeState?.agentState.replanCount ?? 0,
          outcomes: [],
        };
        const contextManager = createAgentContextManager({
          modelId,
          initialCompressionCount:
            resumeState?.agentState.compressionCount ?? 0,
        });
        const softSignalCollector = createSoftSignalCollector();

        // Consecutive repair failure counter for reviseOutline trigger
        let consecutiveRepairFailures =
          resumeState?.agentState.driftSignals.consecutiveRepairFailures ?? 0;

        // -----------------------------------------------------------------
        // reviseOutline: revise the outline from a given step onward when
        // consecutive repairs fail, indicating the outline is flawed.
        // -----------------------------------------------------------------
        async function reviseOutline(
          fromStepIndex: number,
          failureReason: string,
        ): Promise<TutorialOutline | null> {
          return reviseOutlineTail({
            model,
            modelId,
            outline,
            fromStepIndex,
            completedStepsSummary: microCompact(filledSteps, filledSteps.length),
            previousFiles: snapshots.get(fromStepIndex - 1) ?? {},
            teachingBrief,
            sourceItems,
            failureReason,
            logger,
          });
        }

        // -----------------------------------------------------------------
        // critiqueSteps: evaluate teaching coherence every 4 steps.
        // Uses reviewGeneratedTutorial for assessment. Observability-only,
        // does not alter generation flow.
        // -----------------------------------------------------------------
        function recordSoftSignal(signal: Parameters<typeof softSignalCollector.record>[0]) {
          softSignalCollector.record(signal);
          logger.logEvent('soft-signal', {
            kind: signal.kind,
            code: signal.code,
            level: signal.level,
            stepIndex: signal.stepIndex,
            ...signal.details,
          });
          const log = signal.level === 'warn' ? console.warn : console.log;
          log(`[agent-loop] ${signal.message}`);
        }

        function critiqueSteps(currentStepIndex: number): void {
          if (!shouldCritiqueStep(currentStepIndex, filledSteps.length)) return;

          try {
            const partialDraft = ensureDraftChapters({
              meta: outline.meta,
              intro: outline.intro,
              baseCode: outline.baseCode,
              chapters: outline.chapters,
              steps: filledSteps,
            });

            const reviewInput: ReviewGenerationInput = {
              tutorialDraft: partialDraft,
              sourceItems,
              teachingBrief,
              outline,
              validationValid: true,
              validationErrors: [],
              agentMetrics: {
                repairCount: contextManager.getRepairHistory().length,
                firstPassRate:
                  loopState.outcomes.length > 0
                    ? Math.round(
                        (
                          loopState.outcomes.filter((outcome) => outcome.result === 'pass')
                            .length /
                          loopState.outcomes.length
                        ) * 100,
                      ) / 100
                    : 1,
                degradedStepCount: loopState.outcomes.filter(
                  (outcome) => outcome.result === 'replanned',
                ).length,
                compressionCount: contextManager.getCompressionCount(),
                replanCount: loopState.replanCount,
                avgRepairAttempts:
                  contextManager.getRepairHistory().length > 0
                    ? Math.round(
                        (
                          contextManager
                            .getRepairHistory()
                            .reduce((sum, record) => sum + record.attempts, 0) /
                          contextManager.getRepairHistory().length
                        ) * 100,
                      ) / 100
                    : 0,
              },
            };

            const report = reviewGeneratedTutorial(reviewInput);
            for (const signal of buildCritiqueSignals(currentStepIndex, report)) {
              recordSoftSignal(signal);
            }
          } catch (err) {
            console.error('[agent-loop] critiqueSteps failed:', err);
          }
        }

        for (let i = resumeStartStepIndex; i < totalSteps; i++) {
          currentPhase = 'step_fill';
          currentStepIndex = i;
          const stepStartMs = Date.now();
          let stepPromptBuildMs = 0;
          let stepLlmMs = 0;
          let stepValidationMs = 0;
          let stepSnapshotMs = 0;
          let stepPersistMs = 0;
          let stepDistillMs = 0;
          let stepCritiqueMs = 0;
          let stepIsRepair = false;

          // Check cancellation at the top of each iteration
          if (await isCancelRequested()) {
            controller.enqueue(encoder.encode(
              sseEvent('error', { message: 'Generation cancelled' })
            ));
            controller.close();
            rejectResult(
              new MultiPhaseGenerationError('step_fill', new GenerationCancelledError(), i)
            );
            return;
          }

          // Drift detection: warn if consecutive degraded steps detected
          const drift = contextManager.detectDrift();
          if (drift.drifting) {
            console.warn(`[agent-loop] Drift detected: ${drift.consecutiveDegraded} consecutive degraded steps`);
            // For Plan 02: log the warning. Plan 03 will integrate reviseOutline here.
          }

          controller.enqueue(encoder.encode(
            sseEvent('phase', { phase: 'step-fill', stepIndex: i, totalSteps })
          ));
          await lifecycleHooks.onPhase?.({
            phase: 'step_fill',
            stepIndex: i,
            totalSteps,
            retryCount: totalRetries,
          });

          const previousFiles = snapshots.get(i - 1)!;

          // Step-fill with repair loop
          let stepResult: TutorialStep | null = null;
          let lastError: string | null = null;
          let forceReplan = false;
          let forceReplanReason: string | null = null;
          const emitRuntimeEvent = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(sseEvent(event, data)));
          };

          const stepExecution = await executeStep({
            stepIndex: i,
            totalSteps,
            outline,
            sourceItems,
            teachingBrief,
            previousFiles,
            primaryFile,
            model,
            modelId,
            modelSupportsRetrieval,
            useNativeStructuredOutput,
            distilledContext: contextManager.getDistilledContext(),
            totalRetries,
            currentTurnCount: loopState.turnCount,
            maxTurns,
            maxRepairsPerStep: MAX_REPAIRS_PER_STEP,
            lifecycleHooks,
            emitEvent: emitRuntimeEvent,
            logger,
          });

          loopState.turnCount += stepExecution.turnsConsumed;
          totalRetries = stepExecution.retryCount;
          stepPromptBuildMs += stepExecution.timings.promptBuildMs;
          stepLlmMs += stepExecution.timings.llmCallMs;
          stepValidationMs += stepExecution.timings.validationMs;
          stepIsRepair = stepExecution.usedRepairPrompt;
          lastError = stepExecution.lastError;
          for (const repairRecord of stepExecution.repairHistory) {
            contextManager.recordRepair(repairRecord);
          }

          if (stepExecution.status === 'committed') {
            stepResult = stepExecution.step;
            loopState.outcomes.push(stepExecution.outcome);
            contextManager.recordStepOutcome(stepExecution.outcome);
            consecutiveRepairFailures = 0;
          } else {
            forceReplan = stepExecution.forceReplan;
            forceReplanReason = stepExecution.forceReplanReason;
          }

          if (!stepResult) {
            if (forceReplan) {
              consecutiveRepairFailures = Math.max(consecutiveRepairFailures, 1);
            } else {
              consecutiveRepairFailures++;
            }

            const shouldAttemptReplan = shouldReviseTail({
              consecutiveRepairFailures,
              replanCount: loopState.replanCount,
              maxReplans: MAX_REPLANS,
              immediate: forceReplan,
            });

            if (shouldAttemptReplan) {
              const replanReason = forceReplanReason ?? `${consecutiveRepairFailures} consecutive repair failures`;
              console.warn(`[agent-loop] triggering reviseOutline from step ${i}: ${replanReason}`);
              controller.enqueue(encoder.encode(
                sseEvent('replan', { fromStepIndex: i, reason: replanReason, revisedStepCount: 0 })
              ));
              loopState.replanCount++;
              await lifecycleHooks.onAction?.({
                action: 'replan',
                stepIndex: i,
                totalSteps,
                retryCount: totalRetries,
                errorMessage: replanReason,
                category: forceReplan ? 'unrecoverable' : 'repairable',
              });

              const revisedOutline = await reviseOutline(i, replanReason);
              if (revisedOutline) {
                outline = revisedOutline;
                totalSteps = outline.steps.length;
                maxTurns = Math.max(maxTurns, computeAgentLoopMaxTurns(totalSteps));
                await lifecycleHooks.onOutlineReady?.(outline);
                controller.enqueue(encoder.encode(
                  sseEvent('replan', { fromStepIndex: i, reason: 'outline revised', revisedStepCount: revisedOutline.steps.length - i })
                ));
                // Reset consecutive counter since outline changed
                consecutiveRepairFailures = 0;
                const postReplanExecution = await executeStep({
                  stepIndex: i,
                  totalSteps,
                  outline,
                  sourceItems,
                  teachingBrief,
                  previousFiles,
                  primaryFile,
                  model,
                  modelId,
                  modelSupportsRetrieval,
                  useNativeStructuredOutput,
                  totalRetries,
                  currentTurnCount: loopState.turnCount,
                  maxTurns,
                  maxRepairsPerStep: 1,
                  initialMode: 'post_replan',
                  lifecycleHooks,
                  emitEvent: emitRuntimeEvent,
                  logger,
                });

                loopState.turnCount += postReplanExecution.turnsConsumed;
                totalRetries = postReplanExecution.retryCount;
                stepPromptBuildMs += postReplanExecution.timings.promptBuildMs;
                stepLlmMs += postReplanExecution.timings.llmCallMs;
                stepValidationMs += postReplanExecution.timings.validationMs;
                stepIsRepair = stepIsRepair || postReplanExecution.usedRepairPrompt;
                lastError = postReplanExecution.lastError ?? lastError;
                for (const repairRecord of postReplanExecution.repairHistory) {
                  contextManager.recordRepair(repairRecord);
                }

                if (postReplanExecution.status === 'committed') {
                  stepResult = postReplanExecution.step;
                  const replannedOutcome: StepOutcome = {
                    ...postReplanExecution.outcome,
                    result: 'replanned',
                  };
                  loopState.outcomes.push(replannedOutcome);
                  contextManager.recordStepOutcome(replannedOutcome);
                }
              }
            }

            if (!stepResult) {
              if (loopState.replanCount >= MAX_REPLANS) {
                console.error(
                  `[agent-loop] Step ${i + 1} failed after ${MAX_REPLANS} replans; aborting run`,
                );
              }
              if (shouldAcceptDegradedStep()) {
                throw new Error(
                  'shouldAcceptDegradedStep unexpectedly returned true without degraded-step commit support',
                );
              }
              throw new MultiPhaseGenerationError(
                'step_fill',
                new Error(
                  formatStepFailureMessage(
                    i + 1,
                    MAX_REPAIRS_PER_STEP,
                    lastError,
                    consecutiveRepairFailures >= 2,
                  ),
                ),
                i,
              );
            }
          }

          // Enrich step with outline metadata
          stepResult.teachingGoal = outline.steps[i].teachingGoal;
          stepResult.conceptIntroduced = outline.steps[i].conceptIntroduced;

          filledSteps.push(stepResult);
          controller.enqueue(encoder.encode(
            sseEvent('step', { stepIndex: i, step: stepResult })
          ));
          await lifecycleHooks.onStepCompleted?.({
            stepIndex: i,
            totalSteps,
            retryCount: totalRetries,
            result:
              loopState.outcomes[loopState.outcomes.length - 1]?.result ?? 'pass',
          });
          const _persistStart = Date.now();
          await lifecycleHooks.onStepFilled?.(i, stepResult, [...filledSteps]);
          stepPersistMs = Date.now() - _persistStart;

          // Update snapshot cache
          const _snapStart = Date.now();
          if (stepResult.patches && stepResult.patches.length > 0) {
            const newFiles = applyContentPatches(previousFiles, stepResult.patches, primaryFile);
            snapshots.set(i, newFiles);
          } else {
            snapshots.set(i, previousFiles);
          }
          stepSnapshotMs = Date.now() - _snapStart;
          const currentFiles = snapshots.get(i)!;

          // Critique teaching coherence every 4 steps
          const _critiqueStart = Date.now();
          critiqueSteps(i);
          stepCritiqueMs = Date.now() - _critiqueStart;

          const locSignal = buildLocWarningSignal({
            stepIndex: i,
            step: stepResult,
            estimatedLocChange: outline.steps[i]?.estimatedLocChange ?? null,
          });
          if (locSignal) {
            recordSoftSignal(locSignal);
          }

          // ── Context distillation (Plan 02) ──

          const _distillStart = Date.now();
          const compressionResult = await contextManager.maybeCompress({
            filledSteps,
            currentCode: currentFiles,
            outline,
            currentStepIndex: i + 1,
            teachingBrief,
            sourceItems,
            replanRemainingOutline: () =>
              replanRemainingOutline({
                model,
                modelId,
                outline,
                currentStepIndex: i + 1,
                completedStepsSummary: microCompact(
                  filledSteps,
                  filledSteps.length,
                ),
                currentCode: currentFiles,
                teachingBrief,
                sourceItems,
                logger,
              }),
            onBeforeAction: async (event) => {
              logger.logEvent('compression', {
                type: event.mode,
                stepIndex: i,
                tokenUsage: contextManager.getTokenUsage(),
              });
              await lifecycleHooks.onAction?.({
                action: 'compress',
                stepIndex: i,
                totalSteps,
                retryCount: totalRetries,
              });
              controller.enqueue(encoder.encode(
                sseEvent('compress', {
                  type: event.mode,
                  tokensBefore: event.tokensBefore,
                  tokensAfter: 0,
                }),
              ));
            },
          });

          if (compressionResult.action === 'summary') {
            console.log(
              `[agent-loop] Auto-summarize compressed context: saved ~${compressionResult.tokensBefore - compressionResult.tokensAfter} tokens`,
            );
            controller.enqueue(encoder.encode(
              sseEvent('compress', {
                type: 'summary',
                tokensBefore: compressionResult.tokensBefore,
                tokensAfter: compressionResult.tokensAfter,
              })
            ));
          } else if (
            compressionResult.action === 'replan' &&
            compressionResult.outline
          ) {
            outline = compressionResult.outline;
            totalSteps = outline.steps.length;
            maxTurns = Math.max(maxTurns, computeAgentLoopMaxTurns(totalSteps));
            loopState.replanCount++;
            await lifecycleHooks.onOutlineReady?.(outline);
            await lifecycleHooks.onAction?.({
              action: 'replan',
              stepIndex: i,
              totalSteps,
              retryCount: totalRetries,
            });
            console.log(
              `[agent-loop] Full-replan regenerated outline from step ${i + 2}`,
            );
            controller.enqueue(encoder.encode(
              sseEvent('compress', {
                type: 'replan',
                tokensBefore: compressionResult.tokensBefore,
                tokensAfter: compressionResult.tokensAfter,
              })
            ));
          } else if (compressionResult.error) {
            const failureLabel =
              compressionResult.attemptedAction === 'summary'
                ? 'Auto-summarize'
                : 'Full-replan';
            console.error(`[agent-loop] ${failureLabel} failed:`, compressionResult.error);
          }

          stepDistillMs = Date.now() - _distillStart;

          // Record step timing
          const stepTotalMs = Date.now() - stepStartMs;
          genTimer.recordStep({
            stepIndex: i,
            isRepair: stepIsRepair,
            totalMs: stepTotalMs,
            promptBuildMs: stepPromptBuildMs,
            llmCallMs: stepLlmMs,
            validationMs: stepValidationMs,
            snapshotMs: stepSnapshotMs,
            persistMs: stepPersistMs,
            distillMs: stepDistillMs,
            critiqueMs: stepCritiqueMs,
          });
          console.log(`[agent-timing] Step ${i + 1}${stepIsRepair ? '/repair' : ''}: ${stepTotalMs}ms (prompt:${stepPromptBuildMs} llm:${stepLlmMs} valid:${stepValidationMs} snap:${stepSnapshotMs} db:${stepPersistMs} distill:${stepDistillMs} critique:${stepCritiqueMs})`);

          // Check for cancellation between steps
          if (await isCancelRequested()) {
            controller.enqueue(encoder.encode(
              sseEvent('error', { message: 'Generation cancelled' })
            ));
            controller.close();
            rejectResult(
              new MultiPhaseGenerationError('step_fill', new GenerationCancelledError(), i)
            );
            return;
          }
        }

        // ── Assemble final draft ──
        const draft: TutorialDraft = ensureDraftChapters({
          meta: outline.meta,
          intro: outline.intro,
          baseCode: materializeBaseCodeForFilledSteps(
            outline,
            sourceItems,
            filledSteps,
            insertedProgressiveFiles,
          ),
          chapters: outline.chapters,
          steps: filledSteps,
        });

        // ── Phase 3: Validate ──
        const validatePhaseStart = Date.now();
        currentPhase = 'validate';
        currentStepIndex = null;
        controller.enqueue(encoder.encode(
          sseEvent('phase', { phase: 'validate', status: 'started' })
        ));
        await lifecycleHooks.onPhase?.({
          phase: 'validate',
          stepIndex: null,
          totalSteps,
          retryCount: totalRetries,
        });

        let validationErrors: string[] = [];
        let validationResult: Awaited<ReturnType<typeof validateTutorialDraft>> | null = null;
        try {
          validationResult = await validateTutorialDraft(draft);
          validationErrors = validationResult.valid ? [] : validationResult.errors;
        } catch (valErr: any) {
          validationErrors = [valErr.message || String(valErr)];
        }

        const validateTotalMs = Date.now() - validatePhaseStart;
        console.log('[agent-timing] Validate phase:', validateTotalMs, 'ms');

        controller.enqueue(encoder.encode(
          sseEvent('validation', { valid: validationErrors.length === 0, errors: validationErrors })
        ));

        if (validationResult && !validationResult.valid) {
          throw new TutorialDraftValidationError(validationResult);
        }
        if (validationErrors.length > 0) {
          throw new Error(validationErrors.join('; '));
        }

        controller.enqueue(encoder.encode(
          sseEvent('done', { success: true })
        ));

        const agentMetrics: AgentLoopMetrics = {
          outcomes: loopState.outcomes,
          repairHistory: contextManager.getRepairHistory(),
          replanCount: loopState.replanCount,
          compressionCount: contextManager.getCompressionCount(),
          softSignals: softSignalCollector.list(),
        };
        logger.logEvent('done', {
          totalSteps: filledSteps.length,
          totalRetries,
          replanCount: agentMetrics.replanCount,
          compressionCount: agentMetrics.compressionCount,
          outcomeSummary: loopState.outcomes.map((o) => `${o.stepIndex}:${o.result}`),
        });

        genTimer.printSummary();

        resolveResult({
          draft,
          outline,
          retryCount: totalRetries,
          agentMetrics,
        });

        controller.close();
      } catch (err: any) {
        const errorEvent =
          err instanceof MultiPhaseGenerationError
            ? {
                phase: err.phase === 'step_fill' ? 'step-fill' : err.phase,
                stepIndex: err.stepIndex,
                message: err.message || String(err),
              }
            : err instanceof GenerationCancelledError
              ? {
                  phase: currentPhase === 'step_fill' ? 'step-fill' : currentPhase,
                  stepIndex: currentStepIndex,
                  message: err.message || String(err),
                }
              : {
                  phase: currentPhase === 'step_fill' ? 'step-fill' : currentPhase,
                  stepIndex: currentStepIndex,
                  message: err.message || String(err),
                };
        controller.enqueue(encoder.encode(
          sseEvent('error', errorEvent)
        ));
        controller.close();
        rejectResult(
          err instanceof MultiPhaseGenerationError || err instanceof GenerationCancelledError
            ? err
            : new MultiPhaseGenerationError(currentPhase, err, currentStepIndex)
        );
      }
    },
  });

  return { stream, result: resultPromise, outlineReady: outlineReadyPromise };
}
