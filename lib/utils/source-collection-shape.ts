import type { SourceItem } from '../schemas/source-item';

export type SourceCollectionMode =
  | 'single_file'
  | 'codebase_files'
  | 'progressive_snapshots';

export interface SourceCollectionShape {
  mode: SourceCollectionMode;
  orderedLabels: string[];
  progressiveLabels: string[];
  reasons: string[];
}

const PROGRESSIVE_LABEL_RE =
  /^(?:s|step|part|chapter)[\s._-]*(\d{1,3})(?:$|[/\\._-])/i;

function parseProgressiveIndex(label: string): number | null {
  const fileName = label.split(/[/\\]/).pop() ?? label;
  const match = fileName.match(PROGRESSIVE_LABEL_RE);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : null;
}

function hasMostlyIncreasingSequence(indexes: number[]): boolean {
  if (indexes.length < 3) return false;
  for (let i = 1; i < indexes.length; i++) {
    if (indexes[i] <= indexes[i - 1]) return false;
  }
  return true;
}

export function analyzeSourceCollectionShape(
  sourceItems: Pick<SourceItem, 'label'>[],
): SourceCollectionShape {
  const labels = sourceItems.map((item) => item.label);
  if (labels.length <= 1) {
    return {
      mode: 'single_file',
      orderedLabels: labels,
      progressiveLabels: labels,
      reasons: ['Only one source item was provided.'],
    };
  }

  const indexed = labels
    .map((label) => ({ label, index: parseProgressiveIndex(label) }))
    .filter((item) => item.index !== null)
    .map((item) => ({ label: item.label, index: item.index as number }));

  const indexedCoverage = labels.length > 0 ? indexed.length / labels.length : 0;
  const dedupedIndexes = [...new Set(indexed.map((item) => item.index))];
  const sortedIndexed = [...indexed].sort((a, b) => a.index - b.index);
  const orderedLabels = sortedIndexed.map((item) => item.label);
  const originalOrderIndexes = indexed.map((item) => item.index);
  const isProgressive =
    indexed.length >= 3 &&
    indexedCoverage >= 0.6 &&
    dedupedIndexes.length === indexed.length &&
    hasMostlyIncreasingSequence(originalOrderIndexes);

  if (isProgressive) {
    return {
      mode: 'progressive_snapshots',
      orderedLabels,
      progressiveLabels: orderedLabels,
      reasons: [
        `Detected numbered milestone labels in ${indexed.length}/${labels.length} source items.`,
        `Milestone labels form a strictly increasing sequence: ${orderedLabels.join(', ')}.`,
      ],
    };
  }

  return {
    mode: 'codebase_files',
    orderedLabels: labels,
    progressiveLabels: [],
    reasons: ['Source items look like a regular multi-file codebase rather than numbered snapshots.'],
  };
}
