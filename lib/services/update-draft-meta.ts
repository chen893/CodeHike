import { updateDraft } from './update-draft';

export async function updateDraftMeta(
  id: string,
  data: unknown
) {
  return updateDraft(id, data);
}
