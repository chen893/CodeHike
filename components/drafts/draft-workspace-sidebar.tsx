'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ChapteredStepList } from '@/components/drafts/chaptered-step-list';
import type { Chapter } from '@/lib/schemas/chapter';
import type { ClientDraftRecord } from '@/lib/types/client';
import type { DraftStatusInfo } from '@/lib/draft-status';

const buttonBase =
  'inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
const primaryButton = `${buttonBase} bg-slate-900 text-slate-50 shadow-sm hover:bg-slate-900/90`;
const secondaryButton = `${buttonBase} border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50`;
const dangerButton = `${buttonBase} border border-slate-200 bg-white text-red-600 shadow-sm hover:border-red-200 hover:bg-red-50`;

interface DraftWorkspaceSidebarProps {
  draft: ClientDraftRecord;
  hasDraft: boolean;
  steps: NonNullable<ClientDraftRecord['tutorialDraft']>['steps'];
  chapters: Chapter[];
  selectedStepIndex: number;
  selectedStepId: string | null;
  status: DraftStatusInfo;
  saving: boolean;
  editingMeta: boolean;
  canPublish: boolean;
  canDeleteDraft: boolean;
  onSelectStep: (stepId: string) => void;
  onMoveStep: (stepId: string, direction: -1 | 1) => Promise<void>;
  onDeleteStep: (stepId: string) => Promise<void>;
  onAppendStep: () => Promise<void>;
  onOpenPreview: () => void;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onOpenPublished: () => void;
  publishDialogOpen: boolean;
  onConfirmPublish: (slug: string) => Promise<void>;
  onCancelPublishDialog: () => void;
  onToggleEditingMeta: () => void;
  onDeleteDraft: () => Promise<void>;
  onAddChapter: () => Promise<void>;
  onUpdateChapter: (
    chapterId: string,
    data: { title?: string; description?: string }
  ) => Promise<void>;
  onDeleteChapter: (
    chapterId: string,
    moveStepsToChapterId: string
  ) => Promise<void>;
  onMoveChapter: (chapterId: string, direction: 'up' | 'down') => Promise<void>;
  onMoveStepToChapter: (stepId: string, targetChapterId: string) => Promise<void>;
  onAppendStepToChapter: (chapterId: string) => Promise<void>;
}

export function DraftWorkspaceSidebar({
  draft,
  hasDraft,
  steps,
  chapters,
  selectedStepIndex,
  selectedStepId,
  status,
  saving,
  editingMeta,
  canPublish,
  canDeleteDraft,
  onSelectStep,
  onMoveStep,
  onDeleteStep,
  onAppendStep,
  onOpenPreview,
  onPublish,
  onUnpublish,
  onOpenPublished,
  publishDialogOpen,
  onConfirmPublish,
  onCancelPublishDialog,
  onToggleEditingMeta,
  onDeleteDraft,
  onAddChapter,
  onUpdateChapter,
  onDeleteChapter,
  onMoveChapter,
  onMoveStepToChapter,
  onAppendStepToChapter,
}: DraftWorkspaceSidebarProps) {
  return (
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
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/50 p-2">
        {hasDraft ? (
          <ChapteredStepList
            steps={steps}
            chapters={chapters}
            selectedStepId={selectedStepId}
            onSelectStep={onSelectStep}
            onMoveStep={(stepId, direction) => onMoveStep(stepId, direction === 'up' ? -1 : 1)}
            onMoveStepToChapter={onMoveStepToChapter}
            onDeleteStep={onDeleteStep}
            onAddChapter={() => void onAddChapter()}
            onUpdateChapter={onUpdateChapter}
            onDeleteChapter={onDeleteChapter}
            onMoveChapter={onMoveChapter}
            onAppendStepToChapter={onAppendStepToChapter}
            saving={saving}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-400">
            生成后步骤会显示在这里。
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <button className={secondaryButton} onClick={() => void onAppendStep()} disabled={saving || !hasDraft}>
          追加步骤
        </button>
        {hasDraft && (
          <button className={primaryButton} onClick={onOpenPreview}>
            预览
          </button>
        )}
        {hasDraft && (
          <button className={primaryButton} onClick={() => void onPublish()} disabled={canPublish}>
            发布
          </button>
        )}
        {draft.publishedSlug && (
          <button className={secondaryButton} onClick={onOpenPublished}>
            阅读已发布
          </button>
        )}
        {draft.status === 'published' && (
          <button
            className={dangerButton}
            onClick={() => void onUnpublish()}
            disabled={saving}
          >
            取消发布
          </button>
        )}
        <button className={secondaryButton} onClick={onToggleEditingMeta}>
          {editingMeta ? '关闭元信息' : '编辑元信息'}
        </button>
        {draft.status !== 'published' && (
          <button
            className={dangerButton}
            onClick={() => void onDeleteDraft()}
            disabled={canDeleteDraft}
          >
            删除草稿
          </button>
        )}
      </div>

      {publishDialogOpen && (
        <PublishDialog
          draftId={draft.id}
          saving={saving}
          onConfirm={onConfirmPublish}
          onCancel={onCancelPublishDialog}
        />
      )}
    </div>
  );
}

interface PublishDialogProps {
  draftId: string;
  saving: boolean;
  onConfirm: (slug: string) => Promise<void>;
  onCancel: () => void;
}

function PublishDialog({
  draftId,
  saving,
  onConfirm,
  onCancel,
}: PublishDialogProps) {
  const [slug, setSlug] = useState('');

  const dialog = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900">发布教程</h3>
        <p className="mt-2 text-sm text-slate-500">
          输入自定义 URL slug，或留空自动生成。
        </p>
        <input
          type="text"
          className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          placeholder="例如: my-react-tutorial"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void onConfirm(slug);
            }
          }}
        />
        <div className="mt-5 flex justify-end gap-3">
          <button
            className={secondaryButton}
            onClick={onCancel}
            disabled={saving}
          >
            取消
          </button>
          <button
            className={primaryButton}
            onClick={() => void onConfirm(slug)}
            disabled={saving}
          >
            {saving ? '发布中...' : '确认发布'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
