import * as draftRepo from '../repositories/draft-repository';
import { validateTutorialDraft } from '../utils/validation';

export async function deleteDraftStep(id: string, stepId: string, userId: string) {
  const draft = await draftRepo.getDraftById(id, userId);
  if (!draft || !draft.tutorialDraft) throw new Error('Draft not found');

  const stepIndex = draft.tutorialDraft.steps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) throw new Error('Step not found');
  if (draft.tutorialDraft.steps.length <= 1) {
    throw new Error('conflict: Draft must keep at least one step');
  }

  const steps = draft.tutorialDraft.steps.filter((step) => step.id !== stepId);
  const updated = await draftRepo.updateDraftSteps(id, steps);
  if (!updated || !updated.tutorialDraft) throw new Error('Failed to delete step');

  const validation = await validateTutorialDraft(updated.tutorialDraft);
  await draftRepo.updateDraftValidation(id, validation.valid, validation.errors);

  const result = await draftRepo.getDraftById(id);
  if (!result) throw new Error('Failed to retrieve updated draft');

  return result;
}
