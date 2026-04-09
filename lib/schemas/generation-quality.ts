import { z } from 'zod';

export const generationQualitySchema = z.object({
  stepCount: z.number(),
  avgPatchesPerStep: z.number(),
  avgLocChangePerStep: z.number(),
  avgParagraphsPerStep: z.number(),
  proseToCodeRatio: z.number(),
  patchValidationPassRate: z.number(),
  outlineToFillConsistency: z.number(),
  retryCount: z.number(),
  totalGenerationTimeMs: z.number(),
});

export type GenerationQuality = z.infer<typeof generationQualitySchema>;
