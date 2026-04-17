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

function CopyButton({ code }) {
  const [copied, setCopied] = useState(false)
  const textToCopy = typeof code === "string" ? code : (code?.code || code?.value || null)

  if (!textToCopy) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
      aria-label="复制代码"
    >
      {copied ? (
        <span className="text-[10px] font-bold text-cyan-500">已复制</span>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  )
}

function FileTabs({ fileNames, activeFile, onSelectFile, changedFiles }) {
  if (!fileNames || fileNames.length <= 1) return null

  const changedSet = changedFiles ? new Set(changedFiles) : new Set()

  return (
    <div className="flex flex-wrap items-center gap-0 border-b border-white/10">
      {fileNames.map((name) => {
        const hasChanges = changedSet.has(name)
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelectFile(name)}
            className={`flex min-h-[44px] items-center gap-1.5 px-4 py-2 text-xs font-medium uppercase transition-colors ${
              name === activeFile
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {hasChanges && (
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            )}
            {name}
          </button>
        )
      })}
    </div>
  )
}

export function CodeFrame({ title, code, fileName, highlightedFiles, activeFile: defaultActiveFile, changedFiles }) {
  const fileNames = highlightedFiles ? Object.keys(highlightedFiles) : null
  const [selectedFile, setSelectedFile] = useState(null)
  const activeFile = selectedFile || defaultActiveFile || fileName
  const activeCode = highlightedFiles
    ? highlightedFiles[activeFile] || code
    : code
  const changedSet = changedFiles ? new Set(changedFiles) : new Set()
  const activeFileHasChanges = changedSet.has(activeFile)

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden px-6 pb-8">
      <div className="mb-6 flex shrink-0 items-center justify-between pt-10">
        <p className="min-w-0 truncate text-xs font-bold uppercase text-slate-400">
          {title || ""}
        </p>
        <div className="flex min-w-0 items-center gap-2">
          {activeFileHasChanges && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          )}
          <span className="truncate text-xs font-bold uppercase text-slate-500">
            {activeFile || fileName || "code"}
          </span>
          <CopyButton code={activeCode} />
        </div>
      </div>
      {fileNames && fileNames.length > 1 && (
        <FileTabs
          fileNames={fileNames}
          activeFile={activeFile}
          onSelectFile={setSelectedFile}
          changedFiles={changedFiles}
        />
      )}
      <div className="code-content overflow-x-auto overflow-y-auto text-[13px] leading-[1.55]">
        <Pre code={activeCode} handlers={[focus, mark, changeIndicator, tokenTransitions]} />
      </div>
    </div>
  )
}

export function MobileCodeFrame({ step, fileName, index, total }) {
  const highlightedFiles = step.highlightedFiles
  const fileNames = highlightedFiles ? Object.keys(highlightedFiles) : null
  const defaultFile = step.activeFile || fileName
  const [selectedFile, setSelectedFile] = useState(null)
  const activeFile = selectedFile || defaultFile
  const activeCode = highlightedFiles
    ? highlightedFiles[activeFile] || step.highlighted
    : step.highlighted
  const changedSet = step.changedFiles ? new Set(step.changedFiles) : new Set()
  const activeFileHasChanges = changedSet.has(activeFile)

  return (
    <div className="mt-8 max-h-[60vh] overflow-hidden rounded-lg border border-black/10 bg-[#1e1e2e] shadow-2xl lg:hidden">
      <div className="flex items-center justify-between bg-white/5 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded bg-cyan-600 px-2 py-0.5 text-[10px] font-bold text-white">
            第 {index + 1} / {total} 步
          </span>
          <p className="truncate text-xs font-bold uppercase text-slate-400">
            {step.eyebrow || "代码演示"}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {activeFileHasChanges && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          )}
          <span className="truncate text-xs font-medium text-slate-500">
            {activeFile || fileName || "code"}
          </span>
          <CopyButton code={activeCode} />
        </div>
      </div>
      {fileNames && fileNames.length > 1 && (
        <FileTabs
          fileNames={fileNames}
          activeFile={activeFile}
          onSelectFile={setSelectedFile}
          changedFiles={step.changedFiles}
        />
      )}
      <div className="code-content max-h-[40vh] overflow-auto px-5 py-4 text-[13px] leading-[1.55]">
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
      changedFiles={step.changedFiles}
    />
  )
}
