/**
 * Zod schemas for tag-related API validation.
 */

import { z } from 'zod';

/** Filter tags by tagType classification dimension. */
export const tagTypeFilterSchema = z.object({
  tagType: z.enum(['technology', 'category', 'level']).optional(),
});

/** Request body for merging two tags. */
export const tagMergeRequestSchema = z.object({
  sourceTagId: z.string().uuid(),
  targetTagId: z.string().uuid(),
});

/** Request body for following/unfollowing a tag. */
export const followTagSchema = z.object({
  tagId: z.string().uuid(),
});
