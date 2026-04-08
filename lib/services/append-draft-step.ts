import * as draftRepo from '../repositories/draft-repository';
import { validateTutorialDraft } from '../utils/validation';
import { appendStepRequestSchema } from '../schemas/api';

export async function appendDraftStep(
  id: string,
  stepData: any
) {
  const parsed = appendStepRequestSchema.parse({ step: stepData });

  const draft = await draftRepo.getDraftById(id);
  if (!draft || !draft.tutorialDraft) throw new Error('Draft not found');

  const steps = [...draft.tutorialDraft.steps, parsed.step];

  const updated = await draftRepo.updateDraftSteps(id, steps);
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
