'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { DraftRecord } from '@/lib/types/api';
import { StepList } from './step-list';
import { StepEditor } from './step-editor';
import { DraftMetaEditor } from './draft-meta-editor';

interface DraftWorkspaceProps {
  draft: DraftRecord;
}

export function DraftWorkspace({ draft: initialDraft }: DraftWorkspaceProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftRecord>(initialDraft);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const hasDraft = !!draft.tutorialDraft;
  const steps = draft.tutorialDraft?.steps ?? [];

  async function refresh() {
    try {
      const res = await fetch(`/api/drafts/${draft.id}`);
      if (res.ok) setDraft(await res.json());
    } catch (err) {
      console.error('刷新草稿失败:', err);
    }
  }

  async function saveMeta(data: {
    title?: string;
    description?: string;
    introParagraphs?: string[];
  }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setDraft(await res.json());
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
      const res = await fetch(`/api/drafts/${draft.id}/steps/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setDraft(await res.json());
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
      id: `step-${Date.now()}`,
      title: `步骤 ${num}`,
      paragraphs: [''],
      patches: [],
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: newStep }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDraft(updated);
        setSelectedStepIndex(updated.tutorialDraft.steps.length - 1);
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
        `/api/drafts/${draft.id}/steps/${stepId}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        }
      );
      if (res.ok) {
        setDraft(await res.json());
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

  async function handlePublish() {
    const slug = prompt('输入发布 slug（留空自动生成）:');
    if (slug === null) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/drafts/${draft.id}/publish`, {
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

  const statusLabel =
    draft.generationState === 'running'
      ? '生成中'
      : draft.generationState === 'failed'
        ? '生成失败'
        : draft.syncState === 'stale'
          ? '已过期'
          : draft.validationValid
            ? '已就绪'
            : '待校验';

  const sidebarContent = (
    <>
      <div className="app-sidebar-logo">
        <Link href="/">VibeDocs</Link>
      </div>
      <div className="draft-sidebar-header">
        <h1>{draft.tutorialDraft?.meta.title || '新草稿'}</h1>
        <span className="status-badge">{statusLabel}</span>
      </div>

      {hasDraft && (
        <StepList
          steps={steps}
          selectedIndex={selectedStepIndex}
          onSelect={(i) => {
            setSelectedStepIndex(i);
            setDrawerOpen(false);
          }}
        />
      )}

      <div className="draft-sidebar-actions">
        <button
          className="btn btn-secondary"
          onClick={appendStep}
          disabled={saving || !hasDraft}
        >
          追加步骤
        </button>
        {hasDraft && (
          <button
            className="btn btn-primary"
            onClick={() =>
              router.push(`/drafts/${draft.id}/preview`)
            }
          >
            预览
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={handlePublish}
          disabled={saving || !hasDraft || draft.syncState === 'stale'}
        >
          发布
        </button>
        <button className="btn btn-secondary" onClick={() => setEditingMeta(!editingMeta)}>
          {editingMeta ? '关闭元信息' : '编辑元信息'}
        </button>
      </div>
    </>
  );

  return (
    <div className="draft-workspace">
      {/* Desktop sidebar */}
      <div className="draft-sidebar">
        {sidebarContent}
      </div>

      {/* Mobile hamburger */}
      <button
        className="mobile-menu-btn"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
      >
        &#9776;
      </button>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="drawer-overlay open" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            {sidebarContent}
          </div>
        </div>
      )}

      <div className="draft-editor-area">
        {editingMeta && hasDraft && draft.tutorialDraft && (
          <DraftMetaEditor
            title={draft.tutorialDraft.meta.title}
            description={draft.tutorialDraft.meta.description}
            introParagraphs={draft.tutorialDraft.intro.paragraphs}
            onSave={saveMeta}
            saving={saving}
          />
        )}

        {!editingMeta && hasDraft && steps[selectedStepIndex] && (
          <StepEditor
            step={steps[selectedStepIndex]}
            stepIndex={selectedStepIndex}
            onSave={saveStep}
            onRegenerate={regenerateStep}
            saving={saving}
          />
        )}

        {!hasDraft && (
          <div style={{ color: 'var(--text-secondary)', padding: 32 }}>
            {draft.generationState === 'idle'
              ? '教程尚未生成'
              : draft.generationState === 'running'
                ? '正在生成中...'
                : draft.generationState === 'failed'
                  ? `生成失败: ${draft.generationErrorMessage}`
                  : '未知状态'}
          </div>
        )}
      </div>
    </div>
  );
}
