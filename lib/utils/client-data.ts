import type { DraftRecord, DraftSummary } from '../types/api';
import type { ClientDraftRecord, ClientDraftSummary } from '../types/client';

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toClientDraftRecord(draft: DraftRecord): ClientDraftRecord {
  return {
    ...draft,
    generationLastAt: serializeDate(draft.generationLastAt),
    validationCheckedAt: serializeDate(draft.validationCheckedAt),
    publishedAt: serializeDate(draft.publishedAt),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export function toClientDraftSummary(draft: DraftSummary): ClientDraftSummary {
  return {
    ...draft,
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export function toClientDraftSummaries(drafts: DraftSummary[]): ClientDraftSummary[] {
  return drafts.map(toClientDraftSummary);
}
