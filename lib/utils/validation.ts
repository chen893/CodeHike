import { buildTutorialSteps } from '../tutorial/assembler';
import { findFirstInvalidStep } from '../tutorial/draft-code';
import { validateChapterStructure, ensureDraftChapters } from '../tutorial/chapters';
import type { TutorialDraft } from '../schemas/tutorial-draft';

export async function validateTutorialDraft(
  tutorialDraft: TutorialDraft
): Promise<{ valid: boolean; errors: string[] }> {
  // Ensure legacy drafts have chapters before validating
  const draft = ensureDraftChapters(tutorialDraft);

  const firstInvalidStep = findFirstInvalidStep(
    draft as Parameters<typeof findFirstInvalidStep>[0]
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

  // Chapter structure validation
  const chapterResult = validateChapterStructure(draft.chapters, draft.steps);
  errors.push(...chapterResult.errors);

  try {
    await buildTutorialSteps(draft as Parameters<typeof buildTutorialSteps>[0]);
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
