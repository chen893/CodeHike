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
  // Agent loop metrics (optional -- present when agent loop was used)
  repairCount: z.number().optional(),
  firstPassRate: z.number().optional(),
  degradedStepCount: z.number().optional(),
  compressionCount: z.number().optional(),
  avgRepairAttempts: z.number().optional(),
  replanCount: z.number().optional(),
});

export type GenerationQuality = z.infer<typeof generationQualitySchema>;
