import { z } from 'zod';
import { sourceItemSchema } from './source-item';
import { teachingBriefSchema } from './teaching-brief';
import { tutorialStepSchema } from './tutorial-draft';

// POST /api/drafts
export const createDraftRequestSchema = z.object({
  sourceItems: z.array(sourceItemSchema).min(1),
  teachingBrief: teachingBriefSchema,
});

// PATCH /api/drafts/[id]
export const updateDraftRequestSchema = z.object({
  teachingBrief: teachingBriefSchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  introParagraphs: z.array(z.string()).optional(),
});

// POST /api/drafts/[id]/steps
export const appendStepRequestSchema = z.object({
  step: tutorialStepSchema,
});

// PATCH /api/drafts/[id]/steps/[stepId]
export const updateStepRequestSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  lead: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
});

// POST /api/drafts/[id]/steps/[stepId]/regenerate
export const regenerateStepRequestSchema = z.object({
  mode: z.enum(['prose', 'step']),
  instruction: z.string().optional(),
});

// POST /api/drafts/[id]/publish
export const publishRequestSchema = z.object({
  slug: z.string().optional(),
});
