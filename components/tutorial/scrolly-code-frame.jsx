"use client"

import { useState, useCallback, useEffect, useRef } from "react"
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
        <span className="text-[10px] font-bold text-primary">已复制</span>
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

function FileDropdown({ fileNames, activeFile, onSelectFile, changedFiles, viewedFiles }) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  if (!fileNames || fileNames.length <= 1) return null

  const changedSet = new Set(changedFiles || [])
  const viewedSet = new Set(viewedFiles || [])

  const needsReview = fileNames.filter(f => changedSet.has(f) && !viewedSet.has(f))
  const reviewed = fileNames.filter(f => changedSet.has(f) && viewedSet.has(f))
  const other = fileNames.filter(f => !changedSet.has(f))

  const hasUnread = needsReview.length > 0
  const hasChanges = changedSet.size > 0

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [open])

  const handleSelect = (name) => {
    onSelectFile(name)
    setOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-1 rounded-md text-slate-500 transition-colors hover:text-slate-300"
        aria-label="切换文件"
      >
        {hasChanges && (
          hasUnread ? (
            <span className="flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400 transition-colors hover:bg-blue-500/25">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
              {needsReview.length} 个待看
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              已全部查看
            </span>
          )
        )}
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-white/10 bg-[#2a2a3e] shadow-2xl">
          {needsReview.length > 0 && (
            <div className="border-b border-white/5">
              <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-400/80">
                待看变更
              </div>
              {needsReview.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelect(name)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                    name === activeFile
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-blue-400" />
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          )}

          {reviewed.length > 0 && (
            <div className={other.length > 0 ? "border-b border-white/5" : ""}>
              <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
                已阅变更
              </div>
              {reviewed.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelect(name)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                    name === activeFile
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          )}

          {other.length > 0 && (
            <div>
              <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                其他文件
              </div>
              {other.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelect(name)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                    name === activeFile
                      ? "bg-white/10 text-slate-300"
                      : "text-slate-500 hover:bg-white/5 hover:text-slate-400"
                  }`}
                >
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full border border-slate-600" />
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CodeFrame({ title, code, fileName, highlightedFiles, activeFile: defaultActiveFile, changedFiles, viewedFiles, onFileViewed }) {
  const fileNames = highlightedFiles ? Object.keys(highlightedFiles) : null
  const [selectedFile, setSelectedFile] = useState(null)
  const activeFile = selectedFile || defaultActiveFile || fileName
  const activeCode = highlightedFiles
    ? highlightedFiles[activeFile] || code
    : code

  const handleSelectFile = (name) => {
    setSelectedFile(name)
    onFileViewed?.(name)
  }

  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden px-6 pb-8">
      <div className="mb-6 flex shrink-0 items-center justify-between pt-10">
        <p className="min-w-0 truncate text-xs font-bold uppercase text-slate-400">
          {title || ""}
        </p>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-bold uppercase text-slate-500 max-w-[200px]">
            {activeFile || fileName || "code"}
          </span>
          {fileNames && fileNames.length > 1 && (
            <FileDropdown
              fileNames={fileNames}
              activeFile={activeFile}
              onSelectFile={handleSelectFile}
              changedFiles={changedFiles}
              viewedFiles={viewedFiles}
            />
          )}
          <CopyButton code={activeCode} />
        </div>
      </div>
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
  const [viewedFiles, setViewedFiles] = useState(() => defaultFile ? [defaultFile] : [])
  const activeFile = selectedFile || defaultFile
  const activeCode = highlightedFiles
    ? highlightedFiles[activeFile] || step.highlighted
    : step.highlighted

  const handleSelectFile = (name) => {
    setSelectedFile(name)
    setViewedFiles(prev => prev.includes(name) ? prev : [...prev, name])
  }

  return (
    <div className="mt-8 max-h-[60vh] overflow-hidden rounded-lg border border-black/10 bg-[#1e1e2e] shadow-2xl lg:hidden">
      <div className="flex items-center justify-between bg-white/5 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            第 {index + 1} / {total} 步
          </span>
          <p className="truncate text-xs font-bold uppercase text-slate-400">
            {step.eyebrow || "代码演示"}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-slate-500 max-w-[120px]">
            {activeFile || fileName || "code"}
          </span>
          {fileNames && fileNames.length > 1 && (
            <FileDropdown
              fileNames={fileNames}
              activeFile={activeFile}
              onSelectFile={handleSelectFile}
              changedFiles={step.changedFiles}
              viewedFiles={viewedFiles}
            />
          )}
          <CopyButton code={activeCode} />
        </div>
      </div>
      <div className="code-content max-h-[40vh] overflow-auto px-5 py-4 text-[13px] leading-[1.55]">
        <Pre code={activeCode} handlers={[focus, mark, changeIndicator]} />
      </div>
    </div>
  )
}

export function SelectedCodeFrame({ steps, fileName }) {
  const [selectedIndex] = useSelectedIndex()
  const step = steps[selectedIndex] ?? steps[0]

  const [viewedFilesMap, setViewedFilesMap] = useState({})

  useEffect(() => {
    if (!step) return
    const defaultFile = step.activeFile || fileName
    if (!defaultFile) return
    setViewedFilesMap(prev => {
      const current = prev[selectedIndex] || []
      if (current.includes(defaultFile)) return prev
      return { ...prev, [selectedIndex]: [...current, defaultFile] }
    })
  }, [selectedIndex, step, fileName])

  const viewedFiles = viewedFilesMap[selectedIndex] || []

  const handleFileViewed = useCallback((file) => {
    setViewedFilesMap(prev => {
      const current = prev[selectedIndex] || []
      if (current.includes(file)) return prev
      return { ...prev, [selectedIndex]: [...current, file] }
    })
  }, [selectedIndex])

  if (!step) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-sm text-muted-foreground">
        没有步骤
      </div>
    )
  }

  return (
    <CodeFrame
      key={selectedIndex}
      title={step.eyebrow}
      code={step.highlighted}
      fileName={fileName}
      highlightedFiles={step.highlightedFiles}
      activeFile={step.activeFile || fileName}
      changedFiles={step.changedFiles}
      viewedFiles={viewedFiles}
      onFileViewed={handleFileViewed}
    />
  )
}
