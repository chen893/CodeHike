import * as draftRepo from '../repositories/draft-repository';
import { validateTutorialDraft } from '../utils/validation';
import { updateStepRequestSchema } from '../schemas/api';

export async function updateDraftStep(
  id: string,
  stepId: string,
  data: { eyebrow?: string; title?: string; lead?: string; paragraphs?: string[] }
) {
  const parsed = updateStepRequestSchema.parse(data);

  const draft = await draftRepo.getDraftById(id);
  if (!draft || !draft.tutorialDraft) throw new Error('Draft not found');

  const stepExists = draft.tutorialDraft.steps.some((step) => step.id === stepId);
  if (!stepExists) throw new Error('Step not found');

  const steps = draft.tutorialDraft.steps.map((step) =>
    step.id === stepId ? { ...step, ...parsed } : step
  );

  const updated = await draftRepo.updateDraftSteps(id, steps);
  if (!updated) throw new Error('Failed to update step');

  // Re-validate after step change
  if (updated.tutorialDraft) {
    const validation = await validateTutorialDraft(updated.tutorialDraft);
    await draftRepo.updateDraftValidation(id, validation.valid, validation.errors);
  }

  const result = await draftRepo.getDraftById(id);
  if (!result) throw new Error('Failed to retrieve updated draft');
  return result;
}
