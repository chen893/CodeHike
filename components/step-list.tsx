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
          className={`group/step relative flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 pr-10 transition-colors ${
            index === selectedIndex
              ? 'border-transparent bg-accent/50 text-foreground shadow-sm'
              : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          onClick={() => onSelect(index)}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold ${
              index === selectedIndex
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground'
            }`}
          >
            {index + 1}
          </span>
          <span className="min-w-0 truncate text-sm font-medium leading-snug">
            {step.title}
          </span>

          {/* action buttons — visible on hover or focus-within */}
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 shrink-0 items-center gap-0.5 rounded-md bg-card/90 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/step:opacity-100 focus-within:opacity-100 group-hover/step:[&:has(button:disabled)]:bg-card group-hover/step:[&:not(:has(button:disabled))]:bg-accent">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40"
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40"
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40"
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
