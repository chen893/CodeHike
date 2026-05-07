import { buildTutorialSteps } from '../tutorial/assembler';
import { findFirstInvalidStep } from '../tutorial/draft-code';
import { validateChapterStructure, ensureDraftChapters } from '../tutorial/chapters';
import type { TutorialDraft } from '../schemas/tutorial-draft';
import { normalizeBaseCode } from '../tutorial/normalize';

const GENERATED_FAILURE_PATTERNS = [
  /⚠️\s*此步骤自动生成失败/u,
  /Failed to parse JSON from model response/u,
  /请手动编辑/u,
];

function isGeneratedFailurePlaceholder(text: string): boolean {
  return GENERATED_FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

export interface ValidationProvenance {
  category: 'patch_chain' | 'placeholder' | 'structure' | 'assembly';
  stepIndex: number | null;
  stepId: string | null;
  stepTitle: string | null;
  file: string | null;
  message: string;
  recoverability: 'none' | 'retry_full' | 'retry_from_step';
}

export interface TutorialDraftValidationResult {
  valid: boolean;
  errors: string[];
  provenance: ValidationProvenance[];
}

export class TutorialDraftValidationError extends Error {
  validation: TutorialDraftValidationResult;

  constructor(validation: TutorialDraftValidationResult) {
    super(validation.errors[0] ?? 'Tutorial draft validation failed');
    this.name = 'TutorialDraftValidationError';
    this.validation = validation;
  }
}

export function findFirstGeneratedFailureStep(tutorialDraft: TutorialDraft) {
  const draft = ensureDraftChapters(tutorialDraft);

  for (let stepIndex = 0; stepIndex < draft.steps.length; stepIndex++) {
    const step = draft.steps[stepIndex];
    const paragraph = step.paragraphs.find((value) => isGeneratedFailurePlaceholder(value));
    if (!paragraph) continue;
    return {
      stepIndex,
      stepId: step.id ?? null,
      stepTitle: step.title,
      message: paragraph.slice(0, 160),
    };
  }

  return null;
}

export async function validateTutorialDraft(
  tutorialDraft: TutorialDraft
): Promise<TutorialDraftValidationResult> {
  // Ensure legacy drafts have chapters before validating
  const draft = ensureDraftChapters(tutorialDraft);

  const firstInvalidStep = findFirstInvalidStep(
    draft as Parameters<typeof findFirstInvalidStep>[0]
  );
  const { primaryFile } = normalizeBaseCode(draft.baseCode, draft.meta);

  if (firstInvalidStep) {
    const failedStep = draft.steps[firstInvalidStep.stepIndex];
    const file =
      failedStep?.patches?.find((patch) => Boolean(patch.file))?.file ??
      primaryFile ??
      null;
    return {
      valid: false,
      errors: [
        `步骤 ${firstInvalidStep.stepIndex + 1}《${firstInvalidStep.stepTitle}》失效：${firstInvalidStep.message}`,
      ],
      provenance: [
        {
          category: 'patch_chain',
          stepIndex: firstInvalidStep.stepIndex,
          stepId: firstInvalidStep.stepId ?? null,
          stepTitle: firstInvalidStep.stepTitle,
          file,
          message: firstInvalidStep.message,
          recoverability: 'retry_from_step',
        },
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
      provenance: [
        {
          category: 'placeholder',
          stepIndex: generatedFailureStep.stepIndex,
          stepId: generatedFailureStep.stepId ?? null,
          stepTitle: generatedFailureStep.stepTitle,
          file: null,
          message: generatedFailureStep.message,
          recoverability: 'retry_from_step',
        },
      ],
    };
  }

  const errors: string[] = [];
  const provenance: ValidationProvenance[] = [];

  // Chapter structure validation
  const chapterResult = validateChapterStructure(draft.chapters, draft.steps);
  errors.push(...chapterResult.errors);
  provenance.push(
    ...chapterResult.errors.map((message) => ({
      category: 'structure' as const,
      stepIndex: null,
      stepId: null,
      stepTitle: null,
      file: null,
      message,
      recoverability: 'retry_full' as const,
    }))
  );

  try {
    await buildTutorialSteps(draft as Parameters<typeof buildTutorialSteps>[0]);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    errors.push(message);
    provenance.push({
      category: 'assembly',
      stepIndex: null,
      stepId: null,
      stepTitle: null,
      file: null,
      message,
      recoverability: 'retry_full',
    });
  }

  return { valid: errors.length === 0, errors, provenance };
}

export async function validateTutorialDraftThroughStep(
  tutorialDraft: TutorialDraft,
  stepIndex: number
): Promise<TutorialDraftValidationResult> {
  return validateTutorialDraft({
    ...tutorialDraft,
    steps: tutorialDraft.steps.slice(0, stepIndex + 1),
  });
}
