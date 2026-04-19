'use client';

import type { Chapter } from '@/lib/schemas/chapter';
import type { TutorialStep } from '@/lib/schemas/tutorial-draft';

interface ChapterStepRowProps {
  step: TutorialStep;
  stepIndexInChapter: number;
  totalStepsInChapter: number;
  isSelected: boolean;
  chapters: Chapter[];
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveToChapter: (targetChapterId: string) => void;
  onDelete: () => void;
  saving?: boolean;
}

export function ChapterStepRow({
  step,
  stepIndexInChapter,
  totalStepsInChapter,
  isSelected,
  chapters,
  onSelect,
  onMoveUp,
  onMoveDown,
  onMoveToChapter,
  onDelete,
  saving = false,
}: ChapterStepRowProps) {
  const otherChapters = chapters.filter((ch) => ch.id !== step.chapterId);

  return (
    <div
      className={`group/step relative cursor-pointer rounded-xl border px-3 py-2.5 transition-all ${
        isSelected
          ? 'border-cyan-500/30 bg-cyan-500/10 text-slate-100'
          : 'border-transparent bg-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isSelected ? 'bg-cyan-500 text-white' : 'border border-slate-600 bg-slate-700 text-slate-500'}`}>
          {stepIndexInChapter + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-6">{step.title}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-500">Step {stepIndexInChapter + 1}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1 opacity-0 transition-opacity group-hover/step:opacity-100 group-focus-within/step:opacity-100">
        <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-[9px] text-slate-500 transition-colors hover:border-slate-500 hover:bg-slate-600 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={saving || stepIndexInChapter === 0} aria-label={`上移 ${step.title}`}>▲</button>
        <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-[9px] text-slate-500 transition-colors hover:border-slate-500 hover:bg-slate-600 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={saving || stepIndexInChapter >= totalStepsInChapter - 1} aria-label={`下移 ${step.title}`}>▼</button>
        {otherChapters.length > 0 && (
          <select className="h-6 max-w-[80px] rounded-full border border-slate-600 bg-slate-700 px-2 text-[9px] text-slate-500 outline-none transition-colors hover:border-slate-500 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40" value="" onChange={(e) => { if (e.target.value) { onMoveToChapter(e.target.value); } }} disabled={saving} onClick={(e) => e.stopPropagation()} aria-label={`移动 ${step.title} 到其他章节`}>
            <option value="" disabled>移至</option>
            {otherChapters.map((ch) => (<option key={ch.id} value={ch.id}>{ch.title}</option>))}
          </select>
        )}
        <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 bg-slate-700 text-[9px] text-slate-500 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none disabled:opacity-40" onClick={(e) => { e.stopPropagation(); onDelete(); }} disabled={saving} aria-label={`删除 ${step.title}`}>✕</button>
      </div>
    </div>
  );
}
