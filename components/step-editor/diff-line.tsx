'use client'

import type { DiffLine } from './types'

interface DiffLineProps {
  line: DiffLine
  compact?: boolean
}

const LINE_STYLES: Record<DiffLine['type'], { container: string; marker: string; markerChar: string }> = {
  added: {
    container: 'bg-emerald-50 border-l-2 border-emerald-500',
    marker: 'text-emerald-600',
    markerChar: '+',
  },
  removed: {
    container: 'bg-red-50 border-l-2 border-red-500',
    marker: 'text-red-600',
    markerChar: '-',
  },
  modified: {
    container: 'bg-amber-50 border-l-2 border-amber-500',
    marker: 'text-amber-600',
    markerChar: '~',
  },
  unchanged: {
    container: 'bg-white',
    marker: '',
    markerChar: '',
  },
}

export function DiffLineComponent({ line, compact = false }: DiffLineProps) {
  const style = LINE_STYLES[line.type]

  return (
    <div className={`flex ${style.container}`}>
      {/* Gutter: line number + change marker */}
      <div
        className={`shrink-0 select-none text-right ${
          compact ? 'w-12 px-1.5' : 'w-16 px-2'
        } border-r border-slate-200 text-slate-400`}
      >
        <span className="inline-block w-1/2 text-xs font-mono leading-6">
          {line.lineNumber}
        </span>
        <span
          className={`inline-block w-1/2 text-xs font-mono font-bold leading-6 ${style.marker}`}
        >
          {style.markerChar || '\u00A0'}
        </span>
      </div>

      {/* Code content */}
      <div
        className={`flex-1 min-w-0 font-mono text-sm whitespace-pre leading-6 ${
          compact ? 'px-2' : 'px-3'
        }`}
      >
        {line.content || '\u00A0'}
      </div>
    </div>
  )
}
