import { generateText, Output } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { tutorialOutlineSchema } from '../schemas/tutorial-outline';
import { tutorialStepSchema, type TutorialStep, type TutorialDraft } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import { buildOutlinePrompt } from './outline-prompt';
import { buildStepFillPrompt } from './step-fill-prompt';
import { applyContentPatches } from '../tutorial/assembler';
import { validateTutorialDraft } from '../utils/validation';

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

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
 * Creates a multi-phase generation stream.
 * Returns both the SSE stream (for real-time frontend progress) and
 * a result promise (for the service layer to persist after completion).
 */
export function createMultiPhaseGenerationStream(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  modelId: string = DEFAULT_MODEL
): MultiPhaseStream {
  const encoder = new TextEncoder();
  const model = deepseek(modelId);

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
            system: systemPrompt,
            prompt: userPrompt,
            output: Output.object({ schema: tutorialOutlineSchema }),
            maxOutputTokens: 4096,
          });
          outline = result.output;
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
        const totalSteps = outline.steps.length;
        const filledSteps: TutorialStep[] = [];
        let totalRetries = 0;

        for (let i = 0; i < totalSteps; i++) {
          controller.enqueue(encoder.encode(
            sseEvent('phase', { phase: 'step-fill', stepIndex: i, totalSteps })
          ));

          // Compute previousCode by applying all patches from steps 0..i-1
          let previousCode = outline.baseCode;
          for (let j = 0; j < i; j++) {
            const step = filledSteps[j];
            if (step.patches && step.patches.length > 0) {
              previousCode = applyContentPatches(previousCode, step.patches);
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
                previousCode,
                lastError ?? undefined
              );

              const result = await generateText({
                model,
                system: systemPrompt,
                prompt: userPrompt,
                output: Output.object({ schema: tutorialStepSchema }),
                maxOutputTokens: 4096,
              });

              const step = result.output;

              // Validate patches can be applied
              if (step.patches && step.patches.length > 0) {
                applyContentPatches(previousCode, step.patches);

                // Check LOC budget (soft — warn but don't block)
                const locBudget = outline.steps[i]?.estimatedLocChange ?? 8;
                const actualLoc = step.patches.reduce((sum, p) => {
                  return sum + Math.abs(p.replace.split('\n').length - p.find.split('\n').length);
                }, 0);
                if (actualLoc > locBudget + 10) {
                  console.warn(`[multi-phase] Step ${i + 1} LOC ${actualLoc} exceeds budget ${locBudget} by more than 10 — accepting anyway`);
                }
              }

              stepResult = step;
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
        }

        // ── Assemble final draft ──
        const draft: TutorialDraft = {
          meta: outline.meta,
          intro: outline.intro,
          baseCode: outline.baseCode,
          steps: filledSteps,
        };

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
