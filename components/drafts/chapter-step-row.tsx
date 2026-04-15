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
      className={`group/step relative flex cursor-pointer items-center gap-2 rounded-lg border p-2 pl-6 pr-10 transition-colors ${
        isSelected
          ? 'border-slate-300 bg-slate-100 text-slate-900 shadow-sm'
          : 'border-transparent bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
      onClick={onSelect}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[9px] font-bold ${
          isSelected ? 'bg-slate-300 text-slate-900' : 'text-slate-500'
        }`}
      >
        {stepIndexInChapter + 1}
      </span>
      <span className="min-w-0 truncate text-xs font-medium leading-snug">
        {step.title}
      </span>

      {/* action buttons — visible on hover */}
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 shrink-0 items-center gap-0.5 rounded-md bg-white/90 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/step:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 text-[9px] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={saving || stepIndexInChapter === 0}
          aria-label={`上移 ${step.title}`}
        >
          ▲
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 text-[9px] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={saving || stepIndexInChapter >= totalStepsInChapter - 1}
          aria-label={`下移 ${step.title}`}
        >
          ▼
        </button>
        {otherChapters.length > 0 && (
          <select
            className="h-6 max-w-[80px] rounded border border-slate-200 bg-white text-[9px] text-slate-500 outline-none transition-colors hover:border-slate-300 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                onMoveToChapter(e.target.value);
              }
            }}
            disabled={saving}
            onClick={(e) => e.stopPropagation()}
            aria-label={`移动 ${step.title} 到其他章节`}
          >
            <option value="" disabled>
              移至
            </option>
            {otherChapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.title}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-400 text-[10px] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          disabled={saving}
          aria-label={`删除 ${step.title}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
