import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import type { TutorialDraft } from '../schemas/tutorial-draft';

export interface DraftRecord {
  id: string;
  status: 'draft' | 'published';
  sourceItems: SourceItem[];
  teachingBrief: TeachingBrief;
  tutorialDraft: TutorialDraft | null;
  syncState: 'empty' | 'fresh' | 'stale';
  inputHash: string | null;
  tutorialDraftInputHash: string | null;
  generationState: 'idle' | 'running' | 'succeeded' | 'failed';
  generationErrorMessage: string | null;
  generationModel: string | null;
  generationLastAt: Date | null;
  validationValid: boolean;
  validationErrors: string[];
  validationCheckedAt: Date | null;
  publishedSlug: string | null;
  publishedTutorialId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublishedTutorial {
  id: string;
  draftRecordId: string;
  slug: string;
  tutorialDraftSnapshot: TutorialDraft;
  createdAt: Date;
  publishedAt: Date;
}

export interface ApiErrorResponse {
  message: string;
  code: string;
  details?: string[];
}
