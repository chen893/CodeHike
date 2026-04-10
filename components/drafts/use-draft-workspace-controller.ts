'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDraftStatusInfo } from '@/lib/draft-status';
import { findFirstInvalidStep } from '@/lib/tutorial/draft-code';
import { createUuid } from '@/lib/utils/uuid';
import type { ClientDraftRecord } from '@/lib/types/client';
import {
  appendDraftStepRequest,
  deleteDraftRequest,
  deleteDraftStepRequest,
  fetchDraft,
  publishDraftRequest,
  regenerateDraftStepRequest,
  replaceDraftStepsRequest,
  updateDraftRequest,
  updateDraftStepRequest,
} from './draft-client';
import { buildGenerationContext, resolveSelectedStepIndex } from './draft-workspace-utils';

interface UseDraftWorkspaceControllerOptions {
  initialDraft: ClientDraftRecord;
}

export function useDraftWorkspaceController({
  initialDraft,
}: UseDraftWorkspaceControllerOptions) {
  const router = useRouter();
  const [draft, setDraft] = useState<ClientDraftRecord>(initialDraft);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [showGenerationProgress, setShowGenerationProgress] = useState(
    !initialDraft.tutorialDraft && initialDraft.generationState === 'running'
  );
  const [generationRunNonce, setGenerationRunNonce] = useState(0);
  const [repairingStartIndex, setRepairingStartIndex] = useState<number | null>(null);

  const hasDraft = !!draft.tutorialDraft;
  const steps = draft.tutorialDraft?.steps ?? [];
  const selectedStep = steps[selectedStepIndex] ?? null;
  const selectedStepId = selectedStep?.id ?? null;
  const status = getDraftStatusInfo(draft);
  const firstInvalidStep = draft.tutorialDraft ? findFirstInvalidStep(draft.tutorialDraft) : null;
  const generationContext = buildGenerationContext(draft);

  function applyDraftUpdate(
    updated: ClientDraftRecord,
    preferredStepId?: string | null,
    fallbackIndex = 0
  ) {
    setDraft(updated);
    const nextSteps = updated.tutorialDraft?.steps ?? [];
    setSelectedStepIndex(resolveSelectedStepIndex(nextSteps, preferredStepId, fallbackIndex));
  }

  async function reloadDraft() {
    const updated = await fetchDraft(draft.id);
    applyDraftUpdate(updated, selectedStepId, selectedStepIndex);
    return updated;
  }

  async function saveMeta(data: {
    title?: string;
    description?: string;
    introParagraphs?: string[];
  }) {
    setSaving(true);
    try {
      const updated = await updateDraftRequest(draft.id, data);
      applyDraftUpdate(updated, selectedStepId, selectedStepIndex);
    } catch (error) {
      console.error('保存元信息失败:', error);
      alert(error instanceof Error ? error.message : '保存元信息失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function saveStep(stepId: string, data: unknown) {
    setSaving(true);
    try {
      const updated = await updateDraftStepRequest(draft.id, stepId, data);
      applyDraftUpdate(updated, stepId, selectedStepIndex);
    } catch (error) {
      console.error('保存步骤失败:', error);
      alert(error instanceof Error ? error.message : '保存步骤失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function appendStep() {
    if (!draft.tutorialDraft) return;

    const num = draft.tutorialDraft.steps.length + 1;
    const newStep = {
      id: createUuid(),
      title: `步骤 ${num}`,
      paragraphs: [''],
      patches: [],
    };

    setSaving(true);
    try {
      const updated = await appendDraftStepRequest(draft.id, newStep);
      const nextSteps = updated.tutorialDraft?.steps ?? [];
      const lastStepId = nextSteps[nextSteps.length - 1]?.id ?? null;
      applyDraftUpdate(updated, lastStepId, Math.max(nextSteps.length - 1, 0));
    } catch (error) {
      console.error('追加步骤失败:', error);
      alert(error instanceof Error ? error.message : '追加步骤失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function regenerateStep(stepId: string, mode: 'prose' | 'step') {
    setSaving(true);
    try {
      const updated = await regenerateDraftStepRequest(draft.id, stepId, { mode });
      applyDraftUpdate(updated, stepId, selectedStepIndex);
    } catch (error) {
      console.error('重新生成失败:', error);
      alert(error instanceof Error ? error.message : '重新生成失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function regenerateFailedTail() {
    if (!draft.tutorialDraft) return;

    const failure = findFirstInvalidStep(draft.tutorialDraft);
    if (!failure) return;

    const confirmation = window.confirm(
      `将从第 ${failure.stepIndex + 1} 步《${failure.stepTitle}》开始，重新生成后续所有步骤代码。继续吗？`
    );
    if (!confirmation) return;

    setSaving(true);
    setRepairingStartIndex(failure.stepIndex);
    setSelectedStepIndex(failure.stepIndex);

    try {
      let latestDraft = draft;

      for (
        let currentIndex = failure.stepIndex;
        currentIndex < latestDraft.tutorialDraft!.steps.length;
        currentIndex++
      ) {
        const currentStep = latestDraft.tutorialDraft!.steps[currentIndex];
        const instruction =
          currentIndex === failure.stepIndex
            ? '前面的步骤最近发生了编排或删除，导致当前 patch 链已经断开。请基于最新的前文代码，重新生成当前步骤及其代码变化，确保从这一刻开始教程重新衔接。'
            : '前面的步骤已经重新生成。请基于最新前文代码继续生成当前步骤，确保 patches、focus 和 marks 都与当前代码精确匹配。';

        latestDraft = await regenerateDraftStepRequest(draft.id, currentStep.id, {
          mode: 'step',
          instruction,
        });
        applyDraftUpdate(latestDraft, currentStep.id, currentIndex);
      }
    } catch (error) {
      console.error('重新生成后续步骤失败:', error);
      alert(error instanceof Error ? error.message : '重新生成后续步骤失败，请重试');
    } finally {
      setRepairingStartIndex(null);
      setSaving(false);
    }
  }

  async function replaceSteps(
    nextSteps: NonNullable<ClientDraftRecord['tutorialDraft']>['steps'],
    activeStepId?: string | null,
    fallbackIndex = selectedStepIndex
  ) {
    setSaving(true);
    try {
      const updated = await replaceDraftStepsRequest(
        draft.id,
        nextSteps.map((step) => step.id)
      );
      applyDraftUpdate(updated, activeStepId, fallbackIndex);
    } catch (error) {
      console.error('更新步骤顺序失败:', error);
      alert(error instanceof Error ? error.message : '更新步骤顺序失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function moveStep(stepId: string, direction: -1 | 1) {
    if (!draft.tutorialDraft) return;

    const currentIndex = draft.tutorialDraft.steps.findIndex((step) => step.id === stepId);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= draft.tutorialDraft.steps.length) return;

    const nextSteps = [...draft.tutorialDraft.steps];
    const [movedStep] = nextSteps.splice(currentIndex, 1);
    nextSteps.splice(nextIndex, 0, movedStep);

    await replaceSteps(nextSteps, stepId, nextIndex);
  }

  async function deleteStep(stepId: string) {
    const step = draft.tutorialDraft?.steps.find((item) => item.id === stepId);
    if (!step) return;

    const confirmed = window.confirm(`确认删除步骤《${step.title}》？后续步骤可能需要重新修复。`);
    if (!confirmed) return;

    setSaving(true);
    try {
      const updated = await deleteDraftStepRequest(draft.id, stepId);
      const deletedIndex = draft.tutorialDraft?.steps.findIndex((item) => item.id === stepId) ?? 0;
      const nextLength = updated.tutorialDraft?.steps?.length ?? 0;
      const fallbackIndex = Math.min(deletedIndex, Math.max(nextLength - 1, 0));
      const preferredStepId =
        selectedStepId && selectedStepId !== stepId ? selectedStepId : null;
      applyDraftUpdate(updated, preferredStepId, fallbackIndex);
    } catch (error) {
      console.error('删除步骤失败:', error);
      alert(error instanceof Error ? error.message : '删除步骤失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft() {
    const title = draft.tutorialDraft?.meta.title || draft.teachingBrief.topic || '新草稿';
    const confirmed = window.confirm(`确认删除草稿《${title}》？此操作无法撤销。`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteDraftRequest(draft.id);
      router.push('/drafts');
    } catch (error) {
      console.error('删除草稿失败:', error);
      alert(error instanceof Error ? error.message : '删除草稿失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    const slug = window.prompt('输入发布 slug（留空自动生成）:');
    if (slug === null) return;

    setSaving(true);
    try {
      const published = await publishDraftRequest(draft.id, slug || undefined);
      router.push(`/${published.slug}`);
    } catch (error) {
      console.error('发布失败:', error);
      alert(error instanceof Error ? error.message : '发布失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  function retryGeneration() {
    setShowGenerationProgress(true);
    setGenerationRunNonce((current) => current + 1);
  }

  async function completeGeneration() {
    try {
      await reloadDraft();
      setShowGenerationProgress(false);
    } catch (error) {
      console.error('刷新草稿失败:', error);
      alert('生成完成，刷新失败，请手动刷新页面');
    }
  }

  function openPreview() {
    router.push(`/drafts/${draft.id}/preview`);
  }

  function openPublishedTutorial() {
    if (draft.publishedSlug) {
      router.push(`/${draft.publishedSlug}`);
    }
  }

  function toggleEditingMeta() {
    setEditingMeta((current) => !current);
  }

  return {
    draft,
    hasDraft,
    steps,
    selectedStep,
    selectedStepIndex,
    saving,
    editingMeta,
    showGenerationProgress,
    generationRunNonce,
    repairingStartIndex,
    status,
    firstInvalidStep,
    generationContext,
    canPublish: saving || draft.syncState === 'stale' || !draft.validationValid,
    canDeleteDraft: saving || draft.generationState === 'running',
    selectStep: setSelectedStepIndex,
    toggleEditingMeta,
    saveMeta,
    saveStep,
    appendStep,
    regenerateStep,
    regenerateFailedTail,
    moveStep,
    deleteStep,
    deleteDraft,
    publishDraft,
    retryGeneration,
    completeGeneration,
    openPreview,
    openPublishedTutorial,
  };
}
