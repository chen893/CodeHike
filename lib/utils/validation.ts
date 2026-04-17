import { buildTutorialSteps } from '../tutorial/assembler';
import { findFirstInvalidStep } from '../tutorial/draft-code';
import { validateChapterStructure, ensureDraftChapters } from '../tutorial/chapters';
import type { TutorialDraft } from '../schemas/tutorial-draft';

const GENERATED_FAILURE_PATTERNS = [
  /⚠️\s*此步骤自动生成失败/u,
  /Failed to parse JSON from model response/u,
  /请手动编辑/u,
];

function isGeneratedFailurePlaceholder(text: string): boolean {
  return GENERATED_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

export function findFirstGeneratedFailureStep(tutorialDraft: TutorialDraft) {
  const draft = ensureDraftChapters(tutorialDraft);

  for (let stepIndex = 0; stepIndex < draft.steps.length; stepIndex++) {
    const step = draft.steps[stepIndex];
    const paragraph = step.paragraphs.find((value) => isGeneratedFailurePlaceholder(value));
    if (!paragraph) continue;
    return {
      stepIndex,
      stepTitle: step.title,
      message: paragraph.slice(0, 160),
    };
  }

  return null;
}

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

  const generatedFailureStep = findFirstGeneratedFailureStep(draft);
  if (generatedFailureStep) {
    return {
      valid: false,
      errors: [
        `步骤 ${generatedFailureStep.stepIndex + 1}《${generatedFailureStep.stepTitle}》包含生成失败占位内容：${generatedFailureStep.message}`,
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
