'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { DraftRecord } from '@/lib/types/api';
import { withBasePath } from '@/lib/base-path';
import { getDraftStatusInfo } from '@/lib/draft-status';
import { findFirstInvalidStep } from '@/lib/tutorial-draft-code';
import { createUuid } from '@/lib/utils/uuid';
import { StepList } from './step-list';
import { StepEditor } from './step-editor';
import { DraftMetaEditor } from './draft-meta-editor';
import { GenerationProgress, type GenerationContext } from './generation-progress';
import { Badge } from '@/components/ui/badge';

interface DraftWorkspaceProps {
  draft: DraftRecord;
}

const audienceLabels: Record<DraftRecord['teachingBrief']['audience_level'], string> = {
  beginner: '初学者',
  intermediate: '中级',
  advanced: '高级',
};

const languageLabels: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
};

const buttonBase =
  'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10';
const primaryButton = `${buttonBase} bg-slate-900 text-slate-50 hover:bg-slate-900/90 shadow-sm`;
const secondaryButton = `${buttonBase} border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50`;
const dangerButton = `${buttonBase} border border-slate-200 bg-white text-red-600 hover:bg-red-50 hover:border-red-200 shadow-sm`;
const sectionCard =
  'rounded-xl border border-slate-200 bg-white p-6 shadow-sm';

function countLines(value: string) {
  const normalized = value.replace(/\n$/, '');
  return normalized ? normalized.split(/\r?\n/).length : 0;
}

function summarizeLanguages(items: DraftRecord['sourceItems']) {
  const unique = [
    ...new Set(items.map((item) => languageLabels[item.language || ''] || item.language || '未知')),
  ];

  if (unique.length === 0) return '未知';
  if (unique.length <= 2) return unique.join(' / ');
  return `${unique[0]} +${unique.length - 1}`;
}

function buildGenerationContext(draft: DraftRecord): GenerationContext {
  const activeSourceItems = draft.sourceItems.filter((item) => item.content.trim());
  const totalLineCount = Math.max(
    1,
    activeSourceItems.reduce((sum, item) => sum + countLines(item.content), 0)
  );

  return {
    topic: draft.teachingBrief.topic.trim(),
    sourceSummary:
      activeSourceItems.length <= 1
        ? activeSourceItems[0]?.label?.trim() || 'main'
        : `${activeSourceItems.length} 个源码文件`,
    sourceCount: Math.max(activeSourceItems.length, 1),
    sourceLanguageSummary: summarizeLanguages(
      activeSourceItems.length > 0 ? activeSourceItems : draft.sourceItems
    ),
    outputLanguage: draft.teachingBrief.output_language,
    audienceLabel: audienceLabels[draft.teachingBrief.audience_level],
    coreQuestion: draft.teachingBrief.core_question.trim(),
    codeLineCount: totalLineCount,
  };
}

export function DraftWorkspace({ draft: initialDraft }: DraftWorkspaceProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftRecord>(initialDraft);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showGenerationProgress, setShowGenerationProgress] = useState(
    !initialDraft.tutorialDraft && initialDraft.generationState === 'running'
  );
  const [generationRunNonce, setGenerationRunNonce] = useState(0);
  const [repairingStartIndex, setRepairingStartIndex] = useState<number | null>(null);

  const hasDraft = !!draft.tutorialDraft;
  const steps = draft.tutorialDraft?.steps ?? [];
  const selectedStepId = steps[selectedStepIndex]?.id ?? null;
  const status = getDraftStatusInfo(draft);
  const firstInvalidStep = draft.tutorialDraft
    ? findFirstInvalidStep(draft.tutorialDraft)
    : null;
  const generationContext = buildGenerationContext(draft);

  function applyDraftUpdate(
    updated: DraftRecord,
    preferredStepId?: string | null,
    fallbackIndex = 0
  ) {
    setDraft(updated);

    const nextSteps = updated.tutorialDraft?.steps ?? [];
    if (nextSteps.length === 0) {
      setSelectedStepIndex(0);
      return;
    }

    if (preferredStepId) {
      const preferredIndex = nextSteps.findIndex((step) => step.id === preferredStepId);
      if (preferredIndex >= 0) {
        setSelectedStepIndex(preferredIndex);
        return;
      }
    }

    setSelectedStepIndex(Math.min(fallbackIndex, nextSteps.length - 1));
  }

  async function reloadDraft() {
    const res = await fetch(withBasePath(`/api/drafts/${draft.id}`));
    if (!res.ok) {
      throw new Error('获取最新草稿失败');
    }

    const updated = await res.json();
    applyDraftUpdate(updated, selectedStepId, selectedStepIndex);
    return updated as DraftRecord;
  }

  async function saveMeta(data: {
    title?: string;
    description?: string;
    introParagraphs?: string[];
  }) {
    setSaving(true);
    try {
      const res = await fetch(withBasePath(`/api/drafts/${draft.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        applyDraftUpdate(updated, selectedStepId, selectedStepIndex);
      } else {
        const err = await res.json();
        alert(err.message || '保存元信息失败');
      }
    } catch (err) {
      console.error('保存元信息失败:', err);
      alert('保存元信息失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function saveStep(stepId: string, data: any) {
    setSaving(true);
    try {
      const res = await fetch(withBasePath(`/api/drafts/${draft.id}/steps/${stepId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        applyDraftUpdate(updated, stepId, selectedStepIndex);
      } else {
        const err = await res.json();
        alert(err.message || '保存步骤失败');
      }
    } catch (err) {
      console.error('保存步骤失败:', err);
      alert('保存步骤失败，请重试');
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
      const res = await fetch(withBasePath(`/api/drafts/${draft.id}/steps`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: newStep }),
      });
      if (res.ok) {
        const updated = await res.json();
        const nextSteps = updated.tutorialDraft?.steps ?? [];
        const lastStepId = nextSteps[nextSteps.length - 1]?.id ?? null;
        applyDraftUpdate(updated, lastStepId, Math.max(nextSteps.length - 1, 0));
      } else {
        const err = await res.json();
        alert(err.message || '追加步骤失败');
      }
    } catch (err) {
      console.error('追加步骤失败:', err);
      alert('追加步骤失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function regenerateStep(stepId: string, mode: 'prose' | 'step') {
    setSaving(true);
    try {
      const res = await fetch(
        withBasePath(`/api/drafts/${draft.id}/steps/${stepId}/regenerate`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        }
      );
      if (res.ok) {
        const updated = await res.json();
        applyDraftUpdate(updated, stepId, selectedStepIndex);
      } else {
        const err = await res.json();
        alert(err.message || '重新生成失败');
      }
    } catch (err) {
      console.error('重新生成失败:', err);
      alert('重新生成失败，请重试');
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

        const res = await fetch(
          withBasePath(`/api/drafts/${draft.id}/steps/${currentStep.id}/regenerate`),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'step', instruction }),
          }
        );

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || '重新生成后续步骤失败');
        }

        latestDraft = await res.json();
        applyDraftUpdate(latestDraft, currentStep.id, currentIndex);
      }
    } catch (err) {
      console.error('重新生成后续步骤失败:', err);
      alert(err instanceof Error ? err.message : '重新生成后续步骤失败，请重试');
    } finally {
      setRepairingStartIndex(null);
      setSaving(false);
    }
  }

  async function replaceSteps(
    nextSteps: NonNullable<DraftRecord['tutorialDraft']>['steps'],
    activeStepId?: string | null,
    fallbackIndex = selectedStepIndex
  ) {
    setSaving(true);
    try {
      const res = await fetch(withBasePath(`/api/drafts/${draft.id}/steps`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIds: nextSteps.map((step) => step.id) }),
      });

      if (res.ok) {
        const updated = await res.json();
        applyDraftUpdate(updated, activeStepId, fallbackIndex);
      } else {
        const err = await res.json();
        alert(err.message || '更新步骤顺序失败');
      }
    } catch (err) {
      console.error('更新步骤顺序失败:', err);
      alert('更新步骤顺序失败，请重试');
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
      const res = await fetch(withBasePath(`/api/drafts/${draft.id}/steps/${stepId}`), {
        method: 'DELETE',
      });

      if (res.ok) {
        const updated = await res.json();
        const deletedIndex = draft.tutorialDraft?.steps.findIndex((item) => item.id === stepId) ?? 0;
        const nextLength = updated.tutorialDraft?.steps?.length ?? 0;
        const fallbackIndex = Math.min(deletedIndex, Math.max(nextLength - 1, 0));
        const preferredStepId =
          selectedStepId && selectedStepId !== stepId ? selectedStepId : null;
        applyDraftUpdate(updated, preferredStepId, fallbackIndex);
      } else {
        const err = await res.json();
        alert(err.message || '删除步骤失败');
      }
    } catch (err) {
      console.error('删除步骤失败:', err);
      alert('删除步骤失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDraft() {
    const title = draft.tutorialDraft?.meta.title || draft.teachingBrief.topic || '新草稿';
    const confirmed = window.confirm(`确认删除草稿《${title}》？此操作无法撤销。`);
    if (!confirmed) return;

    setSaving(true);
    try {
      const res = await fetch(withBasePath(`/api/drafts/${draft.id}`), {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/drafts');
      } else {
        const err = await res.json();
        alert(err.message || '删除草稿失败');
      }
    } catch (err) {
      console.error('删除草稿失败:', err);
      alert('删除草稿失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    const slug = prompt('输入发布 slug（留空自动生成）:');
    if (slug === null) return;

    setSaving(true);
    try {
      const res = await fetch(withBasePath(`/api/drafts/${draft.id}/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug || undefined }),
      });
      if (res.ok) {
        const published = await res.json();
        router.push(`/${published.slug}`);
      } else {
        const err = await res.json();
        alert(err.message || '发布失败');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleGenerationRetry() {
    setShowGenerationProgress(true);
    setGenerationRunNonce((current) => current + 1);
  }

  async function handleGenerationComplete() {
    try {
      await reloadDraft();
      setShowGenerationProgress(false);
    } catch (err) {
      console.error('刷新草稿失败:', err);
      alert('生成完成，刷新失败，请手动刷新页面');
    }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="space-y-4">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-slate-900 shadow-sm transition hover:bg-slate-50"
        >
          <span className="h-2 w-2 rounded-full bg-slate-900" />
          VibeDocs
        </Link>
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
            编辑器
          </p>
          <div className="flex flex-col gap-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {draft.tutorialDraft?.meta.title || '新草稿'}
            </h1>
            <p className="text-xs leading-5 text-slate-500">
              编辑步骤、预览效果、一键发布。
            </p>
            <Badge variant={status.variant}>
              {status.label}
            </Badge>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/50 p-2">
        {hasDraft ? (
          <StepList
            steps={steps}
            selectedIndex={selectedStepIndex}
            onSelect={(index) => {
              setSelectedStepIndex(index);
              setDrawerOpen(false);
            }}
            onMoveUp={(stepId) => moveStep(stepId, -1)}
            onMoveDown={(stepId) => moveStep(stepId, 1)}
            onDelete={deleteStep}
            saving={saving}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
            生成后步骤会显示在这里。
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <button className={secondaryButton} onClick={appendStep} disabled={saving || !hasDraft}>
          追加步骤
        </button>
        {hasDraft && (
          <button
            className={primaryButton}
            onClick={() => router.push(`/drafts/${draft.id}/preview`)}
          >
            预览
          </button>
        )}
        {hasDraft && (
          <button
            className={primaryButton}
            onClick={handlePublish}
            disabled={saving || draft.syncState === 'stale' || !draft.validationValid}
          >
            发布
          </button>
        )}
        {draft.publishedSlug && (
          <button className={secondaryButton} onClick={() => router.push(`/${draft.publishedSlug}`)}>
            阅读已发布
          </button>
        )}
        <button className={secondaryButton} onClick={() => setEditingMeta((current) => !current)}>
          {editingMeta ? '关闭元信息' : '编辑元信息'}
        </button>
        {draft.status !== 'published' && (
          <button
            className={dangerButton}
            onClick={handleDeleteDraft}
            disabled={saving || draft.generationState === 'running'}
          >
            删除草稿
          </button>
        )}
      </div>
    </div>
  );

  const mainContent = (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {!hasDraft && showGenerationProgress && (
        <div className={sectionCard}>
          <GenerationProgress
            key={`${draft.id}:${generationRunNonce}`}
            draftId={draft.id}
            onComplete={handleGenerationComplete}
            context={generationContext}
          />
        </div>
      )}

      {draft.validationErrors.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-amber-950 shadow-[0_18px_40px_-24px_rgba(180,83,9,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
                当前草稿需要修复
              </p>
              <ul className="space-y-2 text-sm leading-6 text-amber-900/90">
                {draft.validationErrors.slice(0, 3).map((error) => (
                  <li key={error} className="rounded-2xl bg-white/70 px-3 py-2">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
            {firstInvalidStep && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  void regenerateFailedTail();
                }}
                disabled={saving}
              >
                {repairingStartIndex === firstInvalidStep.stepIndex
                  ? `正在从第 ${firstInvalidStep.stepIndex + 1} 步修复...`
                  : `从第 ${firstInvalidStep.stepIndex + 1} 步重新生成后续步骤`}
              </button>
            )}
          </div>
        </div>
      )}

      {editingMeta && hasDraft && draft.tutorialDraft && !showGenerationProgress && (
        <div className={sectionCard}>
          <DraftMetaEditor
            title={draft.tutorialDraft.meta.title}
            description={draft.tutorialDraft.meta.description}
            introParagraphs={draft.tutorialDraft.intro.paragraphs}
            onSave={saveMeta}
            saving={saving}
          />
        </div>
      )}

      {!editingMeta && draft.tutorialDraft && steps[selectedStepIndex] && !showGenerationProgress && (
        <div className={sectionCard}>
          <StepEditor
            tutorialDraft={draft.tutorialDraft}
            step={steps[selectedStepIndex]}
            stepIndex={selectedStepIndex}
            onSave={saveStep}
            onRegenerate={regenerateStep}
            saving={saving}
          />
        </div>
      )}

      {!hasDraft && !showGenerationProgress && (
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-slate-200 bg-white/85 p-8 text-slate-600 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <div className="max-w-md space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
              {draft.generationState === 'idle'
                ? '教程尚未生成'
                : draft.generationState === 'running'
                  ? '正在生成中...'
                  : draft.generationState === 'failed'
                    ? '生成失败'
                    : '未知状态'}
            </p>
            <p className="text-base leading-7 text-slate-700">
              {draft.generationState === 'failed'
                ? `生成失败: ${draft.generationErrorMessage}`
                : '创建后会自动开始生成。'}
            </p>
            {draft.generationState === 'failed' && (
              <button
                type="button"
                className={secondaryButton}
                onClick={handleGenerationRetry}
                disabled={saving}
              >
                重新生成目录
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.03),_transparent_28%),linear-gradient(180deg,_rgba(248,250,252,1),_rgba(241,245,249,1))]" />

      <aside className="sticky top-0 hidden h-screen overflow-y-auto border-r border-slate-200 bg-white lg:flex lg:flex-col">
        {sidebarContent}
      </aside>

      <button
        type="button"
        className="fixed left-4 top-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-700 shadow-lg shadow-slate-900/5 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white lg:hidden"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        aria-expanded={drawerOpen}
      >
        <span className="text-xl leading-none">☰</span>
      </button>

      <div
        className={`fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      >
        <div
          className={`absolute left-0 top-0 h-full w-[min(86vw,16rem)] border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          {sidebarContent}
        </div>
      </div>

      <main className="relative min-h-screen lg:col-start-2">{mainContent}</main>
    </div>
  );
}
