"use client"

import { useState } from "react"
import { Pre } from "codehike/code"
import { useSelectedIndex } from "codehike/utils/selection"
import {
  changeIndicator,
  focus,
  mark,
  tokenTransitions,
} from "./scrolly-handlers.jsx"

function FileTabs({ fileNames, activeFile, onSelectFile }) {
  if (!fileNames || fileNames.length <= 1) return null

  return (
    <div className="flex items-center gap-0 border-b border-white/10">
      {fileNames.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onSelectFile(name)}
          className={`px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
            name === activeFile
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  )
}

export function CodeFrame({ title, code, fileName, highlightedFiles, activeFile: defaultActiveFile }) {
  const fileNames = highlightedFiles ? Object.keys(highlightedFiles) : null
  const [selectedFile, setSelectedFile] = useState(null)
  const activeFile = selectedFile || defaultActiveFile || fileName
  const activeCode = highlightedFiles
    ? highlightedFiles[activeFile] || code
    : code

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-y-auto px-6 pb-6">
      <div className="mb-[18px] flex items-center justify-between pt-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
          {title || ""}
        </p>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
          {activeFile || fileName || "code"}
        </span>
      </div>
      {fileNames && fileNames.length > 1 && (
        <FileTabs
          fileNames={fileNames}
          activeFile={activeFile}
          onSelectFile={setSelectedFile}
        />
      )}
      <div className="code-content overflow-x-auto">
        <Pre code={activeCode} handlers={[focus, mark, changeIndicator, tokenTransitions]} />
      </div>
    </div>
  )
}

export function MobileCodeFrame({ step, fileName }) {
  const highlightedFiles = step.highlightedFiles
  const fileNames = highlightedFiles ? Object.keys(highlightedFiles) : null
  const defaultFile = step.activeFile || fileName
  const [selectedFile, setSelectedFile] = useState(null)
  const activeFile = selectedFile || defaultFile
  const activeCode = highlightedFiles
    ? highlightedFiles[activeFile] || step.highlighted
    : step.highlighted

  return (
    <div className="mt-5 max-h-[40vh] overflow-y-auto rounded-md border border-black/10 bg-[#1e1e2e] px-4 py-3 lg:hidden">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
          {step.eyebrow || ""}
        </p>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
          {activeFile || fileName || "code"}
        </span>
      </div>
      {fileNames && fileNames.length > 1 && (
        <FileTabs
          fileNames={fileNames}
          activeFile={activeFile}
          onSelectFile={setSelectedFile}
        />
      )}
      <div className="code-content overflow-x-auto">
        <Pre code={activeCode} handlers={[focus, mark, changeIndicator]} />
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

  return (
    <CodeFrame
      title={step.eyebrow}
      code={step.highlighted}
      fileName={fileName}
      highlightedFiles={step.highlightedFiles}
      activeFile={step.activeFile || fileName}
    />
  )
}
