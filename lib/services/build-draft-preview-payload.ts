import { buildTutorialPayload } from '../tutorial-payload';
import type { TutorialDraft } from '../schemas/tutorial-draft';

export async function buildDraftPreviewPayload(tutorialDraft: TutorialDraft) {
  return buildTutorialPayload(tutorialDraft as any);
}
