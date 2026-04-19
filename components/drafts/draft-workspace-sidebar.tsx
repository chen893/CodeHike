'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ArrowUpRight,
  Eye,
  FilePenLine,
  Globe2,
  Plus,
  Rocket,
  Trash2,
} from 'lucide-react';
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
  const title = draft.tutorialDraft?.meta.title || '新草稿';
  const updatedAt = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(draft.updatedAt));

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-4 text-slate-200">
      <div className="shrink-0 border-b border-slate-700/50 pb-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/drafts"
            className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 transition-colors hover:text-slate-200"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            VibeDocs
          </Link>
          <Badge variant={status.variant} className="shrink-0 text-[11px]">
            {status.label}
          </Badge>
        </div>

        <h1 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-6 text-slate-100">{title}</h1>

        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <span>{steps.length} 步骤</span>
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          <span>{chapters.length} 章节</span>
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          <span>{updatedAt}</span>
        </div>

        {hasDraft && (
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-400">
              {editingMeta ? 'META' : 'STEP'}
            </span>
            <span className="text-xs text-slate-400">
              {editingMeta
                ? '教程简介与元信息'
                : selectedStepId
                  ? `步骤 ${selectedStepIndex + 1} / ${steps.length}`
                  : '等待生成目录'}
            </span>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 flex flex-col py-3">
        {hasDraft ? (
          <>
            <div className="shrink-0 flex items-center justify-between gap-3 pb-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Outline</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                onClick={() => void onAddChapter()}
                disabled={saving}
              >
                <Plus className="h-3.5 w-3.5" />
                章节
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
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
            </div>
          </>
        ) : (
          <div className="border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
            步骤将在生成后显示。
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-700/50 pt-3">
        {hasDraft && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-9 border-slate-600 bg-slate-800 text-slate-300 shadow-none hover:bg-slate-700 hover:text-slate-100" onClick={onOpenPreview}>
              <Eye className="h-4 w-4" />
              预览
            </Button>
            <Button variant="default" className="h-9" onClick={() => void onPublish()} disabled={canPublish}>
              <Rocket className="h-4 w-4" />
              发布
            </Button>
          </div>
        )}

        {draft.publishedSlug && (
          <Button variant="outline" className="h-9 w-full border-slate-600 bg-slate-800 text-slate-300 shadow-none hover:bg-slate-700 hover:text-slate-100" onClick={onOpenPublished}>
            <ArrowUpRight className="h-4 w-4" />
            查看发布页
          </Button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="h-8 border-slate-600 bg-slate-800 text-slate-300 shadow-none hover:bg-slate-700 hover:text-slate-100" onClick={() => void onAppendStep()} disabled={saving || !hasDraft}>
            <Plus className="h-3.5 w-3.5" />
            添加步骤
          </Button>
          <Button variant="outline" size="sm" className="h-8 border-slate-600 bg-slate-800 text-slate-300 shadow-none hover:bg-slate-700 hover:text-slate-100" onClick={onToggleEditingMeta}>
            <FilePenLine className="h-3.5 w-3.5" />
            {editingMeta ? '关闭简介' : '编辑简介'}
          </Button>
        </div>

        <div className="border-t border-slate-700/50 pt-2">
          {draft.status === 'published' ? (
            <button type="button" className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50" onClick={() => void onUnpublish()} disabled={saving}>
              <Globe2 className="h-3.5 w-3.5" />
              取消发布
            </button>
          ) : (
            <button type="button" className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50" onClick={() => void onDeleteDraft()} disabled={canDeleteDraft}>
              <Trash2 className="h-3.5 w-3.5" />
              删除草稿
            </button>
          )}
        </div>
      </div>

      {publishDialogOpen && (
        <PublishDialog draftId={draft.id} saving={saving} onConfirm={onConfirmPublish} onCancel={onCancelPublishDialog} />
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

function PublishDialog({ draftId, saving, onConfirm, onCancel }: PublishDialogProps) {
  const [slug, setSlug] = useState('');

  const dialog = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Publish Draft</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">发布教程</h3>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-500">
            {draftId.slice(0, 8)}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-500">设置一个易读的发布链接。留空时系统会自动生成。</p>
        <input
          type="text"
          className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none"
          placeholder="例如: redux-core-principles"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void onConfirm(slug); } }}
        />
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel} disabled={saving}>取消</Button>
          <Button variant="default" onClick={() => void onConfirm(slug)} disabled={saving}>{saving ? '发布中...' : '发布'}</Button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
