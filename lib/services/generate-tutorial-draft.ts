import { createTutorialGenerationStream } from '../ai/tutorial-generator';
import { validateTutorialDraft } from '../utils/validation';
import * as draftRepo from '../repositories/draft-repository';
import type { TutorialDraft } from '../schemas/tutorial-draft';

export async function initiateGeneration(
  draftId: string,
  modelId?: string
): Promise<Response> {
  const draft = await draftRepo.getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');

  if (draft.generationState === 'running') {
    throw new Error('Generation is already in progress for this draft');
  }

  await draftRepo.updateDraftGenerationState(draftId, 'running');

  const effectiveModel = modelId || process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  const result = createTutorialGenerationStream(
    draft.sourceItems,
    draft.teachingBrief,
    effectiveModel
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
        // Signal completion
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
        );
        controller.close();

        // Persist using the structured output from the AI SDK
        persistGeneratedContent(draftId, result.output, draft, effectiveModel).catch(
          (persistErr) => {
            console.error(
              `[generate] Failed to persist content for draft ${draftId}:`,
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

async function persistGeneratedContent(
  draftId: string,
  outputPromise: PromiseLike<TutorialDraft>,
  draft: any,
  model: string
) {
  try {
    const output = await outputPromise;

    if (!output) {
      await draftRepo.updateDraftGenerationState(
        draftId,
        'failed',
        'No output from AI'
      );
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
