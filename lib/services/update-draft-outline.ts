import * as draftRepo from '../repositories/draft-repository';
import { RouteConflictError } from '../api/route-errors';
import { tutorialOutlineSchema } from '../schemas/tutorial-outline';
import {
  ensureOutlineChapters,
  validateOutlineChapterStructure,
} from '../tutorial/outline-chapters';

export async function updateDraftOutline(
  draftId: string,
  userId: string,
  data: unknown
) {
  const parsed = tutorialOutlineSchema.parse(data);
  const draft = await draftRepo.getDraftById(draftId, userId);

  if (!draft) {
    throw new Error('Draft not found');
  }

  if (draft.generationState === 'running') {
    throw new RouteConflictError(
      '正在生成中，请等待完成后再保存大纲。',
      'GENERATION_RUNNING'
    );
  }

  if (draft.tutorialDraft) {
    throw new RouteConflictError(
      '当前草稿已经进入代码填充阶段，不能再保存大纲。',
      'OUTLINE_ALREADY_FILLED'
    );
  }

  const normalizedOutline = ensureOutlineChapters(parsed);
  const chapterValidation = validateOutlineChapterStructure(normalizedOutline);
  if (!chapterValidation.valid) {
    throw new Error(`validation: ${chapterValidation.errors.join('; ')}`);
  }

  await draftRepo.updateDraftGenerationOutline(draftId, normalizedOutline);

  const result = await draftRepo.getDraftById(draftId, userId);
  if (!result) {
    throw new Error('Failed to retrieve updated draft');
  }

  return result;
}
