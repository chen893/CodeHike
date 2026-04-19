'use client';

import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
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

  function handleTitleKeyDown(e: KeyboardEvent) {
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
      <div className="group/chapter relative overflow-hidden rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-slate-400 transition-colors hover:border-slate-500 hover:bg-slate-600 hover:text-slate-200"
            onClick={onToggleExpand}
            aria-label={isExpanded ? '收起' : '展开'}
          >
            <span className={`text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
          </button>

          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 outline-none focus:border-slate-500"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleTitleKeyDown}
              disabled={saving}
            />
          ) : (
            <div className="min-w-0 flex-1 cursor-pointer" onDoubleClick={() => setIsEditing(true)} title="双击编辑章节标题">
              <div className="truncate text-sm font-semibold text-slate-200">{chapter.title}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">Chapter {order + 1}</div>
            </div>
          )}

          <span className="shrink-0 rounded-full border border-slate-600 bg-slate-700 px-2.5 py-1 text-[10px] font-bold text-slate-400">
            {stepCount}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 opacity-0 transition-opacity group-hover/chapter:opacity-100">
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-[10px] text-slate-500 transition-colors hover:border-slate-500 hover:bg-slate-600 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40" onClick={onMoveUp} disabled={saving || order === 0} aria-label={`上移 ${chapter.title}`}>▲</button>
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-[10px] text-slate-500 transition-colors hover:border-slate-500 hover:bg-slate-600 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40" onClick={onMoveDown} disabled={saving || order >= totalChapters - 1} aria-label={`下移 ${chapter.title}`}>▼</button>
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-[10px] text-slate-500 transition-colors hover:border-slate-500 hover:bg-slate-600 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40" onClick={() => setIsEditing(true)} disabled={saving} aria-label={`编辑 ${chapter.title}`}>✎</button>
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-[10px] text-slate-500 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none disabled:opacity-40" onClick={handleDelete} disabled={saving || totalChapters <= 1} aria-label={`删除 ${chapter.title}`}>✕</button>
        </div>
      </div>

      {isExpanded && (
        <button
          type="button"
          className="ml-3 inline-flex items-center gap-2 rounded-md border border-dashed border-slate-700 bg-transparent px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-500 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-300 disabled:pointer-events-none disabled:opacity-40"
          onClick={onAddStep}
          disabled={saving}
        >
          + 添加步骤
        </button>
      )}

      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setShowDeleteDialog(false)}>
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">删除章节「{chapter.title}」</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">该章节下有 {stepCount} 个步骤，请选择将这些步骤移动到哪个章节：</p>
            <select className="mt-4 w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400" value={deleteTargetChapterId} onChange={(e) => setDeleteTargetChapterId(e.target.value)}>
              {otherChapters.map((ch) => (<option key={ch.id} value={ch.id}>{ch.title}</option>))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50" onClick={() => setShowDeleteDialog(false)}>取消</button>
              <button type="button" className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50" onClick={confirmDelete} disabled={!deleteTargetChapterId}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
