"use client"

import React from "react"
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
    <div className="code-stage">
      <div className="code-meta">
        <p className="code-frame-title">{title}</p>
        <span className="code-file-label">{fileName || "store.js"}</span>
      </div>
      <div className="code-content">
        <Pre code={code} handlers={[focus, mark, tokenTransitions]} />
      </div>
    </div>
  )
}

export function TutorialScrollyDemo({ steps, intro, title, fileName }) {
  return (
    <SelectionProvider className="editorial-grid" rootMargin="0% 0% -42% 0%">
      <aside className="code-column">
        <div className="code-column-inner">
          <p className="code-column-kicker">{title || "Build your own redux"}</p>
          <SelectedCodeFrame steps={steps} fileName={fileName} />
        </div>
      </aside>

      <div className="article-column">
        {intro ? (
          <section className="article-intro">
            <p className="article-intro-kicker">Code Hike Tutorial</p>
            <h1 className="article-intro-title">{title || "Build your own redux"}</h1>
            {intro.map((paragraph) => (
              <p key={paragraph} className="article-intro-body">
                {paragraph}
              </p>
            ))}
          </section>
        ) : null}

        {steps.map((step, index) => (
          <Selectable
            key={step.title}
            index={index}
            selectOn={["click", "scroll"]}
            className="article-step"
          >
            <article className="article-step-inner">
              <p className="article-step-kicker">{step.eyebrow}</p>
              <h2 className="article-step-title">{step.title}</h2>
              <p className="article-step-lead">{step.lead}</p>
              {step.paragraphs.map((paragraph) => (
                <p key={paragraph} className="article-step-body">
                  {paragraph}
                </p>
              ))}
            </article>
          </Selectable>
        ))}
      </div>
    </SelectionProvider>
  )
}

function SelectedCodeFrame({ steps, fileName }) {
  const [selectedIndex] = useSelectedIndex()
  const step = steps[selectedIndex] ?? steps[0]

  return <CodeFrame title={step.eyebrow} code={step.highlighted} fileName={fileName} />
}

function FocusedPre(props) {
  return <InnerPre merge={props} className="code-pre" />
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
    return <InnerPre merge={this.props} className="code-pre" />
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
        className="code-mark-wrap"
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
