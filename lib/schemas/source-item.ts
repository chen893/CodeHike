import { z } from 'zod';

export const sourceItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal('snippet'),
  label: z.string().min(1),
  content: z.string().min(1),
  language: z.string().optional(),
});

export type SourceItem = z.infer<typeof sourceItemSchema>;
