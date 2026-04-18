'use client'

import type { PatchDraft, PatchValidationState } from './types'

interface PatchItemProps {
  patch: PatchDraft
  index: number
  isMultiFile: boolean
  fileNames: string[]
  validationState?: PatchValidationState
  onUpdate: (localId: string, field: 'find' | 'replace' | 'file', value: string) => void
  onDelete: (localId: string) => void
}

export function PatchItem({
  patch,
  index,
  isMultiFile,
  fileNames,
  validationState,
  onUpdate,
  onDelete,
}: PatchItemProps) {
  return (
    <div className="space-y-3 rounded-lg bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Patch {index + 1}</strong>
        <div className="flex items-center gap-2">
          {isMultiFile && (
            <select
              className="h-6 rounded border border-border bg-card px-1.5 text-[10px] text-muted-foreground"
              value={patch.file || ''}
              onChange={(e) => onUpdate(patch.localId, 'file', e.target.value)}
            >
              <option value="">自动</option>
              {fileNames.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors"
            onClick={() => onDelete(patch.localId)}
          >
            删除
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        <label className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">find</span>
            {validationState && patch.find.trim() ? (
              validationState.isValid ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600">
                  ✓ 唯一匹配{validationState.result.lineNumber ? ` (L${validationState.result.lineNumber})` : ''}
                </span>
              ) : validationState.result.status === 'ambiguous' ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                  ⚠ {validationState.result.matchCount} 处匹配
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-500">
                  ✗ 未找到
                </span>
              )
            ) : null}
          </div>
          <textarea
            className="flex min-h-[80px] w-full rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs font-mono transition-colors focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            value={patch.find}
            onChange={(e) => onUpdate(patch.localId, 'find', e.target.value)}
            rows={4}
          />
        </label>

        <label className="space-y-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground">replace</span>
          <textarea
            className="flex min-h-[120px] w-full rounded-md border border-border bg-muted/20 px-2 py-1.5 text-xs font-mono transition-colors focus:bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            value={patch.replace}
            onChange={(e) => onUpdate(patch.localId, 'replace', e.target.value)}
            rows={6}
          />
        </label>
      </div>
    </div>
  )
}
