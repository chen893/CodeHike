'use client';

import { useState } from 'react';
import type { ClientDraftSummary } from '@/lib/types/client';
import { deleteDraftRequest } from './draft-client';

interface UseDraftsPageControllerOptions {
  initialDrafts: ClientDraftSummary[];
}

export function useDraftsPageController({
  initialDrafts,
}: UseDraftsPageControllerOptions) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(draft: ClientDraftSummary) {
    const confirmed = window.confirm(`确认删除草稿《${draft.title}》？此操作无法撤销。`);
    if (!confirmed) return;

    setDeletingId(draft.id);

    try {
      await deleteDraftRequest(draft.id);
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除草稿失败';
      alert(message);
    } finally {
      setDeletingId(null);
    }
  }

  return {
    drafts,
    deletingId,
    handleDelete,
  };
}
