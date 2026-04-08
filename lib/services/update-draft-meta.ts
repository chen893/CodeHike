import * as draftRepo from '../repositories/draft-repository';
import { computeInputHash } from '../utils/hash';
import { validateTutorialDraft } from '../utils/validation';
import type { TeachingBrief } from '../schemas/teaching-brief';

export async function updateDraftMeta(
  id: string,
  data: {
    teachingBrief?: TeachingBrief;
    title?: string;
    description?: string;
    introParagraphs?: string[];
  }
) {
  const draft = await draftRepo.getDraftById(id);
  if (!draft) throw new Error('Draft not found');

  if (data.teachingBrief) {
    const newHash = computeInputHash(draft.sourceItems, data.teachingBrief);
    const syncState =
      draft.tutorialDraftInputHash && newHash !== draft.tutorialDraftInputHash
        ? ('stale' as const)
        : draft.syncState;

    await draftRepo.updateDraft(id, {
      teachingBrief: data.teachingBrief,
      inputHash: newHash,
      syncState,
    });
  }

  if (data.title || data.description || data.introParagraphs) {
    await draftRepo.updateDraftMeta(id, data);
  }

  const result = await draftRepo.getDraftById(id);
  if (!result) throw new Error('Failed to retrieve updated draft');
  return result;
}
