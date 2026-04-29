import type { Chapter } from '../schemas/chapter';
import type {
  OutlineStep,
  TutorialOutline,
} from '../schemas/tutorial-outline';
import type { TutorialStep } from '../schemas/tutorial-draft';
import {
  createDefaultChapter,
  normalizeChapterOrders,
  validateChapterStructure,
} from './chapters';

export interface NormalizedOutline
  extends Omit<TutorialOutline, 'chapters' | 'steps'> {
  chapters: Chapter[];
  steps: Array<OutlineStep & { chapterId: string }>;
}

export function ensureOutlineChapters(
  outline: TutorialOutline
): NormalizedOutline {
  const chapters =
    outline.chapters && outline.chapters.length > 0
      ? normalizeChapterOrders(outline.chapters)
      : [createDefaultChapter()];

  const defaultChapterId = chapters[0]?.id ?? createDefaultChapter().id;

  return {
    ...outline,
    chapters,
    steps: outline.steps.map((step) => ({
      ...step,
      chapterId: step.chapterId || defaultChapterId,
    })),
  };
}

export function validateOutlineChapterStructure(
  outline: TutorialOutline
): { valid: boolean; errors: string[] } {
  const normalized = ensureOutlineChapters(outline);

  return validateChapterStructure(
    normalized.chapters,
    normalized.steps as unknown as TutorialStep[]
  );
}
