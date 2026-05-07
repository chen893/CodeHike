import type { TutorialDraft, TutorialStep } from '../schemas/tutorial-draft';
import type { NormalizedOutline } from '../tutorial/outline-chapters';
import { ensureDraftChapters } from '../tutorial/chapters';

function buildPlaceholderStep(
  outlineStep: NormalizedOutline['steps'][number]
): TutorialStep {
  return {
    id: outlineStep.id,
    chapterId: outlineStep.chapterId,
    title: outlineStep.title,
    paragraphs: [],
    patches: [],
    teachingGoal: outlineStep.teachingGoal,
    conceptIntroduced: outlineStep.conceptIntroduced,
  };
}

export function buildRetryRecoveryDraft(input: {
  tutorialDraft: TutorialDraft | null;
  outline: NormalizedOutline;
  retryStartIndex?: number;
}): TutorialDraft {
  const existingDraft = input.tutorialDraft
    ? ensureDraftChapters(input.tutorialDraft)
    : null;
  const retryStartIndex = Math.max(
    0,
    input.retryStartIndex ?? Number.POSITIVE_INFINITY
  );

  const seededSteps = input.outline.steps.map((outlineStep, index) => {
    const existingStep = existingDraft?.steps[index];
    if (!existingStep || index >= retryStartIndex) {
      return buildPlaceholderStep(outlineStep);
    }

    return {
      ...existingStep,
      chapterId: existingStep.chapterId || outlineStep.chapterId,
      title: existingStep.title || outlineStep.title,
      teachingGoal: existingStep.teachingGoal ?? outlineStep.teachingGoal,
      conceptIntroduced:
        existingStep.conceptIntroduced ?? outlineStep.conceptIntroduced,
    };
  });

  return ensureDraftChapters({
    meta: existingDraft?.meta ?? input.outline.meta,
    intro: existingDraft?.intro ?? input.outline.intro,
    baseCode: existingDraft?.baseCode ?? input.outline.baseCode,
    chapters: input.outline.chapters,
    steps: seededSteps,
  });
}
