import { z } from 'zod';

export const chapterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  order: z.number().int().min(0),
});

export type Chapter = z.infer<typeof chapterSchema>;
