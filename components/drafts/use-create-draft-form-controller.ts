'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SourceItem, TeachingBrief } from '@/lib/schemas/index';
import { AVAILABLE_MODELS } from '@/lib/schemas/model-config';
import { createUuid } from '@/lib/utils/uuid';
import { createDraftRequest } from './draft-client';
import {
  createSourceItemDraft,
  type SourceItemDraft,
} from './create-draft-form-utils';

export function useCreateDraftFormController() {
  const router = useRouter();
  
  // Create the initial item outside of state first to use it for both
  const [initialItem] = useState(() => createSourceItemDraft());
  const [sourceItems, setSourceItems] = useState<SourceItemDraft[]>([initialItem]);
  const [activeSourceItemId, setActiveSourceItemId] = useState<string>(initialItem.id);
  const [brief, setBrief] = useState<TeachingBrief>({
    topic: '',
    audience_level: 'beginner',
    core_question: '',
    ignore_scope: '',
    output_language: '中文',
  });
  const [modelId, setModelId] = useState<string>(AVAILABLE_MODELS[0]?.id ?? '');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const submissionIdempotencyKeyRef = useRef<string | null>(null);

  function updateSourceItem(id: string, patch: Partial<SourceItemDraft>) {
    setSourceItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function addSourceItem() {
    const newItem = createSourceItemDraft();
    setSourceItems((current) => [...current, newItem]);
    setActiveSourceItemId(newItem.id);
  }

  function removeSourceItem(id: string) {
    setSourceItems((current) => {
      if (current.length <= 1) return current;
      const index = current.findIndex((item) => item.id === id);
      const newItems = current.filter((item) => item.id !== id);
      
      if (activeSourceItemId === id) {
        const nextIndex = Math.max(0, index - 1);
        setActiveSourceItemId(newItems[nextIndex].id);
      }
      
      return newItems;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    setError(null);

    const normalizedItems = sourceItems.filter((item) => item.content.trim());

    if (normalizedItems.length === 0 || !brief.topic.trim() || !brief.core_question.trim()) {
      setError('请至少填写一个源码文件，以及主题和核心问题');
      submittingRef.current = false;
      return;
    }

    try {
      setGenerating(true);
      const idempotencyKey =
        submissionIdempotencyKeyRef.current ?? createUuid();
      submissionIdempotencyKeyRef.current = idempotencyKey;

      const payload: SourceItem[] = normalizedItems.map((item, index) => ({
        id: item.id,
        kind: 'snippet',
        label: item.label.trim() || `file-${index + 1}`,
        content: item.content,
        language: item.language,
      }));

      const draft = await createDraftRequest({
        sourceItems: payload,
        teachingBrief: brief,
      }, { idempotencyKey });

      const params = new URLSearchParams({ generate: '1' });
      if (modelId) params.set('modelId', modelId);
      router.push(`/drafts/${draft.id}?${params.toString()}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : '发生错误');
      setGenerating(false);
      submittingRef.current = false;
      submissionIdempotencyKeyRef.current = null;
    }
  }

  return {
    sourceItems,
    activeSourceItemId,
    setActiveSourceItemId,
    brief,
    modelId,
    setModelId,
    generating,
    error,
    setBrief,
    handleSubmit,
    updateSourceItem,
    addSourceItem,
    removeSourceItem,
    setSourceItems,
  };
}
