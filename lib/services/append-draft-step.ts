import * as draftRepo from '../repositories/draft-repository';
import { validateTutorialDraft } from '../utils/validation';
import { appendStepRequestSchema } from '../schemas/api';
import { ensureDraftChapters } from '../tutorial/chapters';

export async function appendDraftStep(
  id: string,
  stepData: any,
  userId: string
) {
  const parsed = appendStepRequestSchema.parse({ step: stepData });

  const draft = await draftRepo.getDraftById(id, userId);
  if (!draft || !draft.tutorialDraft) throw new Error('Draft not found');

  // Normalize draft to ensure chapters exist (handles legacy drafts)
  const normalizedTd = ensureDraftChapters(draft.tutorialDraft as any);

  // Assign chapterId if missing: default to first chapter
  const firstChapterId = normalizedTd.chapters[0].id;
  const stepWithChapter = {
    ...parsed.step,
    chapterId: parsed.step.chapterId || firstChapterId,
  };

  const steps = [...normalizedTd.steps, stepWithChapter];

  // Store the normalized draft (with chapters) plus the new step
  const updatedTd = { ...normalizedTd, steps };
  const updated = await draftRepo.updateDraftTutorial(id, updatedTd, {
    inputHash: draft.tutorialDraftInputHash,
    model: draft.generationModel ?? 'unknown',
  });
  if (!updated) throw new Error('Failed to append step');

  // Re-validate
  if (updated.tutorialDraft) {
    const validation = await validateTutorialDraft(updated.tutorialDraft);
    await draftRepo.updateDraftValidation(id, validation.valid, validation.errors);
  }

  const result = await draftRepo.getDraftById(id);
  if (!result) throw new Error('Failed to retrieve updated draft');
  return result;
}
