import { z } from 'zod';
import { chapterSchema } from './chapter';

export const contentPatchSchema = z.object({
  find: z.string().min(1),
  replace: z.string(),
  file: z.string().min(1).optional(),
});

export const contentRangeSchema = z.object({
  find: z.string().min(1),
  file: z.string().min(1).optional(),
});

export const contentMarkSchema = z.object({
  find: z.string().min(1),
  color: z.string().min(1),
  file: z.string().min(1).optional(),
});

export const tutorialStepSchema = z.object({
  id: z.string().min(1),
  chapterId: z.string().min(1),
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  lead: z.string().optional(),
  paragraphs: z.array(z.string()),
  patches: z.array(contentPatchSchema).optional(),
  focus: contentRangeSchema.nullable().optional(),
  marks: z.array(contentMarkSchema).optional(),
  // v3.1: multi-phase generation metadata (optional, backward compatible)
  teachingGoal: z.string().optional(),
  conceptIntroduced: z.string().optional(),
});

export const tutorialDraftSchema = z.object({
  meta: z.object({
    title: z.string().min(1),
    lang: z.string().min(1).optional(),
    fileName: z.string().min(1).optional(),
    description: z.string().min(1),
  }),
  intro: z.object({
    paragraphs: z.array(z.string()),
  }),
  baseCode: z.union([z.string().min(1), z.record(z.string(), z.string().min(1))]),
  chapters: z.array(chapterSchema).min(1),
  steps: z.array(tutorialStepSchema).min(1),
});

export type TutorialDraft = z.infer<typeof tutorialDraftSchema>;
export type TutorialStep = z.infer<typeof tutorialStepSchema>;
export type ContentPatch = z.infer<typeof contentPatchSchema>;
export type ContentRange = z.infer<typeof contentRangeSchema>;
export type ContentMark = z.infer<typeof contentMarkSchema>;

/**
 * Legacy schema for parsing old drafts without chapters.
 * Use ensureDraftChapters() to migrate old data to the new format.
 */
export const legacyTutorialStepSchema = tutorialStepSchema.extend({
  chapterId: z.string().min(1).optional(),
});

export const legacyTutorialDraftSchema = z.object({
  meta: tutorialDraftSchema.shape.meta,
  intro: tutorialDraftSchema.shape.intro,
  baseCode: tutorialDraftSchema.shape.baseCode,
  chapters: z.array(chapterSchema).min(1).optional(),
  steps: z.array(legacyTutorialStepSchema).min(1),
});
