import * as draftRepo from '../repositories/draft-repository';

export async function deleteDraft(id: string) {
  const draft = await draftRepo.getDraftById(id);

  if (!draft) {
    throw new Error('Draft not found');
  }

  if (draft.generationState === 'running') {
    throw new Error('conflict: Draft generation is still running');
  }

  if (draft.status === 'published' || draft.publishedTutorialId) {
    throw new Error('conflict: Published drafts cannot be deleted');
  }

  const deleted = await draftRepo.deleteDraft(id);
  if (!deleted) {
    throw new Error('Failed to delete draft');
  }

  return { ok: true };
}
