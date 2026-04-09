'use client';

import type { TutorialStep } from '@/lib/schemas/tutorial-draft';

interface StepListProps {
  steps: TutorialStep[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onMoveUp: (stepId: string) => Promise<void>;
  onMoveDown: (stepId: string) => Promise<void>;
  onDelete: (stepId: string) => Promise<void>;
  saving?: boolean;
}

export function StepList({
  steps,
  selectedIndex,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
  saving = false,
}: StepListProps) {
  return (
    <div className="space-y-1">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-2.5 transition-colors ${
            index === selectedIndex
              ? 'border-slate-300 bg-slate-100 text-slate-900 shadow-sm'
              : 'border-transparent bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
          onClick={() => onSelect(index)}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-200 text-[10px] font-bold ${
                index === selectedIndex
                  ? 'bg-slate-300 text-slate-900'
                  : 'text-slate-500'
              }`}
            >
              {index + 1}
            </span>
            <span className="truncate text-sm font-medium">{step.title}</span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
              onClick={(event) => {
                event.stopPropagation();
                void onMoveUp(step.id);
              }}
              disabled={saving || index === 0}
              aria-label={`上移 ${step.title}`}
            >
              <span className="text-[10px]">▲</span>
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-40"
              onClick={(event) => {
                event.stopPropagation();
                void onMoveDown(step.id);
              }}
              disabled={saving || index === steps.length - 1}
              aria-label={`下移 ${step.title}`}
            >
              <span className="text-[10px]">▼</span>
            </button>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
              onClick={(event) => {
                event.stopPropagation();
                void onDelete(step.id);
              }}
              disabled={saving || steps.length <= 1}
              aria-label={`删除 ${step.title}`}
            >
              <span className="text-xs">✕</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
