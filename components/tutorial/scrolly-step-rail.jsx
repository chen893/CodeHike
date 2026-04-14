"use client"

import { useState } from "react"
import { useSelectedIndex } from "codehike/utils/selection"

export function getStepChangeHint(step) {
  if (!step.patches || step.patches.length === 0) return null
  const patchCount = step.patches.length
  const totalLines = step.patches.reduce((sum, patch) => {
    return sum + Math.abs((patch.replace || "").split("\n").length - (patch.find || "").split("\n").length)
  }, 0)
  return `${patchCount} change${patchCount > 1 ? "s" : ""} · ~${totalLines} line${totalLines !== 1 ? "s" : ""}`
}

export function StepRail({ steps }) {
  const [selectedIndex, selectIndex] = useSelectedIndex()
  const [hoveredIndex, setHoveredIndex] = useState(null)

  function handleSelect(index) {
    selectIndex(index)
    const stepEls = document.querySelectorAll(".article-step")
    if (stepEls[index]) {
      stepEls[index].scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }

  function getStepState(index) {
    if (index === selectedIndex) return "current"
    if (index < selectedIndex) return "completed"
    return "upcoming"
  }

  return (
    <div className="fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-1 bg-transparent p-1 lg:flex">
      {steps.map((step, index) => {
        const state = getStepState(index)
        const isHovered = hoveredIndex === index
        const changeHint = getStepChangeHint(step)

        return (
          <div
            key={step.id || index}
            className="step-rail-node relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-all hover:bg-[#2563eb]/[0.08]"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => handleSelect(index)}
          >
            <div
              className={`step-rail-dash transition-all duration-300 ${
                state === "current"
                  ? "h-2 w-2 rounded-full bg-[#2563eb] ring-4 ring-[#2563eb]/20"
                  : state === "completed"
                    ? `h-[3px] rounded-[1.5px] bg-[#2563eb]/40 ${isHovered ? "w-5" : "w-3"}`
                    : `h-[3px] rounded-[1.5px] bg-slate-300 ${isHovered ? "w-5" : "w-3"}`
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
      })}
    </div>
  )
}
