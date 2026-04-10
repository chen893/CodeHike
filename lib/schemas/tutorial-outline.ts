import { z } from 'zod';

const outlineStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  teachingGoal: z.string().min(1),
  conceptIntroduced: z.string().min(1),
  estimatedLocChange: z.number().int().min(1).max(20),
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
});

export type TutorialOutline = z.infer<typeof tutorialOutlineSchema>;
export type OutlineStep = z.infer<typeof outlineStepSchema>;
