import { z } from 'zod';

export const teachingBriefSchema = z.object({
  topic: z.string().min(1),
  audience_level: z.enum(['beginner', 'intermediate', 'advanced']),
  core_question: z.string().min(1),
  ignore_scope: z.string(),
  output_language: z.string().min(1),
  desired_depth: z.enum(['short', 'medium', 'deep']).optional(),
  target_step_count: z.number().int().min(1).max(40).optional(),
  preferred_style: z.string().optional(),
});

export type TeachingBrief = z.infer<typeof teachingBriefSchema>;
