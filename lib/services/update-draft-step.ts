import * as draftRepo from '../repositories/draft-repository';
import {
  validateTutorialDraft,
  validateTutorialDraftThroughStep,
} from '../utils/validation';
import { updateStepRequestSchema } from '../schemas/api';
import type { TutorialStep } from '../schemas/tutorial-draft';

function hasOwn(data: object, key: string) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function normalizeOptionalArray<T>(value: T[] | undefined) {
  return value && value.length > 0 ? value : undefined;
}

function applyStepUpdates(step: TutorialStep, parsed: Record<string, unknown>) {
  const nextStep: TutorialStep = { ...step };

  if (hasOwn(parsed, 'eyebrow')) {
    nextStep.eyebrow = parsed.eyebrow as string | undefined;
  }
  if (hasOwn(parsed, 'title')) {
    nextStep.title = parsed.title as string;
  }
  if (hasOwn(parsed, 'lead')) {
    nextStep.lead = parsed.lead as string | undefined;
  }
  if (hasOwn(parsed, 'paragraphs')) {
    nextStep.paragraphs = parsed.paragraphs as string[];
  }
  if (hasOwn(parsed, 'patches')) {
    nextStep.patches = normalizeOptionalArray(parsed.patches as TutorialStep['patches']);
  }
  if (hasOwn(parsed, 'focus')) {
    nextStep.focus = parsed.focus as TutorialStep['focus'];
  }
  if (hasOwn(parsed, 'marks')) {
    nextStep.marks = normalizeOptionalArray(parsed.marks as TutorialStep['marks']);
  }

  return nextStep;
}

export async function updateDraftStep(
  id: string,
  stepId: string,
  data: {
    eyebrow?: string;
    title?: string;
    lead?: string;
    paragraphs?: string[];
    patches?: TutorialStep['patches'];
    focus?: TutorialStep['focus'];
    marks?: TutorialStep['marks'];
  },
  userId: string
) {
  const parsed = updateStepRequestSchema.parse(data);

  const draft = await draftRepo.getDraftById(id, userId);
  if (!draft || !draft.tutorialDraft) throw new Error('Draft not found');

  const stepIndex = draft.tutorialDraft.steps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) throw new Error('Step not found');

  const steps = draft.tutorialDraft.steps.map((step) =>
    step.id === stepId ? applyStepUpdates(step, parsed) : step
  );

  const hasStructureChange =
    hasOwn(parsed, 'patches') || hasOwn(parsed, 'focus') || hasOwn(parsed, 'marks');

  if (hasStructureChange) {
    const validation = await validateTutorialDraftThroughStep(
      { ...draft.tutorialDraft, steps },
      stepIndex
    );

    if (!validation.valid) {
      throw new Error(`validation: ${validation.errors.join('; ')}`);
    }
  }

  const updated = await draftRepo.updateDraftSteps(id, steps);
  if (!updated) throw new Error('Failed to update step');

  if (updated.tutorialDraft) {
    const validation = await validateTutorialDraft(updated.tutorialDraft);
    await draftRepo.updateDraftValidation(id, validation.valid, validation.errors);
  }

  const result = await draftRepo.getDraftById(id);
  if (!result) throw new Error('Failed to retrieve updated draft');
  return result;
}
