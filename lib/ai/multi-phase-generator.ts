import { generateText, Output, stepCountIs } from 'ai';
import { tutorialOutlineSchema } from '../schemas/tutorial-outline';
import { legacyTutorialStepSchema, type TutorialStep, type TutorialDraft } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import { buildOutlinePrompt, buildRetrievalOutlinePrompt } from './outline-prompt';
import { buildStepFillPrompt, buildRetrievalStepFillPrompt, buildCurrentSnapshotSummary } from './step-fill-prompt';
import { adaptPromptForModel } from './prompt-adapters';
import { applyContentPatches } from '../tutorial/draft-code';
import { normalizeBaseCode, normalizeTutorialMeta } from '../tutorial/normalize';
import { ensureDraftChapters, DEFAULT_CHAPTER_ID } from '../tutorial/chapters';
import { validateTutorialDraft } from '../utils/validation';
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

const MAX_STEP_RETRIES = 3;
const LOC_WARNING_FLOOR = 60;
const LOC_DEFAULT_BUDGET = 8;
const STEP_FILL_TOOLS_ENABLED = process.env.VIBEDOCS_STEP_FILL_TOOLS === '1';

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

export interface MultiPhaseResult {
  draft: TutorialDraft;
  outline: TutorialOutline;
  retryCount: number;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export type MultiPhaseLifecyclePhase = 'outline' | 'step_fill' | 'validate';

export interface MultiPhasePhaseEvent {
  phase: MultiPhaseLifecyclePhase;
  stepIndex?: number | null;
  totalSteps?: number | null;
  retryCount?: number;
}

export interface MultiPhaseStepRetryEvent {
  stepIndex: number;
  totalSteps: number;
  attempt: number;
  retryCount: number;
  errorMessage: string;
}

export interface MultiPhaseStepCompletedEvent {
  stepIndex: number;
  totalSteps: number;
  retryCount: number;
}

export interface MultiPhaseLifecycleHooks {
  onPhase?: (event: MultiPhasePhaseEvent) => Promise<void> | void;
  onOutlineReady?: (outline: TutorialOutline) => Promise<void> | void;
  onStepRetry?: (event: MultiPhaseStepRetryEvent) => Promise<void> | void;
  onStepCompleted?: (event: MultiPhaseStepCompletedEvent) => Promise<void> | void;
  onStepFilled?: (stepIndex: number, step: TutorialStep, filledSteps: TutorialStep[]) => Promise<void> | void;
}

export class GenerationCancelledError extends Error {
  constructor(message = 'Generation cancelled') {
    super(message);
    this.name = 'GenerationCancelledError';
  }
}

export class MultiPhaseGenerationError extends Error {
  phase: MultiPhaseLifecyclePhase;
  stepIndex: number | null;
  cause: unknown;

  constructor(
    phase: MultiPhaseLifecyclePhase,
    cause: unknown,
    stepIndex: number | null = null
  ) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(message);
    this.name = 'MultiPhaseGenerationError';
    this.phase = phase;
    this.stepIndex = stepIndex;
    this.cause = cause;
  }
}

export interface MultiPhaseStream {
  stream: ReadableStream<Uint8Array>;
  result: Promise<MultiPhaseResult>;
  /** Resolves with the outline as soon as Phase 1 completes, before step-fill begins. */
  outlineReady: Promise<TutorialOutline>;
}

/**
 * Lightweight cancellation token shared between the SSE stream wrapper
 * and the generation loop.
 *
 * Design: The cancel() callback on the wrapped ReadableStream sets
 * `value = true`, but does NOT abort the AI call mid-flight. The
 * generation loop checks `cancelToken.value` only at safe boundaries
 * (between steps), so the current step always completes gracefully
 * before the stream is torn down. This avoids leaving the AI provider
 * in an inconsistent state and ensures partial progress can still be
 * persisted.
 */
export interface CancelToken {
  value: boolean;
}

/**
 * Creates a multi-phase generation stream.
 * Returns both the SSE stream (for real-time frontend progress) and
 * a result promise (for the service layer to persist after completion).
 *
 * @param checkDbCancel Optional async callback that queries the DB for cancelRequested.
 *                      When provided, the generation loop checks both the in-memory
 *                      cancelToken AND this callback at step boundaries.
 */
export function createMultiPhaseGenerationStream(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  modelId?: string,
  cancelToken?: CancelToken,
  lifecycleHooks: MultiPhaseLifecycleHooks = {},
  checkDbCancel?: () => Promise<boolean>
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

  const startTime = Date.now();

  /**
   * Check both in-memory cancelToken and DB cancelRequested flag.
   * Returns true if cancellation has been requested via either path.
   */
  async function isCancelRequested(): Promise<boolean> {
    if (cancelToken?.value) return true;
    if (checkDbCancel) {
      try {
        return await checkDbCancel();
      } catch {
        // DB query failed — don't block generation, rely on in-memory only
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

        // For large repos, check if retrieval is required
        const totalSourceTokens = estimateTokens(sourceItems.map(s => s.content).join('\n'));
        const isLargeRepo =
          sourceItems.length > 30 ||
          totalSourceTokens > getMaxInputTokens(modelId ?? '') * 0.6;

        console.log('[DEBUG] Outline generation params:', {
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

        // ── Phase 1: Generate Outline ──
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

            console.log('[DEBUG] Retrieval outline prompt sizes:', {
              systemPromptChars: systemPrompt.length,
              userPromptChars: userPrompt.length,
              systemPromptTokens: estimateTokens(systemPrompt),
              userPromptTokens: estimateTokens(userPrompt),
              budgetUsed: budget.usedInputTokens,
              budgetRemaining: budget.remainingInputTokens,
              budgetMax: budget.maxInputTokens,
            });

            // Retry loop for retrieval outline — DeepSeek and other providers
            // may drop the connection ("terminated | other side closed") on
            // large prompts with tools.
            let lastOutlineError: unknown = null;
            for (let attempt = 0; attempt < OUTLINE_MAX_RETRIES; attempt++) {
              try {
                console.log(`[DEBUG] Retrieval outline attempt ${attempt + 1}/${OUTLINE_MAX_RETRIES}`);
                const generateStart = Date.now();

                const result = await generateText({
                  model,
                  system: adaptPromptForModel(systemPrompt, modelId),
                  prompt: adaptPromptForModel(userPrompt, modelId),
                  tools: sourceTools,
                  stopWhen: stepCountIs(20),
                  maxOutputTokens: getMaxOutputTokens(modelId),
                });

                console.log('[DEBUG] generateText completed in', Date.now() - generateStart, 'ms, response length:', result.text?.length ?? 0);
                outline = parseJsonFromText(result.text, tutorialOutlineSchema, 'outline-retrieval');
                lastOutlineError = null;
                break; // success
              } catch (err: any) {
                lastOutlineError = err;
                const isConnectionError =
                  err?.message?.includes('terminated') ||
                  err?.message?.includes('other side closed') ||
                  err?.cause?.message?.includes('terminated');
                if (isConnectionError && attempt < OUTLINE_MAX_RETRIES - 1) {
                  console.warn(`[multi-phase] Outline attempt ${attempt + 1} failed with connection error, retrying...`, err.message);
                  continue;
                }
                throw err;
              }
            }
            if (lastOutlineError) throw lastOutlineError;
            if (!outline) throw new Error('Outline not generated — unreachable');

          } else {
            // Legacy full-injection outline (existing behavior)
            const { systemPrompt, userPrompt } = buildOutlinePrompt(sourceItems, teachingBrief);

            console.log('[DEBUG] Legacy outline prompt sizes:', {
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
            console.log('[DEBUG] generateText completed in', Date.now() - generateStart, 'ms, response length:', result.text?.length ?? 0);

            if (useStructuredOutput && result.output) {
              outline = result.output as TutorialOutline;
            } else {
              outline = parseJsonFromText(result.text, tutorialOutlineSchema, 'outline-legacy');
            }
          }

          // Ensure meta.lang/fileName are populated from baseCode
          outline.meta = normalizeTutorialMeta(outline.meta, outline.baseCode);

          // Post-outline validation (only in retrieval mode, where targetFiles/contextFiles exist)
          if (modelSupportsRetrieval) {
            const { files: initialFiles } = normalizeBaseCode(outline.baseCode, outline.meta);
            const primaryFile = Object.keys(initialFiles)[0] ?? sourceItems[0]?.label ?? '';
            const scopeValidation = validateOutlineSourceScope(outline, sourceItems, primaryFile);
            if (scopeValidation.shouldRetry) {
              console.warn('[multi-phase] Outline scope validation: too many repairs, quality may be degraded', scopeValidation.errors);
            }
            outline = scopeValidation.outline;
          }

          controller.enqueue(encoder.encode(sseEvent('outline', outline)));
          await lifecycleHooks.onOutlineReady?.(outline);
          resolveOutline!(outline);
        } catch (outlineErr: any) {
          // Walk the full cause chain for debugging
          const causeChain: string[] = [];
          let cursor: any = outlineErr;
          while (cursor) {
            if (cursor.message) causeChain.push(cursor.message);
            if (cursor.cause) { cursor = cursor.cause; } else { break; }
          }
          const fullCause = causeChain.join(' | ');
          console.error('[multi-phase] Outline generation failed:', outlineErr.message, '\nCause chain:', fullCause);
          console.error('[DEBUG] Outline error details:', {
            errorClass: outlineErr.constructor?.name,
            errorMessage: outlineErr.message,
            errorString: String(outlineErr),
            causeType: outlineErr.cause?.constructor?.name,
            causeMessage: outlineErr.cause?.message,
            causeString: outlineErr.cause ? String(outlineErr.cause) : undefined,
            stackPreview: outlineErr.stack?.split('\n').slice(0, 5).join('\n'),
          });
          if (outlineErr.cause?.issues) {
            // Zod validation issues — log each one
            console.error('[multi-phase] Zod issues:', JSON.stringify(outlineErr.cause.issues, null, 2));
          }
          controller.enqueue(encoder.encode(
            sseEvent('error', { phase: 'outline', message: outlineErr.message, cause: fullCause })
          ));
          controller.close();
          rejectResult(new MultiPhaseGenerationError('outline', outlineErr));
          return;
        }

        // ── Phase 2: Step-by-step fill ──
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
          outline.meta
        );
        const generationBase = prepareGenerationBaseFiles(outline, sourceItems);
        const initialFiles = generationBase.files;
        const insertedProgressiveFiles = generationBase.insertedFiles;

        // Snapshot cache: Map<stepIndex, filesSnapshot>
        // Replaces O(N^2) replay — store snapshots[i] = files after step i
        const snapshots: Map<number, Record<string, string>> = new Map();
        snapshots.set(-1, initialFiles);

        for (let i = 0; i < totalSteps; i++) {
          currentPhase = 'step_fill';
          currentStepIndex = i;
          controller.enqueue(encoder.encode(
            sseEvent('phase', { phase: 'step-fill', stepIndex: i, totalSteps })
          ));
          await lifecycleHooks.onPhase?.({
            phase: 'step_fill',
            stepIndex: i,
            totalSteps,
            retryCount: totalRetries,
          });

          // Use cached snapshot instead of O(N^2) replay
          const previousFiles = snapshots.get(i - 1)!;

          // Generate step with retry
          let stepResult: TutorialStep | null = null;
          let lastError: string | null = null;

          for (let attempt = 0; attempt < MAX_STEP_RETRIES; attempt++) {
            try {
              let step: TutorialStep;
              let retrievalStepScope: { targetFiles: string[]; contextFiles: string[] } | null = null;

              if (modelSupportsRetrieval) {
                // Retrieval-based step fill: scoped tools + target file injection
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
                // Legacy full-injection step fill (existing behavior)
                const { systemPrompt, userPrompt } = buildStepFillPrompt(
                  sourceItems,
                  teachingBrief,
                  outline,
                  i,
                  previousFiles,
                  lastError ?? undefined
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
                  // Output.object() validates against legacyTutorialStepSchema already
                  parsedStep = result.output;
                } else {
                  parsedStep = parseJsonFromText(result.text, legacyTutorialStepSchema, `step-${i + 1}-legacy`);
                }
                step = { ...parsedStep, chapterId: outline.steps[i]?.chapterId ?? parsedStep.chapterId ?? DEFAULT_CHAPTER_ID };
              }

              if (modelSupportsRetrieval && retrievalStepScope) {
                validateRetrievalStepTargets(step, primaryFile, retrievalStepScope, previousFiles);
              }

              // Validate patches can be applied
              if (step.patches && step.patches.length > 0) {
                try {
                  applyContentPatches(previousFiles, step.patches, primaryFile);
                } catch (patchErr: any) {
                  // Attempt auto-fix before giving up
                  const fixResult = tryAutoFixPatches(previousFiles, step.patches, primaryFile);
                  if (fixResult.success) {
                    step.patches = fixResult.fixedPatches;
                    console.log(`[multi-phase] Auto-fix applied for step ${i + 1}:`, fixResult.fixesApplied);
                    // Re-validate the fixed patches
                    applyContentPatches(previousFiles, step.patches, primaryFile);
                  } else {
                    throw patchErr;
                  }
                }

                // LOC budget is a quality signal; do not block generation here.
                const locBudget = outline.steps[i]?.estimatedLocChange ?? LOC_DEFAULT_BUDGET;
                const actualLoc = step.patches.reduce((sum, p) => {
                  return sum + Math.abs(p.replace.split('\n').length - p.find.split('\n').length);
                }, 0);
                const warningThreshold = Math.max(locBudget * 2, LOC_WARNING_FLOOR);
                if (actualLoc > warningThreshold) {
                  console.warn(
                    `[multi-phase] Step ${i + 1} LOC ${actualLoc} exceeds warning threshold ${warningThreshold} (budget ${locBudget}) — accepting and leaving granularity assessment to review`,
                  );
                }
              }

              stepResult = step;
              break;
            } catch (stepErr: any) {
              totalRetries++;
              const errorMessage = stepErr.message || String(stepErr);
              lastError = errorMessage;
              console.error(`[multi-phase] Step ${i + 1} attempt ${attempt + 1} failed:`, lastError);
              await lifecycleHooks.onStepRetry?.({
                stepIndex: i,
                totalSteps,
                attempt: attempt + 1,
                retryCount: totalRetries,
                errorMessage,
              });
            }
          }

          if (!stepResult) {
            console.error(`[multi-phase] Step ${i + 1} failed after ${MAX_STEP_RETRIES} retries`);
            throw new MultiPhaseGenerationError(
              'step_fill',
              new Error(`Step ${i + 1} failed after ${MAX_STEP_RETRIES} retries: ${lastError ?? 'unknown error'}`),
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

          // Update snapshot cache for next step
          if (stepResult.patches && stepResult.patches.length > 0) {
            const newFiles = applyContentPatches(previousFiles, stepResult.patches, primaryFile);
            snapshots.set(i, newFiles);
          } else {
            snapshots.set(i, previousFiles);
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
        // ensureDraftChapters wraps legacy data with a default chapter + chapterId
        // Pass outline.chapters so AI-generated chapter structure is preserved
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
