'use client'

import type { DiffLine } from './types'
import { DiffLineComponent } from './diff-line'

interface CodeDiffViewProps {
  diffLines: DiffLine[]
  language?: string
  height?: string
  compact?: boolean
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

export function CodeDiffView({
  diffLines,
  language,
  height,
  compact = false,
}: CodeDiffViewProps) {
  const stats = computeDiffStats(diffLines)
  const statsText = formatDiffStats(stats)

  const linesContainer = (
    <div className="font-mono">
      {diffLines.map((line, index) => (
        <DiffLineComponent key={index} line={line} compact={compact} />
      ))}
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
}
