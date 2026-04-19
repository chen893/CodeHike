'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Chapter } from '@/lib/schemas/chapter';
import type { TutorialStep } from '@/lib/schemas/tutorial-draft';
import { deriveChapterSections } from '@/lib/tutorial/chapters';
import { ChapterRow } from './chapter-row';
import { ChapterStepRow } from './chapter-step-row';

interface ChapteredStepListProps {
  steps: TutorialStep[];
  chapters: Chapter[];
  selectedStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onMoveStep: (stepId: string, direction: 'up' | 'down') => void;
  onMoveStepToChapter: (stepId: string, targetChapterId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onAddChapter: () => void;
  onUpdateChapter: (
    chapterId: string,
    data: { title?: string; description?: string }
  ) => void;
  onDeleteChapter: (
    chapterId: string,
    moveStepsToChapterId: string
  ) => void;
  onMoveChapter: (chapterId: string, direction: 'up' | 'down') => void;
  onAppendStepToChapter: (chapterId: string) => void;
  saving?: boolean;
}

export function ChapteredStepList({
  steps,
  chapters,
  selectedStepId,
  onSelectStep,
  onMoveStep,
  onMoveStepToChapter,
  onDeleteStep,
  onAddChapter,
  onUpdateChapter,
  onDeleteChapter,
  onMoveChapter,
  onAppendStepToChapter,
  saving = false,
}: ChapteredStepListProps) {
  const sections = useMemo(
    () => deriveChapterSections(chapters, steps),
    [chapters, steps]
  );

  // Track which chapters are expanded (default: all expanded)
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => new Set(chapters.map((ch) => ch.id))
  );

  // Sync expanded state when chapters change (e.g., new chapter added)
  useEffect(() => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      for (const ch of chapters) {
        if (!next.has(ch.id)) {
          next.add(ch.id);
        }
      }
      return next;
    });
  }, [chapters]);

  function toggleExpand(chapterId: string) {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  }

  // Build a step id -> step map for O(1) lookup
  const stepById = useMemo(() => {
    const map = new Map<string, TutorialStep>();
    steps.forEach((step) => map.set(step.id, step));
    return map;
  }, [steps]);

  // Build a chapter id -> chapter map for O(1) lookup
  const chapterById = useMemo(() => {
    const map = new Map<string, Chapter>();
    chapters.forEach((ch) => map.set(ch.id, ch));
    return map;
  }, [chapters]);

  return (
    <div className="space-y-3">
      {sections.map((section, sectionIndex) => {
        const chapter = chapterById.get(section.id);
        if (!chapter) return null;

        const isExpanded = expandedChapters.has(section.id);
        const sectionSteps = section.stepIds
          .map((id) => stepById.get(id))
          .filter(Boolean) as TutorialStep[];

        return (
          <div key={section.id} className="space-y-1.5">
            <ChapterRow
              chapter={chapter}
              stepCount={section.stepCount}
              isExpanded={isExpanded}
              totalChapters={sections.length}
              order={sectionIndex}
              onToggleExpand={() => toggleExpand(section.id)}
              onUpdate={(data) => onUpdateChapter(section.id, data)}
              onDelete={(moveToId) => onDeleteChapter(section.id, moveToId)}
              onMoveUp={() => onMoveChapter(section.id, 'up')}
              onMoveDown={() => onMoveChapter(section.id, 'down')}
              onAddStep={() => onAppendStepToChapter(section.id)}
              allChapters={chapters}
              saving={saving}
            />

            {isExpanded && (
              <div className="space-y-1 pl-3 pr-1">
                {sectionSteps.map((step, stepIdx) => (
                  <ChapterStepRow
                    key={step.id}
                    step={step}
                    stepIndexInChapter={stepIdx}
                    totalStepsInChapter={sectionSteps.length}
                    isSelected={step.id === selectedStepId}
                    chapters={chapters}
                    onSelect={() => onSelectStep(step.id)}
                    onMoveUp={() => onMoveStep(step.id, 'up')}
                    onMoveDown={() => onMoveStep(step.id, 'down')}
                    onMoveToChapter={(targetId) =>
                      onMoveStepToChapter(step.id, targetId)
                    }
                    onDelete={() => onDeleteStep(step.id)}
                    saving={saving}
                  />
                ))}
                {sectionSteps.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-700 px-4 py-3 text-[11px] text-slate-500">
                    暂无步骤
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add chapter button */}
      <button
        type="button"
        className="w-full rounded-md border border-dashed border-slate-700 px-3 py-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-300 disabled:pointer-events-none disabled:opacity-40"
        onClick={onAddChapter}
        disabled={saving}
      >
        + 添加章节
      </button>
    </div>
  );
}
