import { generateText, Output } from 'ai';
import { tutorialOutlineSchema } from '../schemas/tutorial-outline';
import { tutorialStepSchema, legacyTutorialStepSchema, type TutorialStep, type TutorialDraft } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import { buildOutlinePrompt } from './outline-prompt';
import { buildStepFillPrompt } from './step-fill-prompt';
import { adaptPromptForModel } from './prompt-adapters';
import { applyContentPatches } from '../tutorial/draft-code';
import { normalizeBaseCode, normalizeTutorialMeta } from '../tutorial/normalize';
import { ensureDraftChapters, DEFAULT_CHAPTER_ID } from '../tutorial/chapters';
import { validateTutorialDraft } from '../utils/validation';
import { createProvider, getMaxOutputTokens } from './provider-registry';
import { tryAutoFixPatches } from './patch-auto-fix';

const MAX_STEP_RETRIES = 3;

export interface MultiPhaseResult {
  draft: TutorialDraft;
  outline: TutorialOutline;
  retryCount: number;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export interface MultiPhaseStream {
  stream: ReadableStream<Uint8Array>;
  result: Promise<MultiPhaseResult>;
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
 */
export function createMultiPhaseGenerationStream(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  modelId?: string,
  cancelToken?: CancelToken
): MultiPhaseStream {
  const encoder = new TextEncoder();
  const model = createProvider(modelId);

  let resolveResult: (value: MultiPhaseResult) => void;
  let rejectResult: (reason: any) => void;
  const resultPromise = new Promise<MultiPhaseResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const startTime = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // ── Phase 1: Generate Outline ──
        controller.enqueue(encoder.encode(
          sseEvent('phase', { phase: 'outline', status: 'started' })
        ));

        let outline: TutorialOutline;
        try {
          const { systemPrompt, userPrompt } = buildOutlinePrompt(sourceItems, teachingBrief);
          const result = await generateText({
            model,
            system: adaptPromptForModel(systemPrompt, modelId),
            prompt: adaptPromptForModel(userPrompt, modelId),
            output: Output.object({ schema: tutorialOutlineSchema }),
            maxOutputTokens: getMaxOutputTokens(modelId),
          });
          outline = result.output;
          // Ensure meta.lang/fileName are populated from baseCode
          outline.meta = normalizeTutorialMeta(outline.meta, outline.baseCode);
          controller.enqueue(encoder.encode(sseEvent('outline', outline)));
        } catch (outlineErr: any) {
          const cause = outlineErr.cause ? String(outlineErr.cause) : '';
          console.error('[multi-phase] Outline generation failed:', outlineErr.message, cause);
          controller.enqueue(encoder.encode(
            sseEvent('error', { phase: 'outline', message: outlineErr.message, cause })
          ));
          controller.close();
          rejectResult(outlineErr);
          return;
        }

        // ── Phase 2: Step-by-step fill ──
        if (cancelToken?.value) {
          controller.enqueue(encoder.encode(
            sseEvent('error', { message: 'Generation cancelled' })
          ));
          controller.close();
          rejectResult(new Error('Cancelled'));
          return;
        }

        const totalSteps = outline.steps.length;
        const filledSteps: TutorialStep[] = [];
        let totalRetries = 0;

        // Normalize baseCode to multi-file representation
        const { files: initialFiles, primaryFile } = normalizeBaseCode(
          outline.baseCode,
          outline.meta
        );

        for (let i = 0; i < totalSteps; i++) {
          controller.enqueue(encoder.encode(
            sseEvent('phase', { phase: 'step-fill', stepIndex: i, totalSteps })
          ));

          // Compute previousFiles by applying all patches from steps 0..i-1
          let previousFiles: Record<string, string> = { ...initialFiles };
          for (let j = 0; j < i; j++) {
            const step = filledSteps[j];
            if (step.patches && step.patches.length > 0) {
              previousFiles = applyContentPatches(previousFiles, step.patches, primaryFile);
            }
          }

          // Generate step with retry
          let stepResult: TutorialStep | null = null;
          let lastError: string | null = null;

          for (let attempt = 0; attempt < MAX_STEP_RETRIES; attempt++) {
            try {
              const { systemPrompt, userPrompt } = buildStepFillPrompt(
                sourceItems,
                teachingBrief,
                outline,
                i,
                previousFiles,
                lastError ?? undefined
              );

              const result = await generateText({
                model,
                system: adaptPromptForModel(systemPrompt, modelId),
                prompt: adaptPromptForModel(userPrompt, modelId),
                output: Output.object({ schema: legacyTutorialStepSchema }),
                maxOutputTokens: getMaxOutputTokens(modelId),
              });

              const step = result.output;

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

                // Check LOC budget (soft — warn but don't block)
                const locBudget = outline.steps[i]?.estimatedLocChange ?? 8;
                const actualLoc = step.patches.reduce((sum, p) => {
                  return sum + Math.abs(p.replace.split('\n').length - p.find.split('\n').length);
                }, 0);
                if (actualLoc > locBudget + 10) {
                  console.warn(`[multi-phase] Step ${i + 1} LOC ${actualLoc} exceeds budget ${locBudget} by more than 10 — accepting anyway`);
                }
              }

              stepResult = { ...step, chapterId: step.chapterId ?? DEFAULT_CHAPTER_ID };
              break;
            } catch (stepErr: any) {
              totalRetries++;
              lastError = stepErr.message || String(stepErr);
              console.error(`[multi-phase] Step ${i + 1} attempt ${attempt + 1} failed:`, lastError);
            }
          }

          if (!stepResult) {
            console.error(`[multi-phase] Step ${i + 1} failed after ${MAX_STEP_RETRIES} retries`);
            stepResult = {
              id: outline.steps[i].id,
              chapterId: DEFAULT_CHAPTER_ID,
              title: outline.steps[i].title,
              paragraphs: [`⚠️ 此步骤自动生成失败，请手动编辑。错误：${lastError}`],
            } as TutorialStep;
          }

          // Enrich step with outline metadata
          stepResult.teachingGoal = outline.steps[i].teachingGoal;
          stepResult.conceptIntroduced = outline.steps[i].conceptIntroduced;

          filledSteps.push(stepResult);
          controller.enqueue(encoder.encode(
            sseEvent('step', { stepIndex: i, step: stepResult })
          ));

          // Check for cancellation between steps
          if (cancelToken?.value) {
            controller.enqueue(encoder.encode(
              sseEvent('error', { message: 'Generation cancelled' })
            ));
            controller.close();
            rejectResult(new Error('Cancelled'));
            return;
          }
        }

        // ── Assemble final draft ──
        // ensureDraftChapters wraps legacy data with a default chapter + chapterId
        const draft: TutorialDraft = ensureDraftChapters({
          meta: outline.meta,
          intro: outline.intro,
          baseCode: outline.baseCode,
          steps: filledSteps,
        });

        // ── Phase 3: Validate ──
        controller.enqueue(encoder.encode(
          sseEvent('phase', { phase: 'validate', status: 'started' })
        ));

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
        controller.enqueue(encoder.encode(
          sseEvent('error', { message: err.message || String(err) })
        ));
        controller.close();
        rejectResult(err);
      }
    },
  });

  return { stream, result: resultPromise };
}
