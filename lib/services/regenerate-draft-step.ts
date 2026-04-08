import * as draftRepo from '../repositories/draft-repository';
import { regenerateStep } from '../ai/tutorial-generator';
import { validateTutorialDraft } from '../utils/validation';
import { regenerateStepRequestSchema } from '../schemas/api';

export async function regenerateDraftStep(
  id: string,
  stepId: string,
  data: { mode: 'prose' | 'step'; instruction?: string }
) {
  const parsed = regenerateStepRequestSchema.parse(data);

  const draft = await draftRepo.getDraftById(id);
  if (!draft || !draft.tutorialDraft) throw new Error('Draft not found');

  const stepIndex = draft.tutorialDraft.steps.findIndex((s) => s.id === stepId);
  if (stepIndex === -1) throw new Error('Step not found');

  const regeneratedStep = await regenerateStep(
    draft.sourceItems,
    draft.teachingBrief,
    draft.tutorialDraft,
    stepIndex,
    parsed.mode,
    undefined,
    parsed.instruction
  );

  if (!regeneratedStep) {
    throw new Error('No output from AI');
  }

  // Merge: prose mode keeps patches/focus/marks
  const steps = draft.tutorialDraft.steps.map((step, i) => {
    if (i !== stepIndex) return step;
    if (parsed.mode === 'prose') {
      return {
        ...step,
        eyebrow: regeneratedStep.eyebrow ?? step.eyebrow,
        title: regeneratedStep.title ?? step.title,
        lead: regeneratedStep.lead ?? step.lead,
        paragraphs: regeneratedStep.paragraphs ?? step.paragraphs,
      };
    }
    return { ...regeneratedStep, id: step.id };
  });

  const updated = await draftRepo.updateDraftSteps(id, steps);
  if (!updated) throw new Error('Failed to update steps');

  // Re-validate
  if (updated?.tutorialDraft) {
    const validation = await validateTutorialDraft(updated.tutorialDraft);
    await draftRepo.updateDraftValidation(id, validation.valid, validation.errors);
  }

  const result = await draftRepo.getDraftById(id);
  if (!result) throw new Error('Failed to retrieve updated draft');
  return result;
}
