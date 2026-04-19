'use client'

import { createUuid } from '@/lib/utils/uuid'
import type { FocusRange, MarkDraft } from './types'

interface FocusMarksPanelProps {
  focusRange: FocusRange | null
  setFocusRange: (value: FocusRange | null) => void
  focusFile: string
  setFocusFile: (value: string) => void
  previewFile: string
  hasHiddenFocus: boolean
  marks: MarkDraft[]
  setMarks: React.Dispatch<React.SetStateAction<MarkDraft[]>>
  isMultiFile: boolean
  fileNames: string[]
}

function FileSelect({ value, onChange, fileNames }: {
  value: string
  onChange: (v: string) => void
  fileNames: string[]
}) {
  return (
    <select
      className="h-6 rounded border border-border bg-card px-1.5 text-[10px] text-muted-foreground"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">自动</option>
      {fileNames.map((f) => (
        <option key={f} value={f}>{f}</option>
      ))}
    </select>
  )
}

export function FocusMarksPanel({
  focusRange,
  setFocusRange,
  focusFile,
  setFocusFile,
  previewFile,
  hasHiddenFocus,
  marks,
  setMarks,
  isMultiFile,
  fileNames,
}: FocusMarksPanelProps) {
  return (
    <details className="group space-y-3">
      <summary className="flex cursor-pointer items-center gap-3 rounded-lg bg-muted/20 p-3 list-none">
        <svg className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-foreground">Focus / Marks</h5>
          {focusRange ? (
            <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 border border-blue-200 font-medium">
              Focus: L{focusRange.startLine}{focusRange.startLine !== focusRange.endLine ? `–L${focusRange.endLine}` : ''}
            </span>
          ) : null}
          {marks.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700 border border-purple-200 font-medium">
              {marks.length} mark{marks.length > 1 ? 's' : ''}
            </span>
          ) : null}
          {!focusRange && marks.length === 0 ? (
            <span className="text-[10px] text-muted-foreground">未设置（高级编辑）</span>
          ) : null}
        </div>
      </summary>

      <div className="space-y-3 pl-0">
        {/* Focus */}
        <div className="space-y-3 rounded-lg bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-foreground">Focus</h5>
            <div className="flex items-center gap-2">
              {isMultiFile && (
                <FileSelect value={focusFile} onChange={setFocusFile} fileNames={fileNames} />
              )}
              <button
                type="button"
                className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => { setFocusRange(null); setFocusFile(''); }}
              >
                清空
              </button>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            {focusRange ? (
              <div className="space-y-1">
                {isMultiFile ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-border">
                      当前预览: {previewFile}
                    </span>
                    {focusFile ? (
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-border">
                        绑定文件: {focusFile}
                      </span>
                    ) : null}
                    {hasHiddenFocus ? (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 border border-blue-200">
                        Focus 未在此文件显示
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <span className="block font-mono text-foreground">
                  start: {focusRange.startLine}, end: {focusRange.endLine}
                </span>
                <span className="block text-[10px]">
                  {isMultiFile && focusFile
                    ? `当前 Focus 绑定到 ${focusFile}。切换预览文件时，仅在对应文件里显示。`
                    : '点击左侧代码行选择范围；Shift+点击可扩展到连续多行。'}
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                {isMultiFile ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-border">
                      当前预览: {previewFile}
                    </span>
                  </div>
                ) : null}
                <span>在左侧代码预览里按行选择 Focus 范围</span>
                <span className="block text-[10px]">
                  {isMultiFile
                    ? '多文件模式下，新的 Focus 会自动绑定到当前预览文件。'
                    : 'Shift+点击可快速扩展到连续多行。'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Marks */}
        <div className="space-y-3 rounded-lg bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-foreground">Marks</h5>
            <button
              type="button"
              className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-card px-2.5 text-[10px] font-bold text-foreground transition-colors hover:bg-accent"
              onClick={() =>
                setMarks((current) => [
                  ...current,
                  { localId: createUuid(), start: null, end: null, color: '#2563eb' },
                ])
              }
            >
              + 添加 Mark
            </button>
          </div>

          <div className="space-y-3">
            {marks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 px-4 py-4 text-center text-xs text-muted-foreground">
                当前步骤没有 mark
              </div>
            ) : null}

            {marks.map((mark, index) => (
              <div key={mark.localId} className="space-y-3 rounded-md bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mark {index + 1}</strong>
                  <div className="flex items-center gap-2">
                    {isMultiFile && (
                      <FileSelect
                        value={mark.file || ''}
                        onChange={(v) =>
                          setMarks((current) =>
                            current.map((item) =>
                              item.localId === mark.localId
                                ? { ...item, file: v || undefined }
                                : item
                            )
                          )
                        }
                        fileNames={fileNames}
                      />
                    )}
                    <button
                      type="button"
                      className="text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors"
                      onClick={() =>
                        setMarks((current) =>
                          current.filter((item) => item.localId !== mark.localId)
                        )
                      }
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div className="grid gap-3">
                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">范围</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        type="number"
                        min={1}
                        value={mark.start ?? ''}
                        onChange={(e) =>
                          setMarks((current) =>
                            current.map((item) =>
                              item.localId === mark.localId
                                ? {
                                    ...item,
                                    start: e.target.value === ''
                                      ? null
                                      : Math.max(1, Number(e.target.value) || 1),
                                  }
                                : item
                            )
                          )
                        }
                        placeholder="start"
                      />
                      <input
                        className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        type="number"
                        min={1}
                        value={mark.end ?? ''}
                        onChange={(e) =>
                          setMarks((current) =>
                            current.map((item) =>
                              item.localId === mark.localId
                                ? {
                                    ...item,
                                    end: e.target.value === ''
                                      ? null
                                      : Math.max(1, Number(e.target.value) || 1),
                                  }
                                : item
                            )
                          )
                        }
                        placeholder="end"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {mark.start !== null && mark.end !== null
                        ? `L${mark.start}${mark.start !== mark.end ? `–L${mark.end}` : ''}`
                        : '未设置范围'}
                    </p>
                  </label>

                  <label className="space-y-1">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">颜色</span>
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded border border-border" style={{ backgroundColor: mark.color }} />
                      <input
                        className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        type="text"
                        value={mark.color}
                        onChange={(e) =>
                          setMarks((current) =>
                            current.map((item) =>
                              item.localId === mark.localId
                                ? { ...item, color: e.target.value }
                                : item
                            )
                          )
                        }
                        placeholder="#2563eb"
                      />
                    </div>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  )
}
