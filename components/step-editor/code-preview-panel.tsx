'use client'

import { CodeDiffView } from './code-diff-view'
import { CodeSelectionMenu } from './code-selection-menu'
import type { DiffLine, SelectionMode, FocusRange } from './types'

interface CodePreviewPanelProps {
  // Selection
  selectionMode: SelectionMode
  onSelectionModeChange: (mode: SelectionMode) => void
  focusRange: FocusRange | null
  onFocusRangeClear: () => void
  focusFile?: string | null
  hasHiddenFocus?: boolean
  markedLines: Set<number>
  markCount: number
  onMarkedLinesClear: () => void

  // Diff data
  previousCode: string
  currentCode: string
  previewError: string | null
  diffSummary: { added: number; removed: number; modified: number }
  displayedDiffLines: DiffLine[]

  // File context
  isMultiFile: boolean
  fileNames: string[]
  previewFile: string
  onPreviewFileChange: (file: string) => void
  language: string

  // Interaction
  onLineClick: (lineNumber: number, event: React.MouseEvent) => void
  diffViewRef: React.RefObject<HTMLDivElement | null>

  // Selection menu
  onSetPatchFind: (text: string) => void
}

const MODE_OPTIONS: [SelectionMode, string][] = [
  ['off', '关闭'],
  ['focus', 'Focus'],
  ['mark', 'Mark'],
]

export function CodePreviewPanel({
  selectionMode,
  onSelectionModeChange,
  focusRange,
  onFocusRangeClear,
  focusFile,
  hasHiddenFocus = false,
  markedLines,
  markCount,
  onMarkedLinesClear,
  previousCode,
  currentCode,
  previewError,
  diffSummary,
  displayedDiffLines,
  isMultiFile,
  fileNames,
  previewFile,
  onPreviewFileChange,
  language,
  onLineClick,
  diffViewRef,
  onSetPatchFind,
}: CodePreviewPanelProps) {
  function handleSelectionModeChange(mode: SelectionMode) {
    onSelectionModeChange(mode)
    if (mode === 'off') {
      onFocusRangeClear()
      onMarkedLinesClear()
    }
  }

  return (
    <section className="space-y-4 rounded-lg bg-slate-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-slate-700">代码预览</h4>
          <p className="text-[10px] text-slate-400">
            {selectionMode === 'focus'
              ? isMultiFile
                ? `点击行选择高亮范围（Shift+点击扩展），当前会绑定到 ${previewFile}`
                : '点击行选择高亮范围（Shift+点击扩展）'
              : selectionMode === 'mark'
              ? '点击行切换标记'
              : '上一步 vs 当前步骤。'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold">
          <div className="flex rounded border border-slate-200 bg-white overflow-hidden">
            {MODE_OPTIONS.map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleSelectionModeChange(mode)}
                className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                  selectionMode === mode
                    ? mode === 'focus'
                      ? 'bg-blue-50 text-blue-700'
                      : mode === 'mark'
                      ? 'bg-purple-50 text-purple-700'
                      : 'bg-slate-100 text-slate-700'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {isMultiFile && (
            <select
              className="h-7 rounded border border-slate-200 bg-white px-2 text-[10px] font-medium text-slate-500"
              value={previewFile}
              onChange={(e) => onPreviewFileChange(e.target.value)}
            >
              {fileNames.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 border border-emerald-200">
            +{diffSummary.added}
          </span>
          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 border border-amber-200">
            ~{diffSummary.modified}
          </span>
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 border border-rose-200">
            -{diffSummary.removed}
          </span>
        </div>
      </div>

      {/* Focus/Mark selection summary */}
      {focusRange && selectionMode === 'focus' && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-blue-700 border border-blue-200 font-medium">
            Focus: L{focusRange.startLine}{focusRange.startLine !== focusRange.endLine ? `–L${focusRange.endLine}` : ''}
          </span>
          {isMultiFile ? (
            <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
              当前预览: {previewFile}
            </span>
          ) : null}
          {focusFile ? (
            <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
              绑定文件: {focusFile}
            </span>
          ) : null}
          <button
            type="button"
            className="text-[10px] text-slate-400 hover:text-slate-600"
            onClick={onFocusRangeClear}
          >
            清空
          </button>
        </div>
      )}
      {!focusRange && hasHiddenFocus && selectionMode === 'focus' && (
        <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200">
              Focus 未在此文件显示
            </span>
            <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
              当前预览: {previewFile}
            </span>
            {focusFile ? (
              <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
                绑定文件: {focusFile}
              </span>
            ) : null}
          </div>
          <p>切换到绑定文件后可继续调整当前 Focus。</p>
        </div>
      )}
      {markedLines.size > 0 && selectionMode === 'mark' && (
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-purple-700 border border-purple-200 font-medium">
            {markCount} 个标记
          </span>
          <button
            type="button"
            className="text-[10px] text-slate-400 hover:text-slate-600"
            onClick={onMarkedLinesClear}
          >
            清空
          </button>
        </div>
      )}

      {previewError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <strong className="block font-bold">Patch 预览失败</strong>
          <p className="mt-0.5 leading-5">{previewError}</p>
        </div>
      ) : null}

      <div ref={diffViewRef}>
        {!previewError && previousCode !== currentCode ? (
          <CodeDiffView
            diffLines={displayedDiffLines}
            language={language}
            height={selectionMode !== 'off' ? '400px' : '280px'}
            interactive={selectionMode !== 'off'}
            selectedFocusRange={focusRange}
            selectedMarkLines={markedLines}
            onLineClick={onLineClick}
          />
        ) : !previewError ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
            当前步骤无代码变更
          </div>
        ) : null}
      </div>

      {selectionMode === 'off' && (
        <CodeSelectionMenu
          containerRef={diffViewRef}
          onSetPatchFind={onSetPatchFind}
        />
      )}
    </section>
  )
}
