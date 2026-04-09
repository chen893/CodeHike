import { createTutorialGenerationStream } from '../ai/tutorial-generator';
import { createMultiPhaseGenerationStream, type MultiPhaseResult } from '../ai/multi-phase-generator';
import { validateTutorialDraft } from '../utils/validation';
import { computeGenerationQuality } from './compute-generation-quality';
import * as draftRepo from '../repositories/draft-repository';
import type { TutorialDraft } from '../schemas/tutorial-draft';

export async function initiateGeneration(
  draftId: string,
  modelId?: string,
  generationVersion: 'v1' | 'v2' = 'v2'
): Promise<Response> {
  const draft = await draftRepo.getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');

  if (draft.generationState === 'running') {
    throw new Error('Generation is already in progress for this draft');
  }

  await draftRepo.updateDraftGenerationState(draftId, 'running');

  const effectiveModel = modelId || process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  if (generationVersion === 'v1') {
    return initiateV1Generation(draftId, draft, effectiveModel);
  } else {
    return initiateV2Generation(draftId, draft, effectiveModel);
  }
}

/**
 * v1: Original single-shot streaming generation.
 */
async function initiateV1Generation(
  draftId: string,
  draft: any,
  model: string
): Promise<Response> {
  const result = createTutorialGenerationStream(
    draft.sourceItems,
    draft.teachingBrief,
    model
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async pull(controller) {
      try {
        for await (const textPart of result.textStream) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: textPart })}\n\n`)
          );
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
        );
        controller.close();

        persistV1Content(draftId, result.output, draft, model).catch(
          (persistErr) => {
            console.error(
              `[generate-v1] Failed to persist content for draft ${draftId}:`,
              persistErr
            );
          }
        );
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)
        );
        controller.close();
        draftRepo.updateDraftGenerationState(draftId, 'failed', err.message);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * v2: Multi-phase generation (outline → step fill → validate).
 */
async function initiateV2Generation(
  draftId: string,
  draft: any,
  model: string
): Promise<Response> {
  const { stream, result } = createMultiPhaseGenerationStream(
    draft.sourceItems,
    draft.teachingBrief,
    model
  );

  // Persist asynchronously after generation completes
  persistV2Content(draftId, result, draft, model).catch((persistErr) => {
    console.error(
      `[generate-v2] Failed to persist content for draft ${draftId}:`,
      persistErr
    );
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

async function persistV1Content(
  draftId: string,
  outputPromise: PromiseLike<TutorialDraft>,
  draft: any,
  model: string
) {
  try {
    const output = await outputPromise;

    if (!output) {
      await draftRepo.updateDraftGenerationState(draftId, 'failed', 'No output from AI');
      return;
    }

    const validation = await validateTutorialDraft(output);

    if (validation.valid) {
      await draftRepo.updateDraftTutorial(draftId, output, {
        inputHash: draft.inputHash,
        model,
      });
      await draftRepo.updateDraftValidation(draftId, true, []);
      await draftRepo.updateDraftGenerationState(draftId, 'succeeded');
    } else {
      await draftRepo.updateDraftTutorial(draftId, output, {
        inputHash: null,
        model,
      });
      await draftRepo.updateDraftValidation(draftId, false, validation.errors);
      await draftRepo.updateDraftGenerationState(
        draftId,
        'failed',
        validation.errors.join('; ')
      );
    }
  } catch (err: any) {
    await draftRepo.updateDraftGenerationState(
      draftId,
      'failed',
      err.message || String(err)
    );
  }
}

async function persistV2Content(
  draftId: string,
  resultPromise: Promise<MultiPhaseResult>,
  draft: any,
  model: string
) {
  const startTime = Date.now();

  try {
    const { draft: tutorialDraft, outline, retryCount } = await resultPromise;

    const validation = await validateTutorialDraft(tutorialDraft);
    const totalMs = Date.now() - startTime;

    // Compute and persist quality metrics
    const quality = computeGenerationQuality(tutorialDraft, outline, retryCount, totalMs);

    await draftRepo.updateDraftTutorial(draftId, tutorialDraft, {
      inputHash: validation.valid ? draft.inputHash : null,
      model,
    });
    await draftRepo.updateDraftGenerationOutline(draftId, outline);
    await draftRepo.updateDraftGenerationQuality(draftId, quality);
    await draftRepo.updateDraftValidation(
      draftId,
      validation.valid,
      validation.valid ? [] : validation.errors
    );
    await draftRepo.updateDraftGenerationState(
      draftId,
      validation.valid ? 'succeeded' : 'failed',
      validation.valid ? undefined : validation.errors.join('; ')
    );
  } catch (err: any) {
    await draftRepo.updateDraftGenerationState(
      draftId,
      'failed',
      err.message || String(err)
    );
  }
}
