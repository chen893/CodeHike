import * as draftRepo from '../repositories/draft-repository';
import { ensureDraftChapters, normalizeChapterOrders } from '../tutorial/chapters';
import { validateTutorialDraft } from '../utils/validation';
import { createUuid } from '../utils/uuid';
import type { Chapter } from '../schemas/chapter';
import type { TutorialDraft } from '../schemas/tutorial-draft';

/**
 * Add a new empty chapter to a draft.
 * The new chapter gets order = max existing order + 1.
 * Does NOT move any steps.
 */
export async function addChapter(
  draftId: string,
  userId: string,
  data?: { title?: string; description?: string }
) {
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft || !draft.tutorialDraft) {
    throw new Error('Draft not found');
  }

  // Ensure legacy drafts have chapters
  const td: TutorialDraft = ensureDraftChapters(draft.tutorialDraft as any);

  const maxOrder = td.chapters.reduce(
    (max, ch) => Math.max(max, ch.order),
    -1
  );
  const chapterNumber = td.chapters.length + 1;

  const newChapter: Chapter = {
    id: createUuid(),
    title: data?.title || `Chapter ${chapterNumber}`,
    description: data?.description,
    order: maxOrder + 1,
  };

  const updatedTd: TutorialDraft = {
    ...td,
    chapters: [...td.chapters, newChapter],
  };

  await draftRepo.updateDraftTutorial(draftId, updatedTd, {
    inputHash: draft.tutorialDraftInputHash,
    model: draft.generationModel ?? 'unknown',
  });

  const validation = await validateTutorialDraft(updatedTd);
  await draftRepo.updateDraftValidation(
    draftId,
    validation.valid,
    validation.errors
  );

  const result = await draftRepo.getDraftById(draftId);
  if (!result) throw new Error('Failed to retrieve updated draft');
  return result;
}

/**
 * Update a chapter's title/description.
 */
export async function updateChapter(
  draftId: string,
  chapterId: string,
  userId: string,
  data: { title?: string; description?: string }
) {
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft || !draft.tutorialDraft) {
    throw new Error('Draft not found');
  }

  const td: TutorialDraft = ensureDraftChapters(draft.tutorialDraft as any);

  const chapterIndex = td.chapters.findIndex((ch) => ch.id === chapterId);
  if (chapterIndex === -1) {
    throw new Error('validation: Chapter not found');
  }

  const updatedChapters = td.chapters.map((ch, i) =>
    i === chapterIndex
      ? {
          ...ch,
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && { description: data.description }),
        }
      : ch
  );

  const updatedTd: TutorialDraft = { ...td, chapters: updatedChapters };

  await draftRepo.updateDraftTutorial(draftId, updatedTd, {
    inputHash: draft.tutorialDraftInputHash,
    model: draft.generationModel ?? 'unknown',
  });

  const validation = await validateTutorialDraft(updatedTd);
  await draftRepo.updateDraftValidation(
    draftId,
    validation.valid,
    validation.errors
  );

  const result = await draftRepo.getDraftById(draftId);
  if (!result) throw new Error('Failed to retrieve updated draft');
  return result;
}

/**
 * Delete a chapter and move its steps to another chapter.
 */
export async function deleteChapter(
  draftId: string,
  chapterId: string,
  userId: string,
  moveStepsToChapterId: string
) {
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft || !draft.tutorialDraft) {
    throw new Error('Draft not found');
  }

  const td: TutorialDraft = ensureDraftChapters(draft.tutorialDraft as any);

  const chapterToDelete = td.chapters.find((ch) => ch.id === chapterId);
  if (!chapterToDelete) {
    throw new Error('validation: Chapter to delete not found');
  }

  const targetChapter = td.chapters.find((ch) => ch.id === moveStepsToChapterId);
  if (!targetChapter) {
    throw new Error('validation: Target chapter not found');
  }

  if (chapterId === moveStepsToChapterId) {
    throw new Error('validation: Cannot move steps to the chapter being deleted');
  }

  // Prevent deleting the last chapter
  if (td.chapters.length <= 1) {
    throw new Error('validation: Cannot delete the last chapter');
  }

  // Build the new step order: all steps in original relative order, but reordered
  // so that steps now assigned to the same chapter are contiguous.
  // Strategy: group steps by their new chapterId, preserving order within each group,
  // then lay groups out in the order determined by chapter order.
  const remainingChapterIds = td.chapters
    .filter((ch) => ch.id !== chapterId)
    .sort((a, b) => a.order - b.order)
    .map((ch) => ch.id);

  // Collect steps per chapter (with migrated steps merged into target)
  const stepsByChapter = new Map<string, typeof td.steps>();
  for (const cid of remainingChapterIds) {
    stepsByChapter.set(cid, []);
  }
  for (const step of td.steps) {
    // Determine target chapter: deleted chapter -> target; orphan -> target; otherwise keep
    let targetCid = step.chapterId;
    if (step.chapterId === chapterId || !stepsByChapter.has(step.chapterId)) {
      targetCid = moveStepsToChapterId;
    }
    const bucket = stepsByChapter.get(targetCid);
    if (bucket) {
      bucket.push({ ...step, chapterId: targetCid });
    }
  }

  // Flatten in chapter order
  const reorderedSteps = remainingChapterIds.flatMap(
    (cid) => stepsByChapter.get(cid) ?? []
  );

  // Remove the deleted chapter and normalize orders
  const remainingChapters = td.chapters.filter((ch) => ch.id !== chapterId);
  const normalizedChapters = normalizeChapterOrders(remainingChapters);

  const updatedTd: TutorialDraft = {
    ...td,
    chapters: normalizedChapters,
    steps: reorderedSteps,
  };

  await draftRepo.updateDraftTutorial(draftId, updatedTd, {
    inputHash: draft.tutorialDraftInputHash,
    model: draft.generationModel ?? 'unknown',
  });

  const validation = await validateTutorialDraft(updatedTd);
  await draftRepo.updateDraftValidation(
    draftId,
    validation.valid,
    validation.errors
  );

  const result = await draftRepo.getDraftById(draftId);
  if (!result) throw new Error('Failed to retrieve updated draft');
  return result;
}
