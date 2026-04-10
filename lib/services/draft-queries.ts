import * as draftRepo from '../repositories/draft-repository';
import { buildTutorialSteps } from '../tutorial/assembler';
import { buildDraftPreviewPayload } from './build-draft-preview-payload';

export async function getDraftDetail(id: string) {
  return draftRepo.getDraftById(id);
}

export async function listDraftSummariesForDashboard() {
  return draftRepo.listDraftSummaries();
}

export async function getDraftPreviewPageData(id: string) {
  const draft = await draftRepo.getDraftById(id);
  if (!draft?.tutorialDraft) {
    return null;
  }

  const steps = await buildTutorialSteps(draft.tutorialDraft as any);

  return {
    draft,
    steps,
    title: draft.tutorialDraft.meta.title,
    fileName: draft.tutorialDraft.meta.fileName,
    intro: draft.tutorialDraft.intro.paragraphs,
  };
}

export async function getDraftRemotePreviewPageData(id: string) {
  const draft = await draftRepo.getDraftById(id);
  if (!draft?.tutorialDraft) {
    return null;
  }

  return {
    draft,
    title: draft.tutorialDraft.meta.title,
    fetchUrl: `/api/drafts/${id}/payload`,
  };
}

export async function getDraftPreviewPayloadData(id: string) {
  const draft = await draftRepo.getDraftById(id);
  if (!draft) {
    return null;
  }

  if (!draft.tutorialDraft) {
    return {
      draft,
      payload: null,
    };
  }

  const payload = await buildDraftPreviewPayload(draft.tutorialDraft);

  return {
    draft,
    payload,
  };
}
