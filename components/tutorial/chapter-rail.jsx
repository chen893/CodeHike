"use client"

import { useState, useCallback, useMemo } from "react"
import { useSelectedIndex } from "codehike/utils/selection"

/**
 * Format changeSummary into a short hint string.
 */
function formatChangeSummary(cs) {
  if (!cs) return null
  const { patchCount, added, removed, modified } = cs
  const parts = []
  if (patchCount > 0) parts.push(`${patchCount} change${patchCount > 1 ? "s" : ""}`)
  const lineTotal = added + removed + modified
  if (lineTotal > 0) parts.push(`~${lineTotal} line${lineTotal !== 1 ? "s" : ""}`)
  return parts.length > 0 ? parts.join(" \u00B7 ") : null
}

/**
 * A step dot node for the chapter rail.
 */
function StepDot({ step, index, selectedIndex, onSelect, onHover, isHovered }) {
  const state = index === selectedIndex
    ? "current"
    : index < selectedIndex
      ? "completed"
      : "upcoming"

  const changeHint = formatChangeSummary(step.changeSummary)

  return (
    <div
      className="step-rail-node relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-all hover:bg-[#2563eb]/[0.08]"
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(index)}
    >
      <div
        className={`transition-all duration-300 ${
          state === "current"
            ? "h-2 w-2 rounded-full bg-[#2563eb] ring-4 ring-[#2563eb]/20"
            : state === "completed"
              ? `h-[3px] rounded-[1.5px] bg-[#2563eb]/40 ${isHovered ? "w-4" : "w-2.5"}`
              : `h-[3px] rounded-[1.5px] bg-slate-300 ${isHovered ? "w-4" : "w-2.5"}`
        }`}
      />

      {isHovered && (
        <div className="absolute right-[calc(100%+10px)] top-1/2 flex w-[220px] -translate-y-1/2 flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-lg">
          <div className="block text-[13px] font-semibold leading-[1.35] text-slate-900">
            {step.title}
          </div>
          {changeHint && (
            <span className="block text-[11px] text-slate-400">
              {changeHint}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ChapterRail: chapter-grouped step navigation.
 *
 * If there is only 1 chapter or stepChapterMeta is empty, renders simple dots
 * like StepRail. Otherwise renders chapter groups with expand/collapse behavior.
 */
export function ChapterRail({ steps, chapters, stepChapterMeta }) {
  const [selectedIndex, selectIndex] = useSelectedIndex()
  const [hoveredIndex, setHoveredIndex] = useState(null)

  const handleSelect = useCallback((index) => {
    selectIndex(index)
    const stepEl = document.querySelector(`[data-step-index="${index}"]`)
    if (stepEl) {
      stepEl.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [selectIndex])

  // Fallback: single chapter or no metadata — render simple dot rail
  if (!chapters || chapters.length <= 1 || !stepChapterMeta || Object.keys(stepChapterMeta).length === 0) {
    return (
      <div className="fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-1 bg-transparent p-1 lg:flex">
        {steps.map((step, index) => (
          <StepDot
            key={step.id || index}
            step={step}
            index={index}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
            onHover={setHoveredIndex}
            isHovered={hoveredIndex === index}
          />
        ))}
      </div>
    )
  }

  // Determine which chapter the current step belongs to (for expand/collapse)
  const currentStep = steps[selectedIndex]
  const currentChapterId = currentStep?.chapterId

  // Build chapter groups from chapters array, with their step indices
  const chapterGroups = useMemo(() => chapters.map((chapter) => {
    const chapterStepIndices = []
    for (let i = 0; i < steps.length; i++) {
      const meta = stepChapterMeta[steps[i].id]
      if (meta && meta.chapterId === chapter.id) {
        chapterStepIndices.push(i)
      }
    }
    return {
      ...chapter,
      stepIndices: chapterStepIndices,
    }
  }), [chapters, steps, stepChapterMeta])

  const handleChapterClick = useCallback((chapterGroup) => {
    if (chapterGroup.stepIndices.length === 0) return
    const firstIndex = chapterGroup.stepIndices[0]
    handleSelect(firstIndex)
  }, [handleSelect])

  return (
    <div className="fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-end gap-3 bg-transparent p-1 lg:flex">
      {chapterGroups.map((chapterGroup) => {
        const isExpanded = chapterGroup.id === currentChapterId
        const hasSteps = chapterGroup.stepIndices.length > 0

        return (
          <div key={chapterGroup.id} className="flex flex-col items-end gap-0.5">
            {/* Chapter header dot / label */}
            <button
              className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-right transition-colors hover:bg-slate-200/60"
              onClick={() => handleChapterClick(chapterGroup)}
              title={chapterGroup.title}
            >
              <span
                className={`text-[10px] font-semibold leading-tight ${
                  isExpanded ? "text-[#2563eb]" : "text-slate-400"
                }`}
                style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {chapterGroup.title}
              </span>
              <div
                className={`h-1.5 w-1.5 rounded-full ${
                  isExpanded ? "bg-[#2563eb]" : "bg-slate-300"
                }`}
              />
            </button>

            {/* Step dots — expanded for current chapter, collapsed for others */}
            {isExpanded && hasSteps && (
              <div className="mr-2.5 flex flex-col items-center gap-0.5">
                {chapterGroup.stepIndices.map((stepIdx) => (
                  <StepDot
                    key={steps[stepIdx].id || stepIdx}
                    step={steps[stepIdx]}
                    index={stepIdx}
                    selectedIndex={selectedIndex}
                    onSelect={handleSelect}
                    onHover={setHoveredIndex}
                    isHovered={hoveredIndex === stepIdx}
                  />
                ))}
              </div>
            )}

            {!isExpanded && hasSteps && (
              <div className="mr-4 flex items-center gap-0.5 py-0.5">
                {chapterGroup.stepIndices.map((stepIdx) => {
                  const state = stepIdx === selectedIndex
                    ? "current"
                    : stepIdx < selectedIndex
                      ? "completed"
                      : "upcoming"
                  return (
                    <div
                      key={stepIdx}
                      className={`h-[2px] cursor-pointer rounded-[1px] ${
                        state === "current"
                          ? "w-1.5 bg-[#2563eb]"
                          : state === "completed"
                            ? "w-1 bg-[#2563eb]/40"
                            : "w-1 bg-slate-300"
                      }`}
                      onClick={() => handleSelect(stepIdx)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
