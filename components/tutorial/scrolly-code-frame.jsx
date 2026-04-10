"use client"

import { Pre } from "codehike/code"
import { useSelectedIndex } from "codehike/utils/selection"
import {
  changeIndicator,
  focus,
  mark,
  tokenTransitions,
} from "./scrolly-handlers.jsx"

export function CodeFrame({ title, code, fileName }) {
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

export function MobileCodeFrame({ step, fileName }) {
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

export function SelectedCodeFrame({ steps, fileName }) {
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
