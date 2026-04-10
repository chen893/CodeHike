import type { DraftRecord, DraftSummary } from './types/api';
import type { ClientDraftRecord, ClientDraftSummary } from './types/client';

export type StatusVariant = 'draft' | 'generating' | 'done' | 'failed';

export interface DraftStatusInfo {
  label: string;
  variant: StatusVariant;
  detail: string | null;
}

type DraftStatusSource =
  | DraftRecord
  | DraftSummary
  | ClientDraftRecord
  | ClientDraftSummary;

function draftHasTutorial(draft: DraftStatusSource) {
  return 'hasTutorialDraft' in draft ? draft.hasTutorialDraft : !!draft.tutorialDraft;
}

export function getDraftStatusInfo(draft: DraftStatusSource): DraftStatusInfo {
  if (draft.status === 'published') {
    return {
      label: '已发布',
      variant: 'done',
      detail: draft.publishedSlug ? `slug: ${draft.publishedSlug}` : null,
    };
  }

  if (draft.generationState === 'running') {
    return {
      label: '生成中',
      variant: 'generating',
      detail: '正在生成教程内容',
    };
  }

  if (draft.generationState === 'failed') {
    return {
      label: '生成失败',
      variant: 'failed',
      detail: draft.generationErrorMessage,
    };
  }

  if (draft.syncState === 'stale') {
    return {
      label: '已过期',
      variant: 'failed',
      detail: '输入已变更，需要重新生成',
    };
  }

  if (draft.validationErrors.length > 0) {
    return {
      label: '需修复',
      variant: 'failed',
      detail: draft.validationErrors[0] ?? null,
    };
  }

  if (draft.validationValid) {
    return {
      label: '已就绪',
      variant: 'done',
      detail: null,
    };
  }

  if (!draftHasTutorial(draft)) {
    return {
      label: '待生成',
      variant: 'draft',
      detail: null,
    };
  }

  return {
    label: '待校验',
    variant: 'draft',
    detail: null,
  };
}
