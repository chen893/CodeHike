import { createHash } from 'crypto';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';

export function computeInputHash(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief
): string {
  const data = JSON.stringify({ sourceItems, teachingBrief });
  return createHash('sha256').update(data).digest('hex');
}
