'use client'

import { useMemo, useState } from 'react'
import { CodeDiffView } from './code-diff-view'
import { computeDiffLines, computeIntermediatePatchStates, formatUnifiedDiff } from './diff-utils'

interface IntermediatePatchPreviewProps {
  previousCode: string
  patches: Array<{ find: string; replace: string }>
  language?: string
}

export function IntermediatePatchPreview({
  previousCode,
  patches,
  language,
}: IntermediatePatchPreviewProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const states = useMemo(
    () => computeIntermediatePatchStates(previousCode, patches),
    [previousCode, patches]
  )

  if (patches.length < 2) {
    return null
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden mt-4">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
          Patch 逐步预览 ({patches.length} patches)
        </span>
      </div>

      {states.map((state) => {
        const isOpen = openIndex === state.patchIndex

        return (
          <div key={state.patchIndex} className="border-t border-border">
            <button
              type="button"
              className="flex items-center justify-between w-full px-3 py-2 bg-muted/20 cursor-pointer hover:bg-accent"
              onClick={() => setOpenIndex(isOpen ? null : state.patchIndex)}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-muted-foreground">
                  Patch {state.patchIndex + 1}
                </span>
                {state.error ? (
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                    Error
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                    OK
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {isOpen ? '\u25BC' : '\u25B6'}
              </span>
            </button>

            {isOpen && (
              <div className="px-3 py-2 bg-card">
                {state.error ? (
                  <p className="text-xs text-red-600">{state.error}</p>
                ) : (
                  <CodeDiffView
                    diffLines={formatUnifiedDiff(
                      computeDiffLines(state.beforeCode, state.afterCode),
                      3
                    )}
                    language={language}
                    compact
                  />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
