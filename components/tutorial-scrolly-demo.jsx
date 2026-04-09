"use client"

import React, { useState } from "react"
import { diffArrays } from "diff"
import {
  getPreRef,
  InnerLine,
  InnerPre,
  InnerToken,
  Pre,
} from "codehike/code"
import {
  Selectable,
  SelectionProvider,
  useSelectedIndex,
} from "codehike/utils/selection"
import {
  calculateTransitions,
  getStartingSnapshot,
} from "codehike/utils/token-transitions"

function CodeFrame({ title, code, fileName }) {
  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-y-auto px-6 pb-6">
      <div className="mb-[18px] flex items-center justify-between pt-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
          {title || ""}
        </p>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
          {fileName || "code"}
        </span>
      </div>
      <div className="code-content overflow-x-auto">
        <Pre code={code} handlers={[focus, mark, changeIndicator, tokenTransitions]} />
      </div>
    </div>
  )
}

function MobileCodeFrame({ step, fileName }) {
  return (
    <div className="mt-5 max-h-[40vh] overflow-y-auto rounded-md border border-black/10 bg-[#1e1e2e] px-4 py-3 lg:hidden">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
          {step.eyebrow || ""}
        </p>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
          {fileName || "code"}
        </span>
      </div>
      <div className="code-content overflow-x-auto">
        <Pre code={step.highlighted} handlers={[focus, mark, changeIndicator]} />
      </div>
    </div>
  )
}

export function TutorialScrollyDemo({
  steps,
  intro,
  title,
  fileName,
}) {
  return (
    <SelectionProvider
      className="grid min-h-screen bg-[#f7f8fa] text-slate-900 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]"
      rootMargin="0% 0% -42% 0%"
    >
      <aside className="hidden min-h-screen bg-[#1e1e2e] lg:block">
        <div className="sticky top-0 flex h-screen items-start justify-center overflow-hidden">
          <SelectedCodeFrame steps={steps} fileName={fileName} />
        </div>
      </aside>

      <div className="relative min-h-screen bg-[#f7f8fa] px-5 pb-10 lg:px-0 lg:pb-0">
        <StepRail steps={steps} />

        {intro ? (
          <section className="flex min-h-auto flex-col justify-center py-9 pl-4 sm:py-10 sm:pl-8 lg:min-h-screen lg:pl-10 lg:pr-14 lg:pb-[72px] lg:pt-12">
            <h1 className="text-[clamp(2.625rem,5vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.04em] text-slate-900">
              {title || "Tutorial renderer"}
            </h1>
            <div className="mt-4">
              {intro.map((paragraph, index) => (
                <p
                  key={`intro-${index}`}
                  className="mt-4 w-full max-w-[600px] text-[clamp(1rem,1.4vw,1.1875rem)] leading-[1.75] text-slate-500"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        <div>
          {steps.map((step, index) => (
            <Selectable
              key={step.id || `step-${index}`}
              index={index}
              selectOn={["click", "scroll"]}
              className="article-step scroll-mt-24 border-l-2 border-slate-200 pl-5 transition-colors data-[selected=true]:border-[#2563eb] sm:pl-8 lg:flex lg:min-h-screen lg:items-start lg:pl-10 lg:pr-14"
            >
              <article className="w-full max-w-[560px] py-9 pb-7 lg:py-14 lg:pb-[120px]">
                {step.eyebrow && (
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#2563eb]">
                    {step.eyebrow}
                  </p>
                )}
                <h2 className="text-[clamp(1.75rem,2.8vw,2.75rem)] font-bold leading-[1.15] tracking-[-0.025em] text-slate-900">
                  {step.title}
                </h2>
                {step.lead && (
                  <p className="mt-6 max-w-[560px] text-[clamp(1rem,1.3vw,1.125rem)] font-medium leading-[1.6] text-slate-900">
                    {step.lead}
                  </p>
                )}
                <div>
                  {step.paragraphs.map((paragraph, pIndex) => (
                    <p
                      key={`step-${index}-p-${pIndex}`}
                      className="mt-5 max-w-[560px] text-[clamp(0.9375rem,1.2vw,1.0625rem)] leading-[1.8] text-slate-500"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
                <MobileCodeFrame step={step} fileName={fileName} />
              </article>
            </Selectable>
          ))}
        </div>
      </div>
    </SelectionProvider>
  )
}

/* ─── Step Rail — dash-style vertical navigator with hover tooltips ─── */

function StepRail({ steps }) {
  const [selectedIndex, selectIndex] = useSelectedIndex()
  const [hoveredIndex, setHoveredIndex] = useState(null)

  function handleSelect(i) {
    selectIndex(i)
    // Sync: scroll the article step into view
    const stepEls = document.querySelectorAll('.article-step')
    if (stepEls[i]) {
      stepEls[i].scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }

  function getStepState(i) {
    if (i === selectedIndex) return "current"
    if (i < selectedIndex) return "completed"
    return "upcoming"
  }

  function getChangeHint(step) {
    if (!step.patches || step.patches.length === 0) return null
    const patchCount = step.patches.length
    const totalLines = step.patches.reduce((sum, p) => {
      return sum + Math.abs((p.replace || "").split("\n").length - (p.find || "").split("\n").length)
    }, 0)
    return `${patchCount} change${patchCount > 1 ? "s" : ""} · ~${totalLines} line${totalLines !== 1 ? "s" : ""}`
  }

  return (
    <div className="fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 p-2 shadow-[0_1px_3px_rgba(15,23,42,0.08),0_4px_12px_rgba(15,23,42,0.04)] backdrop-blur lg:flex">
      {steps.map((step, i) => {
        const state = getStepState(i)
        const isHovered = hoveredIndex === i

        return (
          <div
            key={step.id || i}
            className="step-rail-node relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-all hover:bg-[#2563eb]/[0.06]"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => handleSelect(i)}
          >
            <div
              className={`step-rail-dash ${state} transition-all ${
                state === "current"
                  ? `${isHovered ? "h-1 w-6" : "h-1 w-[22px]"} rounded-sm bg-[#2563eb]`
                  : state === "completed"
                    ? `${isHovered ? "h-[3px] w-[18px]" : "h-[3px] w-[14px]"} rounded-[1.5px] bg-[#2563eb]/25`
                    : `${isHovered ? "h-[3px] w-[18px] bg-black/25" : "h-[3px] w-[14px] bg-black/12"} rounded-[1.5px]`
              }`}
            />

            {isHovered && (
              <div className="absolute right-[calc(100%+10px)] top-1/2 flex w-[220px] -translate-y-1/2 flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-lg">
                <div className="block text-[13px] font-semibold leading-[1.35] text-slate-900">
                  {step.title}
                </div>
                {getChangeHint(step) && (
                  <span className="block text-[11px] text-slate-400">
                    {getChangeHint(step)}
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

function SelectedCodeFrame({ steps, fileName }) {
  const [selectedIndex] = useSelectedIndex()
  const step = steps[selectedIndex] ?? steps[0]

  if (!step) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-sm text-slate-500">
        没有步骤
      </div>
    )
  }

  return <CodeFrame title={step.eyebrow} code={step.highlighted} fileName={fileName} />
}

function FocusedPre(props) {
  return <InnerPre merge={props} className="code-pre overflow-hidden rounded-2xl" />
}

class SmoothPre extends React.Component {
  constructor(props) {
    super(props)
    this.ref = getPreRef(props)
  }

  getSnapshotBeforeUpdate() {
    if (!this.ref.current) {
      return null
    }

    const lines = Array.from(this.ref.current.querySelectorAll(".code-line"))

    return {
      tokens: getStartingSnapshot(this.ref.current),
      lines: lines.map((line, index) => ({
        index,
        text: line.textContent ?? "",
        top: line.offsetTop,
        left: line.offsetLeft,
        width: line.offsetWidth,
        height: line.offsetHeight,
        html: line.innerHTML,
      })),
    }
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
    if (!this.ref.current || !snapshot) {
      return
    }

    const transitions = calculateTransitions(this.ref.current, snapshot.tokens)
    transitions.forEach(({ element, keyframes, options }) => {
      const frames = { ...keyframes }

      if (frames.translateX && frames.translateY) {
        frames.translate = [
          `${frames.translateX[0]}px ${frames.translateY[0]}px`,
          `${frames.translateX[1]}px ${frames.translateY[1]}px`,
        ]
      }

      delete frames.translateX
      delete frames.translateY

      element.animate(frames, {
        duration: options.duration * 700,
        delay: options.delay * 700,
        easing: options.easing,
        fill: "both",
      })
    })

    animateLineDiff(this.ref.current, snapshot.lines)
  }

  render() {
    return <InnerPre merge={this.props} className="code-pre overflow-hidden rounded-2xl" />
  }
}

const focus = {
  name: "focus",
  onlyIfAnnotated: true,
  PreWithRef: FocusedPre,
  Line: (props) => <InnerLine merge={props} className="code-line" />,
  AnnotatedLine: (props) => (
    <InnerLine merge={props} data-focus={true} className="code-line" />
  ),
}

const mark = {
  name: "mark",
  Line: ({ annotation, ...props }) => {
    const color = annotation?.query || "rgb(124 199 255)"

    return (
      <div
        className="code-mark-wrap flex rounded-r-lg border-l-2 px-2 py-0.5"
        style={{
          borderLeftColor: annotation ? color : "transparent",
          background: annotation ? `rgb(from ${color} r g b / 0.14)` : "transparent",
        }}
      >
        <InnerLine merge={props} className="code-line" />
      </div>
    )
  },
}

const changeIndicator = {
  name: "change-indicator",
  Line: ({ annotation, ...props }) => {
    const changeType = annotation?.query

    if (!changeType) {
      return <InnerLine merge={props} className="code-line" />
    }

    const isAdded = changeType === "added"
    const borderColor = isAdded ? "var(--mint)" : "var(--amber)"
    const bgColor = isAdded
      ? "rgba(143, 210, 193, 0.08)"
      : "rgba(221, 176, 129, 0.08)"

    return (
      <div
        className="code-change-line flex items-stretch rounded-r-lg px-2 py-0.5"
        style={{
          borderLeft: `2px solid ${borderColor}`,
          background: bgColor,
        }}
      >
        <span
          className={`line-indicator mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
            isAdded ? "line-added bg-emerald-300/20 text-emerald-100" : "line-modified bg-amber-300/20 text-amber-100"
          }`}
        >
          {isAdded ? "+" : "~"}
        </span>
        <InnerLine merge={props} className="code-line" />
      </div>
    )
  },
}

const tokenTransitions = {
  name: "token-transitions",
  PreWithRef: SmoothPre,
  Token: (props) => (
    <InnerToken merge={props} style={{ display: "inline-block" }} />
  ),
}

function animateLineDiff(pre, previousLines) {
  const currentLines = Array.from(pre.querySelectorAll(".code-line"))
  const currentTexts = currentLines.map((line) => line.textContent ?? "")
  const previousTexts = previousLines.map((line) => line.text)
  const parent = pre.parentElement

  if (!parent) {
    return
  }

  parent.querySelectorAll(".code-line-ghost").forEach((node) => node.remove())
  currentLines.forEach((line) => line.classList.remove("code-line-added"))

  let prevIndex = 0
  let nextIndex = 0

  diffArrays(previousTexts, currentTexts).forEach((part) => {
    const count = part.count ?? 0

    if (part.removed) {
      previousLines.slice(prevIndex, prevIndex + count).forEach((line) => {
        const ghost = document.createElement("div")
        ghost.className = "code-line-ghost"
        ghost.style.top = `${line.top}px`
        ghost.style.left = `${line.left}px`
        ghost.style.width = `${line.width}px`
        ghost.style.height = `${line.height}px`
        ghost.innerHTML = line.html
        parent.appendChild(ghost)
        ghost.animate(
          [
            { opacity: 0.72, transform: "translateY(0px)" },
            { opacity: 0, transform: "translateY(-14px)" },
          ],
          {
            duration: 380,
            easing: "ease-out",
            fill: "forwards",
          },
        ).finished.finally(() => ghost.remove())
      })
      prevIndex += count
      return
    }

    if (part.added) {
      currentLines.slice(nextIndex, nextIndex + count).forEach((line, index) => {
        line.classList.add("code-line-added")
        line.animate(
          [
            {
              opacity: 0,
              transform: "translateY(10px)",
              backgroundColor: "rgba(255, 255, 255, 0)",
            },
            {
              opacity: 1,
              transform: "translateY(0px)",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
            },
            {
              opacity: 1,
              transform: "translateY(0px)",
              backgroundColor: "rgba(255, 255, 255, 0)",
            },
          ],
          {
            duration: 460,
            delay: index * 45,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "both",
          },
        )
      })
      nextIndex += count
      return
    }

    prevIndex += count
    nextIndex += count
  })
}
