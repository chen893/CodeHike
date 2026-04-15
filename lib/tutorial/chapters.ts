import type { Chapter } from '../schemas/chapter';
import type { TutorialDraft, TutorialStep } from '../schemas/tutorial-draft';

/** Fallback chapter ID used when a draft has no explicit chapters. */
export const DEFAULT_CHAPTER_ID = 'default';

// ── Derived types ──

export interface ChapterSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  startIndex: number;   // first step index in steps[]
  endIndex: number;     // last step index in steps[]
  stepIds: string[];
  stepCount: number;
}

export interface StepChapterMeta {
  chapterId: string;
  chapterTitle: string;
  chapterDescription?: string;
  chapterIndex: number;
  totalChapters: number;
  stepIndexInChapter: number;
  totalStepsInChapter: number;
}

// ── Helper functions ──

/**
 * Groups steps by chapterId in steps[] order and computes indices.
 * Chapters are sorted by `order` ascending.
 * Steps in the same chapter MUST be contiguous in steps[].
 */
export function deriveChapterSections(
  chapters: Chapter[],
  steps: TutorialStep[]
): ChapterSection[] {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);

  // Build a map of chapterId -> array of { step, index }
  const chapterBuckets = new Map<string, { step: TutorialStep; index: number }[]>();
  for (const ch of sorted) {
    chapterBuckets.set(ch.id, []);
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const bucket = chapterBuckets.get(step.chapterId);
    if (bucket) {
      bucket.push({ step, index: i });
    }
  }

  return sorted.map((ch) => {
    const entries = chapterBuckets.get(ch.id)!;
    const stepIds = entries.map((e) => e.step.id);
    const startIndex = entries.length > 0 ? entries[0].index : -1;
    const endIndex = entries.length > 0 ? entries[entries.length - 1].index : -1;

    return {
      id: ch.id,
      title: ch.title,
      description: ch.description,
      order: ch.order,
      startIndex,
      endIndex,
      stepIds,
      stepCount: entries.length,
    };
  });
}

/**
 * Returns per-step chapter metadata, keyed by step id.
 */
export function deriveStepChapterMeta(
  chapters: Chapter[],
  steps: TutorialStep[]
): Record<string, StepChapterMeta> {
  const sections = deriveChapterSections(chapters, steps);
  const chapterLookup = new Map<string, Chapter>();
  for (const ch of chapters) {
    chapterLookup.set(ch.id, ch);
  }

  const result: Record<string, StepChapterMeta> = {};

  for (let ci = 0; ci < sections.length; ci++) {
    const section = sections[ci];
    const chapter = chapterLookup.get(section.id)!;

    for (let si = 0; si < section.stepIds.length; si++) {
      const stepId = section.stepIds[si];
      result[stepId] = {
        chapterId: section.id,
        chapterTitle: chapter.title,
        chapterDescription: chapter.description,
        chapterIndex: ci,
        totalChapters: sections.length,
        stepIndexInChapter: si,
        totalStepsInChapter: section.stepCount,
      };
    }
  }

  return result;
}

/**
 * Ensure chapter orders are normalized to 0, 1, 2, ...
 * Returns a new array with corrected orders.
 */
export function normalizeChapterOrders(chapters: Chapter[]): Chapter[] {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  return sorted.map((ch, i) => ({
    ...ch,
    order: i,
  }));
}

/**
 * Create a default chapter with order 0.
 */
export function createDefaultChapter(
  id: string = DEFAULT_CHAPTER_ID,
  title: string = 'Chapter 1'
): Chapter {
  return {
    id,
    title,
    order: 0,
  };
}

/**
 * Migration function: ensures a draft has chapters and all steps have chapterId.
 * If draft has no chapters, creates a default chapter and assigns all steps to it.
 * If steps have no chapterId, assigns them to the first chapter.
 * Returns a new draft object (does not mutate the input).
 */
export function ensureDraftChapters(draft: {
  meta: TutorialDraft['meta'];
  intro: TutorialDraft['intro'];
  baseCode: TutorialDraft['baseCode'];
  chapters?: Chapter[];
  steps: (TutorialStep & { chapterId?: string })[];
}): TutorialDraft {
  let chapters = draft.chapters && draft.chapters.length > 0
    ? [...draft.chapters]
    : [createDefaultChapter()];

  const defaultChapterId = chapters[0].id;

  const steps = draft.steps.map((step) => ({
    ...step,
    chapterId: step.chapterId || defaultChapterId,
  }));

  return {
    meta: draft.meta,
    intro: draft.intro,
    baseCode: draft.baseCode,
    chapters,
    steps,
  } as TutorialDraft;
}

/**
 * Validate the chapter structure of a draft.
 * Checks:
 *  - Every step has a valid chapterId (exists in chapters)
 *  - Steps in the same chapter are contiguous in steps[]
 *  - No duplicate chapter ids
 *  - No duplicate chapter orders (after normalization)
 */
export function validateChapterStructure(
  chapters: Chapter[],
  steps: TutorialStep[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for duplicate chapter ids
  const chapterIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const ch of chapters) {
    if (chapterIds.has(ch.id)) {
      duplicateIds.add(ch.id);
    }
    chapterIds.add(ch.id);
  }
  for (const dupId of duplicateIds) {
    errors.push(`Duplicate chapter id: "${dupId}"`);
  }

  // Check for duplicate chapter orders
  const orders = new Map<number, string[]>();
  for (const ch of chapters) {
    const existing = orders.get(ch.order) || [];
    existing.push(ch.id);
    orders.set(ch.order, existing);
  }
  for (const [order, ids] of orders) {
    if (ids.length > 1) {
      errors.push(`Duplicate chapter order ${order}: [${ids.join(', ')}]`);
    }
  }

  // Build valid chapter id set
  const validChapterIds = new Set(chapters.map((ch) => ch.id));

  // Check every step has a valid chapterId
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i].chapterId) {
      errors.push(`Step at index ${i} ("${steps[i].id}") has no chapterId`);
    } else if (!validChapterIds.has(steps[i].chapterId)) {
      errors.push(`Step at index ${i} ("${steps[i].id}") references unknown chapterId "${steps[i].chapterId}"`);
    }
  }

  // Check contiguity: steps in the same chapter must be contiguous in steps[]
  const seenChapters = new Map<string, number>(); // chapterId -> last seen index
  for (let i = 0; i < steps.length; i++) {
    const cid = steps[i].chapterId;
    if (!cid || !validChapterIds.has(cid)) continue; // already reported

    const lastIndex = seenChapters.get(cid);
    if (lastIndex !== undefined) {
      // Check if any other chapter appeared between lastIndex and i
      for (const [otherCid, otherLastIdx] of seenChapters) {
        if (otherCid !== cid && otherLastIdx > lastIndex) {
          errors.push(
            `Chapter "${cid}" has non-contiguous steps: step at index ${lastIndex} then index ${i}, but chapter "${otherCid}" appears in between`
          );
          break;
        }
      }
    }
    seenChapters.set(cid, i);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
