'use client'

import { memo } from 'react'
import type { DiffLine, FocusRange } from './types'
import { DiffLineComponent } from './diff-line'

interface CodeDiffViewProps {
  diffLines: DiffLine[]
  language?: string
  height?: string
  compact?: boolean
  interactive?: boolean
  selectedFocusRange?: FocusRange | null
  selectedMarkLines?: Set<number>
  onLineClick?: (lineNumber: number, event: React.MouseEvent) => void
}

function computeDiffStats(lines: DiffLine[]) {
  let added = 0
  let removed = 0
  let modified = 0

  for (const line of lines) {
    switch (line.type) {
      case 'added':
        added++
        break
      case 'removed':
        removed++
        break
      case 'modified':
        modified++
        break
    }
  }

  return { added, removed, modified }
}

function formatDiffStats(stats: { added: number; removed: number; modified: number }): string {
  const parts: string[] = []
  if (stats.added > 0) parts.push(`${stats.added} added`)
  if (stats.removed > 0) parts.push(`${stats.removed} removed`)
  if (stats.modified > 0) parts.push(`${stats.modified} modified`)
  return parts.length > 0 ? parts.join(', ') : 'No changes'
}

function getLineSelectionType(
  line: DiffLine,
  focusRange: FocusRange | null | undefined,
  markLines: Set<number> | undefined,
): 'focus' | 'mark' | 'none' {
  // Removed lines use "before" state line numbers; skip highlighting
  if (line.type === 'removed') return 'none'
  if (focusRange && line.lineNumber >= focusRange.startLine && line.lineNumber <= focusRange.endLine) {
    return 'focus'
  }
  if (markLines && markLines.has(line.lineNumber)) {
    return 'mark'
  }
  return 'none'
}

export const CodeDiffView = memo(function CodeDiffView({
  diffLines,
  language,
  height,
  compact = false,
  interactive = false,
  selectedFocusRange,
  selectedMarkLines,
  onLineClick,
}: CodeDiffViewProps) {
  const stats = computeDiffStats(diffLines)
  const statsText = formatDiffStats(stats)
  const markLines = selectedMarkLines ?? new Set<number>()

  const linesContainer = (
    <div className="font-mono">
      {diffLines.map((line, index) => {
        const selectionType = interactive
          ? getLineSelectionType(line, selectedFocusRange, markLines)
          : 'none'

        return (
          <DiffLineComponent
            key={index}
            line={line}
            compact={compact}
            interactive={interactive}
            selectionType={selectionType}
            onLineClick={onLineClick}
          />
        )
      })}
    </div>
  )

  return (
    <div className="border border-slate-200 rounded overflow-hidden">
      {/* Header with diff stats */}
      <div className="flex items-center justify-between bg-slate-50 border-b border-slate-200 px-3 py-1.5">
        <span className="text-xs text-slate-600 font-medium">
          {statsText}
        </span>
        {language && (
          <span className="text-xs text-slate-400">{language}</span>
        )}
      </div>

      {/* Diff lines, optionally scrollable */}
      {height ? (
        <div style={{ maxHeight: height }} className="overflow-y-auto">
          {linesContainer}
        </div>
      ) : (
        linesContainer
      )}
    </div>
  )
})
