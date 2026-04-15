import * as draftRepo from '../repositories/draft-repository';
import { buildTutorialSteps } from '../tutorial/assembler';
import { buildDraftPreviewPayload } from './build-draft-preview-payload';
import { deriveChapterSections, deriveStepChapterMeta, ensureDraftChapters } from '../tutorial/chapters';

export async function getDraftDetail(id: string, userId: string) {
  return draftRepo.getDraftById(id, userId);
}

export async function listDraftSummariesForDashboard(userId: string) {
  return draftRepo.listDraftSummaries(userId);
}

export async function getDraftPreviewPageData(id: string, userId: string) {
  const draft = await draftRepo.getDraftById(id, userId);
  if (!draft?.tutorialDraft) {
    return null;
  }

  const normalizedDraft = ensureDraftChapters(draft.tutorialDraft as any);
  const steps = await buildTutorialSteps(normalizedDraft);

  const chapters = deriveChapterSections(normalizedDraft.chapters, normalizedDraft.steps);
  const stepChapterMeta = deriveStepChapterMeta(normalizedDraft.chapters, normalizedDraft.steps);

  return {
    draft,
    steps,
    title: draft.tutorialDraft.meta.title,
    fileName: draft.tutorialDraft.meta.fileName,
    intro: draft.tutorialDraft.intro.paragraphs,
    chapters,
    stepChapterMeta,
  };
}

export async function getDraftRemotePreviewPageData(id: string, userId: string) {
  const draft = await draftRepo.getDraftById(id, userId);
  if (!draft?.tutorialDraft) {
    return null;
  }

  return {
    draft,
    title: draft.tutorialDraft.meta.title,
    fetchUrl: `/api/drafts/${id}/payload`,
  };
}

export async function getDraftPreviewPayloadData(id: string, userId: string) {
  const draft = await draftRepo.getDraftById(id, userId);
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
