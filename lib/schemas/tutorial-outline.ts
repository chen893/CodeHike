import { z } from 'zod';
import { chapterSchema } from './chapter';

const outlineStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  teachingGoal: z.string().min(1),
  conceptIntroduced: z.string().min(1),
  estimatedLocChange: z.number().int().min(0).max(20),
  /** Files that this step will produce patches/focus/marks for (usually 1-3). */
  targetFiles: z.array(z.string()).optional(),
  /** Files needed for understanding dependencies but typically not modified (usually 0-5). */
  contextFiles: z.array(z.string()).optional(),
  /** Chapter this step belongs to. Omit for flat (single-chapter) outlines. */
  chapterId: z.string().min(1).optional(),
});

export const tutorialOutlineSchema = z.object({
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
  steps: z.array(outlineStepSchema).min(1),
  /** Chapter definitions for multi-chapter outlines. Omit for flat outlines. */
  chapters: z.array(chapterSchema).optional(),
});

export type TutorialOutline = z.infer<typeof tutorialOutlineSchema>;
export type OutlineStep = z.infer<typeof outlineStepSchema>;
