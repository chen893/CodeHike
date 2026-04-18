'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChapteredStepList } from '@/components/drafts/chaptered-step-list';
import type { Chapter } from '@/lib/schemas/chapter';
import type { ClientDraftRecord } from '@/lib/types/client';
import type { DraftStatusInfo } from '@/lib/draft-status';

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
    <div className="flex min-h-0 flex-1 flex-col p-5">
      {/* Fixed header — never scrolls */}
      <div className="shrink-0 space-y-3 pb-4">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-3 rounded-lg bg-muted/40 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-foreground transition hover:bg-accent"
        >
          <span className="h-2 w-2 rounded-full bg-primary" />
          VibeDocs
        </Link>
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            编辑器
          </p>
          <div className="flex flex-col gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {draft.tutorialDraft?.meta.title || '新草稿'}
            </h1>
<Badge variant={status.variant} className="w-fit">{status.label}</Badge>
          </div>
        </div>
      </div>

      {/* Scrollable step list — fills remaining space */}
      <div className="flex-1 min-h-0 rounded-xl bg-muted/20 p-2 overflow-y-auto">
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
          <div className="rounded-lg border border-dashed border-border/50 px-4 py-8 text-center text-xs text-muted-foreground">
            步骤将在生成后显示。
          </div>
        )}
      </div>

      {/* Fixed bottom buttons */}
      <div className="shrink-0 space-y-3 pt-4">
        {/* Primary actions */}
        {hasDraft && (
          <Button variant="default" className="w-full" onClick={onOpenPreview}>
            预览
          </Button>
        )}
        {hasDraft && (
          <Button variant="default" className="w-full" onClick={() => void onPublish()} disabled={canPublish}>
            发布
          </Button>
        )}
        {draft.publishedSlug && (
          <Button variant="secondary" className="w-full" onClick={onOpenPublished}>
            查看发布页
          </Button>
        )}

        {/* Secondary actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => void onAppendStep()} disabled={saving || !hasDraft}>
            添加步骤
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={onToggleEditingMeta}>
            {editingMeta ? '关闭简介' : '编辑简介'}
          </Button>
        </div>

        {/* Destructive */}
        <div className="border-t border-border/40 pt-3">
          {draft.status === 'published' && (
            <button
              type="button"
              className="w-full py-1.5 text-xs text-destructive/60 transition-colors hover:text-destructive"
              onClick={() => void onUnpublish()}
              disabled={saving}
            >
              取消发布
            </button>
          )}
          {draft.status !== 'published' && (
            <button
              type="button"
              className="w-full py-1.5 text-xs text-destructive/60 transition-colors hover:text-destructive"
              onClick={() => void onDeleteDraft()}
              disabled={canDeleteDraft}
            >
              删除草稿
            </button>
          )}
        </div>
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
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-foreground">发布教程</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          设置发布链接，留空则自动生成。
        </p>
        <input
          type="text"
          className="mt-4 w-full rounded-md border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            取消
          </Button>
          <Button
            variant="default"
            onClick={() => void onConfirm(slug)}
            disabled={saving}
          >
            {saving ? '发布中...' : '发布'}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
