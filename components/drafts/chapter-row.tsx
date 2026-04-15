'use client';

import { useState, useRef, useEffect } from 'react';
import type { Chapter } from '@/lib/schemas/chapter';

interface ChapterRowProps {
  chapter: Chapter;
  stepCount: number;
  isExpanded: boolean;
  totalChapters: number;
  order: number;
  onToggleExpand: () => void;
  onUpdate: (data: { title?: string; description?: string }) => void;
  onDelete: (moveStepsToChapterId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddStep: () => void;
  allChapters: Chapter[];
  saving?: boolean;
}

export function ChapterRow({
  chapter,
  stepCount,
  isExpanded,
  totalChapters,
  order,
  onToggleExpand,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddStep,
  allChapters,
  saving = false,
}: ChapterRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chapter.title);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTargetChapterId, setDeleteTargetChapterId] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Update local title when chapter prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditTitle(chapter.title);
    }
  }, [chapter.title, isEditing]);

  function handleTitleSubmit() {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== chapter.title) {
      onUpdate({ title: trimmed });
    } else {
      setEditTitle(chapter.title);
    }
    setIsEditing(false);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setEditTitle(chapter.title);
      setIsEditing(false);
    }
  }

  function handleDelete() {
    if (totalChapters <= 1) return;
    const otherChapters = allChapters.filter((ch) => ch.id !== chapter.id);
    setDeleteTargetChapterId(otherChapters[0]?.id ?? '');
    setShowDeleteDialog(true);
  }

  function confirmDelete() {
    if (!deleteTargetChapterId) return;
    onDelete(deleteTargetChapterId);
    setShowDeleteDialog(false);
  }

  const otherChapters = allChapters.filter((ch) => ch.id !== chapter.id);

  return (
    <>
      <div className="group/chapter relative flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
        {/* Collapse/expand toggle */}
        <button
          type="button"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
          onClick={onToggleExpand}
          aria-label={isExpanded ? '收起' : '展开'}
        >
          <span className={`text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </button>

        {/* Chapter title */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-900 outline-none focus:border-slate-400"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={handleTitleKeyDown}
            disabled={saving}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 cursor-pointer hover:text-slate-900"
            onDoubleClick={() => setIsEditing(true)}
            title="双击编辑章节标题"
          >
            {chapter.title}
          </span>
        )}

        {/* Step count badge */}
        <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
          {stepCount}
        </span>

        {/* Action buttons — visible on hover */}
        <div className="absolute -right-0.5 top-1/2 flex -translate-y-1/2 shrink-0 items-center gap-0.5 rounded-md bg-white/90 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/chapter:opacity-100">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 text-[9px] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
            onClick={onMoveUp}
            disabled={saving || order === 0}
            aria-label={`上移 ${chapter.title}`}
          >
            ▲
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 text-[9px] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
            onClick={onMoveDown}
            disabled={saving || order >= totalChapters - 1}
            aria-label={`下移 ${chapter.title}`}
          >
            ▼
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 text-[9px] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
            onClick={() => setIsEditing(true)}
            disabled={saving}
            aria-label={`编辑 ${chapter.title}`}
          >
            ✎
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-400 text-[9px] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
            onClick={handleDelete}
            disabled={saving || totalChapters <= 1}
            aria-label={`删除 ${chapter.title}`}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Add step button at bottom of expanded chapter */}
      {isExpanded && (
        <button
          type="button"
          className="ml-4 mt-0.5 inline-flex items-center gap-1 rounded-md border border-dashed border-slate-200 bg-transparent px-2 py-1 text-[10px] text-slate-400 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600 disabled:pointer-events-none disabled:opacity-40"
          onClick={onAddStep}
          disabled={saving}
        >
          + 添加步骤
        </button>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          onClick={() => setShowDeleteDialog(false)}
        >
          <div
            className="w-80 rounded-xl border border-slate-200 bg-white p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-slate-900">
              删除章节「{chapter.title}」
            </h3>
            <p className="mt-2 text-xs text-slate-600">
              该章节下有 {stepCount} 个步骤，请选择将这些步骤移动到哪个章节：
            </p>
            <select
              className="mt-3 w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400"
              value={deleteTargetChapterId}
              onChange={(e) => setDeleteTargetChapterId(e.target.value)}
            >
              {otherChapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => setShowDeleteDialog(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                onClick={confirmDelete}
                disabled={!deleteTargetChapterId}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
