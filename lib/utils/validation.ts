import { buildTutorialSteps } from '../tutorial-assembler';
import { findFirstInvalidStep } from '../tutorial-draft-code';
import type { TutorialDraft } from '../schemas/tutorial-draft';

export async function validateTutorialDraft(
  tutorialDraft: TutorialDraft
): Promise<{ valid: boolean; errors: string[] }> {
  const firstInvalidStep = findFirstInvalidStep(
    tutorialDraft as Parameters<typeof findFirstInvalidStep>[0]
  );

  if (firstInvalidStep) {
    return {
      valid: false,
      errors: [
        `步骤 ${firstInvalidStep.stepIndex + 1}《${firstInvalidStep.stepTitle}》失效：${firstInvalidStep.message}`,
      ],
    };
  }

  const errors: string[] = [];

  try {
    await buildTutorialSteps(tutorialDraft as Parameters<typeof buildTutorialSteps>[0]);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    errors.push(message);
  }

  return { valid: errors.length === 0, errors };
}

export async function validateTutorialDraftThroughStep(
  tutorialDraft: TutorialDraft,
  stepIndex: number
): Promise<{ valid: boolean; errors: string[] }> {
  return validateTutorialDraft({
    ...tutorialDraft,
    steps: tutorialDraft.steps.slice(0, stepIndex + 1),
  });
}
