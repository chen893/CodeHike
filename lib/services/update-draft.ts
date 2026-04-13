import * as draftRepo from '../repositories/draft-repository';
import { updateDraftRequestSchema } from '../schemas/api';
import { computeInputHash } from '../utils/hash';

export async function updateDraft(id: string, input: unknown, userId: string) {
  const parsed = updateDraftRequestSchema.parse(input);

  const draft = await draftRepo.getDraftById(id, userId);
  if (!draft) {
    throw new Error('not found: Draft not found');
  }

  if (parsed.teachingBrief) {
    const newHash = computeInputHash(draft.sourceItems, parsed.teachingBrief);
    const syncState =
      draft.tutorialDraftInputHash && newHash !== draft.tutorialDraftInputHash
        ? ('stale' as const)
        : draft.syncState;

    await draftRepo.updateDraft(id, {
      teachingBrief: parsed.teachingBrief,
      inputHash: newHash,
      syncState,
    });
  }

  if (parsed.title || parsed.description || parsed.introParagraphs) {
    await draftRepo.updateDraftMeta(id, {
      title: parsed.title,
      description: parsed.description,
      introParagraphs: parsed.introParagraphs,
    });
  }

  const updated = await draftRepo.getDraftById(id);
  if (!updated) {
    throw new Error('not found: Draft not found');
  }

  return updated;
}
