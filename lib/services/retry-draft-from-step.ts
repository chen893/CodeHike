import { regenerateStep } from '../ai/tutorial-generator';
import * as draftRepo from '../repositories/draft-repository';
import { retryFromStepRequestSchema } from '../schemas/api';
import { ensureOutlineChapters } from '../tutorial/outline-chapters';
import { validateTutorialDraft } from '../utils/validation';
import { buildRetryRecoveryDraft } from './retry-draft-from-step-utils';

export async function retryDraftFromStep(
  draftId: string,
  data: { stepIndex: number; instruction?: string },
  userId: string
) {
  const parsed = retryFromStepRequestSchema.parse(data);
  const draft = await draftRepo.getDraftById(draftId, userId);

  if (!draft) {
    throw new Error('Draft not found');
  }

  if (!draft.generationOutline) {
    throw new Error('请先生成并保存大纲后，再从失败步骤继续。');
  }

  const outline = ensureOutlineChapters(draft.generationOutline);
  if (parsed.stepIndex >= outline.steps.length) {
    throw new Error('失败步骤超出当前大纲范围。');
  }

  let workingDraft = buildRetryRecoveryDraft({
    tutorialDraft: draft.tutorialDraft,
    outline,
    retryStartIndex: parsed.stepIndex,
  });

  const modelId =
    draft.generationModel ||
    process.env.DEFAULT_AI_MODEL ||
    process.env.DEEPSEEK_MODEL;

  for (let currentIndex = parsed.stepIndex; currentIndex < workingDraft.steps.length; currentIndex++) {
    const instruction =
      currentIndex === parsed.stepIndex
        ? parsed.instruction ||
          '生成在当前步骤失败。请基于最新的前文代码，重新生成当前步骤及其代码变化，确保教程从这里继续衔接。'
        : '前面的步骤已经重新生成。请基于最新前文代码继续生成当前步骤，确保 patches、focus 和 marks 都与当前代码精确匹配。';

    const regeneratedStep = await regenerateStep(
      draft.sourceItems,
      draft.teachingBrief,
      workingDraft,
      currentIndex,
      'step',
      modelId,
      instruction
    );

    if (!regeneratedStep) {
      throw new Error(`第 ${currentIndex + 1} 步重新生成失败`);
    }

    const currentStep = workingDraft.steps[currentIndex];
    const nextSteps = workingDraft.steps.map((step, index) => {
      if (index !== currentIndex) return step;
      return {
        ...step,
        ...regeneratedStep,
        id: currentStep.id,
        chapterId: currentStep.chapterId,
        teachingGoal: regeneratedStep.teachingGoal ?? currentStep.teachingGoal,
        conceptIntroduced:
          regeneratedStep.conceptIntroduced ?? currentStep.conceptIntroduced,
      };
    });

    workingDraft = {
      ...workingDraft,
      steps: nextSteps,
    };

    await draftRepo.writePartialTutorial(draftId, {
      ...workingDraft,
      steps: workingDraft.steps.slice(0, currentIndex + 1),
    });
  }

  const validation = await validateTutorialDraft(workingDraft);

  if (validation.valid) {
    await draftRepo.updateDraftTutorial(
      draftId,
      workingDraft,
      {
        inputHash: draft.inputHash,
        model: modelId ?? 'unknown',
      }
    );
  }

  await draftRepo.updateDraftValidation(
    draftId,
    validation.valid,
    validation.errors
  );
  await draftRepo.updateDraftGenerationState(
    draftId,
    validation.valid ? 'succeeded' : 'failed',
    validation.valid ? undefined : validation.errors.join('; ')
  );

  const result = await draftRepo.getDraftById(draftId, userId);
  if (!result) {
    throw new Error('Failed to retrieve updated draft');
  }

  return result;
}
