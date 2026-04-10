import type { ApiErrorResponse, DraftRecord, DraftSummary } from './api';

export interface ClientDraftRecord
  extends Omit<
    DraftRecord,
    'generationLastAt' | 'validationCheckedAt' | 'publishedAt' | 'createdAt' | 'updatedAt'
  > {
  generationLastAt: string | null;
  validationCheckedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientDraftSummary extends Omit<DraftSummary, 'updatedAt'> {
  updatedAt: string;
}

export interface CreateDraftResponse {
  id: string;
}

export interface PublishDraftResponse {
  slug: string;
}

export type ClientApiErrorResponse = ApiErrorResponse;

export interface ClientTutorialPayload {
  title: string;
  description: string;
  fileName: string;
  intro: string[];
  steps: unknown[];
}
