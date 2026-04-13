import { createDraftRequestSchema } from '../schemas/api';
import { computeInputHash } from '../utils/hash';
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

  const inputHash = computeInputHash(parsed.sourceItems, parsed.teachingBrief);

  const draft = await draftRepo.createDraft({
    sourceItems: parsed.sourceItems,
    teachingBrief: parsed.teachingBrief,
    inputHash,
    userId: input.userId,
  });

  return draft;
}
