import { updateDraft } from './update-draft';

export async function updateDraftMeta(
  id: string,
  data: unknown,
  userId: string
) {
  return updateDraft(id, data, userId);
}
