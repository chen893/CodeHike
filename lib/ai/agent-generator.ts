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
 *   - Agent loop respects maxTurns=30, maxRepairsPerStep=3, maxReplans=2
 */

import { generateText, Output, stepCountIs } from 'ai';
import { tutorialOutlineSchema } from '../schemas/tutorial-outline';
import { legacyTutorialStepSchema, type TutorialStep, type TutorialDraft, type ContentPatch } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import { buildOutlinePrompt, buildRetrievalOutlinePrompt } from './outline-prompt';
import { buildStepFillPrompt, buildRetrievalStepFillPrompt, buildCurrentSnapshotSummary, buildRepairPrompt } from './step-fill-prompt';
import { adaptPromptForModel } from './prompt-adapters';
import { applyContentPatches } from '../tutorial/draft-code';
import { normalizeBaseCode, normalizeTutorialMeta } from '../tutorial/normalize';
import { ensureDraftChapters, DEFAULT_CHAPTER_ID } from '../tutorial/chapters';
import { validateTutorialDraft } from '../utils/validation';
import { PatchValidationError } from '../errors/error-types';
import { createProvider, getMaxOutputTokens } from './provider-registry';
import { parseJsonFromText } from './parse-json-text';
import { tryAutoFixPatches } from './patch-auto-fix';
import {
  findProgressivePlaceholderTargets,
  materializeBaseCodeForFilledSteps,
  prepareGenerationBaseFiles,
} from './progressive-snapshot-base-code';
import { supportsRetrievalGeneration, RetrievalModelRequiredError, supportsNativeStructuredOutput } from './model-capabilities';
import { createSourceTools, createScopedSourceTools, buildDirectorySummary } from './source-tools';
import { createTokenBudgetSession, estimateTokens, getMaxInputTokens } from './token-budget';
import { validateOutlineSourceScope, deriveStepSourceScope } from './outline-source-scope';
import { recommendStepBudget } from './step-budget';
import {
  GenerationCancelledError,
  MultiPhaseGenerationError,
  type CancelToken,
  type MultiPhaseLifecycleHooks,
  type MultiPhaseStream,
  type MultiPhaseResult,
  type MultiPhaseLifecyclePhase,
} from './multi-phase-generator';

// Re-export shared types so the service layer can use the same error types
export {
  GenerationCancelledError,
  MultiPhaseGenerationError,
  type CancelToken,
  type MultiPhaseLifecycleHooks,
  type MultiPhaseStream,
  type MultiPhaseResult,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TURNS = 30;
const MAX_REPAIRS_PER_STEP = 3;
const MAX_REPLANS = 2;
const LOC_WARNING_FLOOR = 60;
const LOC_DEFAULT_BUDGET = 8;
const STEP_FILL_TOOLS_ENABLED = process.env.VIBEDOCS_STEP_FILL_TOOLS === '1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface AgentLoopState {
  turnCount: number;
  repairHistory: RepairRecord[];
  replanCount: number;
  tokenUsage: { used: number; budget: number };
  outcomes: StepOutcome[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function getStepPatchFiles(step: TutorialStep, primaryFile: string) {
  return unique(
    (step.patches ?? [])
      .map((patch) => patch.file ?? primaryFile)
      .filter((value): value is string => Boolean(value)),
  );
}

function validateRetrievalStepTargets(
  step: TutorialStep,
  primaryFile: string,
  stepScope: { targetFiles: string[]; contextFiles: string[] },
  previousFiles: Record<string, string>,
) {
  if (stepScope.targetFiles.length === 0) return;

  const patchFiles = getStepPatchFiles(step, primaryFile);
  if (patchFiles.length === 0) {
    throw new Error(
      `Step must include at least one patch for targetFiles: ${stepScope.targetFiles.join(', ')}`,
    );
  }

  if (!patchFiles.some((file) => stepScope.targetFiles.includes(file))) {
    throw new Error(
      `Step patches must target one of the outline targetFiles: ${stepScope.targetFiles.join(', ')}`,
    );
  }

  const placeholderTargets = findProgressivePlaceholderTargets(previousFiles, stepScope.targetFiles);
  if (
    placeholderTargets.length > 0 &&
    !patchFiles.some((file) => placeholderTargets.includes(file))
  ) {
    throw new Error(
      `Step must replace the placeholder target file instead of editing an earlier file: ${placeholderTargets.join(', ')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Per-step patch validation
// ---------------------------------------------------------------------------

function validateStepPatches(
  previousFiles: Record<string, string>,
  patches: ContentPatch[],
  primaryFile: string,
): StepValidationResult {
  try {
    const newFiles = applyContentPatches(previousFiles, patches, primaryFile);
    return {
      result: 'pass',
      errors: [],
      actualCode: previousFiles,
      appliedFiles: newFiles,
    };
  } catch (patchErr: any) {
    const errorMsg = patchErr instanceof Error ? patchErr.message : String(patchErr);

    // Try auto-fix
    const fixResult = tryAutoFixPatches(previousFiles, patches, primaryFile);
    if (fixResult.success) {
      try {
        const newFiles = applyContentPatches(previousFiles, fixResult.fixedPatches, primaryFile);
        return {
          result: 'pass',
          errors: [],
          actualCode: previousFiles,
          appliedFiles: newFiles,
          fixedPatches: fixResult.fixedPatches,
        };
      } catch {
        // Auto-fix produced patches that still fail -- fall through to repairable
      }
    }

    // Distinguish repairable vs unrecoverable based on error patterns
    const isUnrecoverable =
      errorMsg.includes('目标文件') ||
      errorMsg.includes('does not exist') ||
      errorMsg.includes('不在当前文件集');
    return {
      result: isUnrecoverable ? 'unrecoverable' : 'repairable',
      errors: [errorMsg],
      actualCode: previousFiles,
    };
  }
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
): MultiPhaseStream {
  const encoder = new TextEncoder();
  const model = createProvider(modelId);

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

      try {
        // ── Capability detection ──
        const modelSupportsRetrieval = await supportsRetrievalGeneration(modelId ?? '');
        const useNativeStructuredOutput = supportsNativeStructuredOutput(modelId);
        const stepBudget = recommendStepBudget(sourceItems, teachingBrief);

        const totalSourceTokens = estimateTokens(sourceItems.map(s => s.content).join('\n'));
        const isLargeRepo =
          sourceItems.length > 30 ||
          totalSourceTokens > getMaxInputTokens(modelId ?? '') * 0.6;

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
        controller.enqueue(encoder.encode(
          sseEvent('phase', { phase: 'outline', status: 'started' })
        ));
        await lifecycleHooks.onPhase?.({ phase: 'outline' });

        const OUTLINE_MAX_RETRIES = 3;

        let outline: TutorialOutline | undefined;
        try {
          if (modelSupportsRetrieval) {
            // Retrieval-based outline: directory tree + tools
            const directorySummary = buildDirectorySummary(sourceItems);
            const budget = createTokenBudgetSession({
              modelId: modelId ?? 'deepseek/deepseek-chat',
              basePrompt: directorySummary,
            });
            const sourceTools = createSourceTools(sourceItems, { budget });
            const { systemPrompt, userPrompt } = buildRetrievalOutlinePrompt(
              sourceItems, teachingBrief, directorySummary,
            );

            console.log('[agent-loop] Retrieval outline prompt sizes:', {
              systemPromptChars: systemPrompt.length,
              userPromptChars: userPrompt.length,
              systemPromptTokens: estimateTokens(systemPrompt),
              userPromptTokens: estimateTokens(userPrompt),
              budgetUsed: budget.usedInputTokens,
              budgetRemaining: budget.remainingInputTokens,
              budgetMax: budget.maxInputTokens,
            });

            let lastOutlineError: unknown = null;
            for (let attempt = 0; attempt < OUTLINE_MAX_RETRIES; attempt++) {
              try {
                console.log(`[agent-loop] Retrieval outline attempt ${attempt + 1}/${OUTLINE_MAX_RETRIES}`);
                const generateStart = Date.now();

                const result = await generateText({
                  model,
                  system: adaptPromptForModel(systemPrompt, modelId),
                  prompt: adaptPromptForModel(userPrompt, modelId),
                  tools: sourceTools,
                  stopWhen: stepCountIs(20),
                  maxOutputTokens: getMaxOutputTokens(modelId),
                });

                console.log('[agent-loop] generateText completed in', Date.now() - generateStart, 'ms, response length:', result.text?.length ?? 0);
                outline = parseJsonFromText(result.text, tutorialOutlineSchema, 'outline-retrieval');
                lastOutlineError = null;
                break;
              } catch (err: any) {
                lastOutlineError = err;
                const isConnectionError =
                  err?.message?.includes('terminated') ||
                  err?.message?.includes('other side closed') ||
                  err?.cause?.message?.includes('terminated');
                if (isConnectionError && attempt < OUTLINE_MAX_RETRIES - 1) {
                  console.warn(`[agent-loop] Outline attempt ${attempt + 1} failed with connection error, retrying...`, err.message);
                  continue;
                }
                throw err;
              }
            }
            if (lastOutlineError) throw lastOutlineError;
            if (!outline) throw new Error('Outline not generated — unreachable');

          } else {
            // Legacy full-injection outline
            const { systemPrompt, userPrompt } = buildOutlinePrompt(sourceItems, teachingBrief);

            console.log('[agent-loop] Legacy outline prompt sizes:', {
              systemPromptChars: systemPrompt.length,
              userPromptChars: userPrompt.length,
              systemPromptTokens: estimateTokens(systemPrompt),
              userPromptTokens: estimateTokens(userPrompt),
            });

            const generateStart = Date.now();
            const useStructuredOutput = useNativeStructuredOutput;
            const generateOpts: Parameters<typeof generateText>[0] = {
              model,
              system: adaptPromptForModel(systemPrompt, modelId),
              prompt: adaptPromptForModel(userPrompt, modelId),
              maxOutputTokens: getMaxOutputTokens(modelId),
            };
            if (useStructuredOutput) {
              generateOpts.output = Output.object({ schema: tutorialOutlineSchema });
            }
            const result = await generateText(generateOpts);
            console.log('[agent-loop] generateText completed in', Date.now() - generateStart, 'ms, response length:', result.text?.length ?? 0);

            if (useStructuredOutput && result.output) {
              outline = result.output as TutorialOutline;
            } else {
              outline = parseJsonFromText(result.text, tutorialOutlineSchema, 'outline-legacy');
            }
          }

          // Ensure meta.lang/fileName are populated from baseCode
          outline.meta = normalizeTutorialMeta(outline.meta, outline.baseCode);

          // Post-outline validation (retrieval mode)
          if (modelSupportsRetrieval) {
            const { files: initialFiles } = normalizeBaseCode(outline.baseCode, outline.meta);
            const primaryFile = Object.keys(initialFiles)[0] ?? sourceItems[0]?.label ?? '';
            const scopeValidation = validateOutlineSourceScope(outline, sourceItems, primaryFile);
            if (scopeValidation.shouldRetry) {
              console.warn('[agent-loop] Outline scope validation: too many repairs, quality may be degraded', scopeValidation.errors);
            }
            outline = scopeValidation.outline;
          }

          controller.enqueue(encoder.encode(sseEvent('outline', outline)));
          await lifecycleHooks.onOutlineReady?.(outline);
          resolveOutline!(outline);
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

        const totalSteps = outline.steps.length;
        const filledSteps: TutorialStep[] = [];
        let totalRetries = 0;

        // Normalize baseCode to multi-file representation
        const { primaryFile } = normalizeBaseCode(
          outline.baseCode,
          outline.meta,
        );
        const generationBase = prepareGenerationBaseFiles(outline, sourceItems);
        const initialFiles = generationBase.files;
        const insertedProgressiveFiles = generationBase.insertedFiles;

        // Snapshot cache
        const snapshots: Map<number, Record<string, string>> = new Map();
        snapshots.set(-1, initialFiles);

        // Agent loop state
        const loopState: AgentLoopState = {
          turnCount: 0,
          repairHistory: [],
          replanCount: 0,
          tokenUsage: { used: 0, budget: 0 },
          outcomes: [],
        };

        for (let i = 0; i < totalSteps; i++) {
          currentPhase = 'step_fill';
          currentStepIndex = i;

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
          let lastFailedStep: TutorialStep | null = null;

          for (let attempt = 0; attempt < MAX_REPAIRS_PER_STEP; attempt++) {
            loopState.turnCount++;
            if (loopState.turnCount >= MAX_TURNS) {
              console.warn(`[agent-loop] MAX_TURNS (${MAX_TURNS}) reached at step ${i + 1}, attempt ${attempt + 1}. Marking step as degraded.`);
              break;
            }

            try {
              let step: TutorialStep;
              let retrievalStepScope: { targetFiles: string[]; contextFiles: string[] } | null = null;

              // For repair attempts (attempt > 0), use the repair prompt
              const useRepairPrompt = attempt > 0 && lastFailedStep && lastError;

              if (useRepairPrompt) {
                // Directed repair: inject actual code state + error message
                const { systemPrompt, userPrompt } = buildRepairPrompt(
                  lastFailedStep!,
                  previousFiles,
                  lastError!,
                  outline,
                  i,
                  teachingBrief,
                  sourceItems,
                );

                const generateOpts: Parameters<typeof generateText>[0] = {
                  model,
                  system: adaptPromptForModel(systemPrompt, modelId),
                  prompt: adaptPromptForModel(userPrompt, modelId),
                  maxOutputTokens: getMaxOutputTokens(modelId),
                };

                const result = await generateText(generateOpts);
                const parsedStep = parseJsonFromText(result.text, legacyTutorialStepSchema, `step-${i + 1}-repair-attempt-${attempt}`);
                step = { ...parsedStep, chapterId: outline.steps[i]?.chapterId ?? parsedStep.chapterId ?? DEFAULT_CHAPTER_ID };
              } else if (modelSupportsRetrieval) {
                // Retrieval-based step fill
                const stepScope = deriveStepSourceScope(outline.steps[i], previousFiles);
                retrievalStepScope = stepScope;
                const budget = STEP_FILL_TOOLS_ENABLED
                  ? createTokenBudgetSession({
                      modelId: modelId ?? 'deepseek/deepseek-chat',
                      basePrompt: '',
                    })
                  : null;
                const scopedTools = budget
                  ? createScopedSourceTools(sourceItems, previousFiles, { budget })
                  : undefined;
                const snapshotSummary = buildCurrentSnapshotSummary(previousFiles);
                const { systemPrompt, userPrompt } = buildRetrievalStepFillPrompt(
                  sourceItems,
                  teachingBrief,
                  outline,
                  i,
                  previousFiles,
                  stepScope,
                  snapshotSummary,
                  lastError ?? undefined,
                  { toolsEnabled: STEP_FILL_TOOLS_ENABLED },
                );

                const generateOptions: Parameters<typeof generateText>[0] = {
                  model,
                  system: adaptPromptForModel(systemPrompt, modelId),
                  prompt: adaptPromptForModel(userPrompt, modelId),
                  maxOutputTokens: getMaxOutputTokens(modelId),
                };
                if (scopedTools) {
                  generateOptions.tools = scopedTools;
                  generateOptions.stopWhen = stepCountIs(6);
                }
                const result = await generateText(generateOptions);
                const parsedStep = parseJsonFromText(result.text, legacyTutorialStepSchema, `step-${i + 1}-retrieval`);
                step = { ...parsedStep, chapterId: outline.steps[i]?.chapterId ?? parsedStep.chapterId ?? DEFAULT_CHAPTER_ID };
              } else {
                // Legacy full-injection step fill
                const { systemPrompt, userPrompt } = buildStepFillPrompt(
                  sourceItems,
                  teachingBrief,
                  outline,
                  i,
                  previousFiles,
                  lastError ?? undefined,
                );

                const stepGenerateOpts: Parameters<typeof generateText>[0] = {
                  model,
                  system: adaptPromptForModel(systemPrompt, modelId),
                  prompt: adaptPromptForModel(userPrompt, modelId),
                  maxOutputTokens: getMaxOutputTokens(modelId),
                };
                if (useNativeStructuredOutput) {
                  stepGenerateOpts.output = Output.object({ schema: legacyTutorialStepSchema });
                }
                const result = await generateText(stepGenerateOpts);

                let parsedStep;
                if (useNativeStructuredOutput && result.output) {
                  parsedStep = result.output;
                } else {
                  parsedStep = parseJsonFromText(result.text, legacyTutorialStepSchema, `step-${i + 1}-legacy`);
                }
                step = { ...parsedStep, chapterId: outline.steps[i]?.chapterId ?? parsedStep.chapterId ?? DEFAULT_CHAPTER_ID };
              }

              if (modelSupportsRetrieval && retrievalStepScope) {
                validateRetrievalStepTargets(step, primaryFile, retrievalStepScope, previousFiles);
              }

              // ── Immediate per-step validation (key difference from legacy) ──
              if (step.patches && step.patches.length > 0) {
                const validation = validateStepPatches(previousFiles, step.patches, primaryFile);

                if (validation.result === 'pass') {
                  // Use auto-fixed patches if available
                  if (validation.fixedPatches) {
                    step.patches = validation.fixedPatches;
                    console.log(`[agent-loop] Auto-fix applied for step ${i + 1} (attempt ${attempt + 1})`);
                  }

                  loopState.outcomes.push({
                    stepIndex: i,
                    result: attempt === 0 ? 'pass' : 'repaired',
                    repairCount: attempt,
                    patchStrategy: validation.fixedPatches ? 'auto-fixed' : 'exact',
                    locChange: step.patches.reduce((sum, p) => {
                      return sum + Math.abs(p.replace.split('\n').length - p.find.split('\n').length);
                    }, 0),
                  });

                  stepResult = step;

                  // Emit step-repaired if this was a repair attempt
                  if (attempt > 0) {
                    controller.enqueue(encoder.encode(
                      sseEvent('step-repaired', { stepIndex: i, step: stepResult })
                    ));
                  }

                  break; // Step passed, exit repair loop
                }

                if (validation.result === 'repairable') {
                  totalRetries++;
                  lastFailedStep = step;
                  lastError = validation.errors.join('\n');

                  console.warn(`[agent-loop] Step ${i + 1} REPAIRABLE (attempt ${attempt + 1}/${MAX_REPAIRS_PER_STEP}):`, lastError);

                  controller.enqueue(encoder.encode(
                    sseEvent('repair', { stepIndex: i, attempt: attempt + 1, errorMessage: validation.errors[0] })
                  ));
                  await lifecycleHooks.onStepRetry?.({
                    stepIndex: i,
                    totalSteps,
                    attempt: attempt + 1,
                    retryCount: totalRetries,
                    errorMessage: validation.errors[0],
                  });

                  // Record repair attempt
                  loopState.repairHistory.push({
                    stepIndex: i,
                    attempts: attempt + 1,
                    strategy: 'full-rewrite',
                    outcome: 'degraded',
                    errorMessage: lastError,
                  });

                  // Continue inner loop -- next iteration uses buildRepairPrompt
                  continue;
                }

                if (validation.result === 'unrecoverable') {
                  totalRetries++;
                  loopState.replanCount++;

                  console.warn(`[agent-loop] Step ${i + 1} UNRECOVERABLE:`, validation.errors[0]);

                  controller.enqueue(encoder.encode(
                    sseEvent('replan', { fromStepIndex: i, reason: 'unrecoverable: ' + validation.errors[0], revisedStepCount: 0 })
                  ));

                  if (loopState.replanCount >= MAX_REPLANS) {
                    console.warn(`[agent-loop] MAX_REPLANS (${MAX_REPLANS}) reached. Marking step as degraded.`);
                  }

                  // For Plan 01: mark step as degraded (full replan logic comes in Plan 03)
                  loopState.outcomes.push({
                    stepIndex: i,
                    result: 'replanned',
                    repairCount: attempt,
                    patchStrategy: 'exact',
                    locChange: 0,
                  });

                  // Use the step without patches as degraded
                  step.patches = [];
                  stepResult = step;
                  break;
                }
              } else {
                // No patches -- accept step as-is
                loopState.outcomes.push({
                  stepIndex: i,
                  result: attempt === 0 ? 'pass' : 'repaired',
                  repairCount: attempt,
                  patchStrategy: 'exact',
                  locChange: 0,
                });
                stepResult = step;
                break;
              }
            } catch (stepErr: any) {
              totalRetries++;
              const stepErrorMessage = stepErr.message || String(stepErr);
              lastError = stepErrorMessage;
              console.error(`[agent-loop] Step ${i + 1} attempt ${attempt + 1} failed:`, lastError);
              await lifecycleHooks.onStepRetry?.({
                stepIndex: i,
                totalSteps,
                attempt: attempt + 1,
                retryCount: totalRetries,
                errorMessage: stepErrorMessage,
              });
            }
          }

          if (!stepResult) {
            console.error(`[agent-loop] Step ${i + 1} failed after ${MAX_REPAIRS_PER_STEP} repair attempts`);
            throw new MultiPhaseGenerationError(
              'step_fill',
              new Error(`Step ${i + 1} failed after ${MAX_REPAIRS_PER_STEP} repair attempts: ${lastError ?? 'unknown error'}`),
              i,
            );
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
          });
          await lifecycleHooks.onStepFilled?.(i, stepResult, [...filledSteps]);

          // Update snapshot cache
          if (stepResult.patches && stepResult.patches.length > 0) {
            const newFiles = applyContentPatches(previousFiles, stepResult.patches, primaryFile);
            snapshots.set(i, newFiles);
          } else {
            snapshots.set(i, previousFiles);
          }

          // LOC budget warning (quality signal, does not block)
          if (stepResult.patches && stepResult.patches.length > 0) {
            const locBudget = outline.steps[i]?.estimatedLocChange ?? LOC_DEFAULT_BUDGET;
            const actualLoc = stepResult.patches.reduce((sum, p) => {
              return sum + Math.abs(p.replace.split('\n').length - p.find.split('\n').length);
            }, 0);
            const warningThreshold = Math.max(locBudget * 2, LOC_WARNING_FLOOR);
            if (actualLoc > warningThreshold) {
              console.warn(
                `[agent-loop] Step ${i + 1} LOC ${actualLoc} exceeds warning threshold ${warningThreshold} (budget ${locBudget})`,
              );
            }
          }

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
        try {
          const validation = await validateTutorialDraft(draft);
          validationErrors = validation.valid ? [] : validation.errors;
        } catch (valErr: any) {
          validationErrors = [valErr.message || String(valErr)];
        }

        controller.enqueue(encoder.encode(
          sseEvent('validation', { valid: validationErrors.length === 0, errors: validationErrors })
        ));

        controller.enqueue(encoder.encode(
          sseEvent('done', { success: true })
        ));

        resolveResult({
          draft,
          outline,
          retryCount: totalRetries,
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
