import { createDraftRequestSchema } from '../schemas/api';
import { computeInputHash } from '../utils/hash';
import { assertSourceImportLimits } from '../utils/source-import-limits';
import * as draftRepo from '../repositories/draft-repository';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import type { DraftRecord } from '../types/api';

export async function createDraft(input: {
  sourceItems: SourceItem[];
  teachingBrief: TeachingBrief;
  userId: string;
}): Promise<DraftRecord> {
  const parsed = createDraftRequestSchema.parse(input);
  assertSourceImportLimits(parsed.sourceItems);

  const inputHash = computeInputHash(parsed.sourceItems, parsed.teachingBrief);

  // Deduplicate: if a draft with the same inputHash was created by this user
  // within the last hour, return it instead of creating a new one.
  const existing = await draftRepo.findRecentDraftByInputHash(input.userId, inputHash);
  if (existing) {
    return existing;
  }

  const draft = await draftRepo.createDraft({
    sourceItems: parsed.sourceItems,
    teachingBrief: parsed.teachingBrief,
    inputHash,
    userId: input.userId,
  });

  return draft;
}
