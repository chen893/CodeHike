import * as draftRepo from '../repositories/draft-repository';
import { replaceStepsRequestSchema } from '../schemas/api';
import { validateTutorialDraft } from '../utils/validation';

function getSortedIds(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function hasDuplicateIds(values: string[]) {
  return new Set(values).size !== values.length;
}

export async function replaceDraftSteps(
  id: string,
  data: { stepIds: unknown }
) {
  const parsed = replaceStepsRequestSchema.parse(data);

  const draft = await draftRepo.getDraftById(id);
  if (!draft || !draft.tutorialDraft) throw new Error('Draft not found');

  const existingIds = getSortedIds(draft.tutorialDraft.steps.map((step) => step.id));
  const nextIds = getSortedIds(parsed.stepIds);

  if (existingIds.length !== nextIds.length) {
    throw new Error('validation: Step count does not match existing draft');
  }

  if (hasDuplicateIds(parsed.stepIds)) {
    throw new Error('validation: Step IDs must be unique');
  }

  if (existingIds.some((stepId, index) => stepId !== nextIds[index])) {
    throw new Error('validation: Step IDs must match the existing draft');
  }

  const stepsById = new Map(
    draft.tutorialDraft.steps.map((step) => [step.id, step] as const)
  );
  const reorderedSteps = parsed.stepIds.map((stepId) => {
    const step = stepsById.get(stepId);
    if (!step) {
      throw new Error('validation: Step IDs must match the existing draft');
    }
    return step;
  });

  const updated = await draftRepo.updateDraftSteps(id, reorderedSteps);
  if (!updated || !updated.tutorialDraft) throw new Error('Failed to replace steps');

  const validation = await validateTutorialDraft(updated.tutorialDraft);
  await draftRepo.updateDraftValidation(id, validation.valid, validation.errors);

  const result = await draftRepo.getDraftById(id);
  if (!result) throw new Error('Failed to retrieve updated draft');

  return result;
}
