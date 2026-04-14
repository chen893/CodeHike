"use client"

import React from "react"
import { diffArrays } from "diff"
import { getPreRef, InnerLine, InnerPre, InnerToken } from "codehike/code"
import {
  calculateTransitions,
  getStartingSnapshot,
} from "codehike/utils/token-transitions"

function FocusedPre(props) {
  return <InnerPre merge={props} className="code-pre overflow-hidden rounded-lg" />
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
    return <InnerPre merge={this.props} className="code-pre overflow-hidden rounded-lg" />
  }
}

export const focus = {
  name: "focus",
  onlyIfAnnotated: true,
  PreWithRef: FocusedPre,
  Line: (props) => <InnerLine merge={props} className="code-line" />,
  AnnotatedLine: (props) => (
    <InnerLine merge={props} data-focus={true} className="code-line" />
  ),
}

export const mark = {
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

export const changeIndicator = {
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

export const tokenTransitions = {
  name: "token-transitions",
  PreWithRef: SmoothPre,
  Token: (props) => (
    <InnerToken merge={props} style={{ display: "inline-block" }} />
  ),
}

export function animateLineDiff(pre, previousLines) {
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
