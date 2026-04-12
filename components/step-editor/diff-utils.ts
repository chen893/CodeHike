import { diffArrays } from 'diff'
import { countOccurrences } from '../../lib/tutorial/draft-code'
import type {
  DiffLine,
  PatchValidationResult,
  IntermediatePatchState,
} from './types'

// Re-export all types for consumers
export type { DiffLine, PatchValidationResult, PatchValidationState, IntermediatePatchState } from './types'

/**
 * Compute diff lines between two code strings, tracking line numbers in both
 * the "before" and "after" states. Adjacent removed+added lines at the same
 * position are collapsed into a single "modified" entry.
 */
export function computeDiffLines(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')

  const rawDiff = diffArrays(beforeLines, afterLines)

  const result: DiffLine[] = []
  let beforeLine = 0
  let afterLine = 0

  // Collect items so we can look ahead and collapse adjacent removed+added pairs.
  const items: Array<{ type: 'added' | 'removed' | 'unchanged'; lines: string[] }> = []
  for (const part of rawDiff) {
    if (part.added) {
      items.push({ type: 'added', lines: part.value })
    } else if (part.removed) {
      items.push({ type: 'removed', lines: part.value })
    } else {
      items.push({ type: 'unchanged', lines: part.value })
    }
  }

  let i = 0
  while (i < items.length) {
    const item = items[i]

    // Look ahead: if this is a "removed" immediately followed by "added",
    // collapse them into "modified" entries where possible.
    if (
      item.type === 'removed' &&
      i + 1 < items.length &&
      items[i + 1].type === 'added'
    ) {
      const nextItem = items[i + 1]
      const maxPairs = Math.max(item.lines.length, nextItem.lines.length)

      for (let p = 0; p < maxPairs; p++) {
        const removedLine = p < item.lines.length ? item.lines[p] : undefined
        const addedLine = p < nextItem.lines.length ? nextItem.lines[p] : undefined

        beforeLine++

        if (removedLine !== undefined && addedLine !== undefined) {
          afterLine++
          // Show the "after" content as the primary view, with before line number tracked.
          result.push({
            type: 'modified',
            content: addedLine,
            lineNumber: afterLine,
            beforeLineNumber: beforeLine,
          })
        } else if (removedLine !== undefined) {
          // Pure removal (more removed lines than added)
          result.push({
            type: 'removed',
            content: removedLine,
            lineNumber: beforeLine,
            beforeLineNumber: beforeLine,
          })
        } else if (addedLine !== undefined) {
          // Pure addition (more added lines than removed)
          afterLine++
          result.push({
            type: 'added',
            content: addedLine,
            lineNumber: afterLine,
            beforeLineNumber: beforeLine,
          })
        }
      }

      i += 2 // consumed both items
      continue
    }

    if (item.type === 'unchanged') {
      for (const line of item.lines) {
        beforeLine++
        afterLine++
        result.push({
          type: 'unchanged',
          content: line,
          lineNumber: afterLine,
          beforeLineNumber: beforeLine,
        })
      }
    } else if (item.type === 'removed') {
      for (const line of item.lines) {
        beforeLine++
        result.push({
          type: 'removed',
          content: line,
          lineNumber: beforeLine,
          beforeLineNumber: beforeLine,
        })
      }
    } else if (item.type === 'added') {
      for (const line of item.lines) {
        afterLine++
        result.push({
          type: 'added',
          content: line,
          lineNumber: afterLine,
          beforeLineNumber: beforeLine,
        })
      }
    }

    i++
  }

  return result
}

/**
 * Return only changed lines plus N lines of surrounding context.
 * Keeps original line numbers intact.
 */
export function formatUnifiedDiff(
  diffLines: DiffLine[],
  contextLines: number = 10
): DiffLine[] {
  // Identify indices of changed lines.
  const changedIndices: number[] = []
  for (let idx = 0; idx < diffLines.length; idx++) {
    if (diffLines[idx].type !== 'unchanged') {
      changedIndices.push(idx)
    }
  }

  if (changedIndices.length === 0) {
    return []
  }

  // Build a set of indices to include (changes + context window).
  const includeSet = new Set<number>()
  for (const ci of changedIndices) {
    const start = Math.max(0, ci - contextLines)
    const end = Math.min(diffLines.length - 1, ci + contextLines)
    for (let j = start; j <= end; j++) {
      includeSet.add(j)
    }
  }

  return diffLines.filter((_, idx) => includeSet.has(idx))
}

/**
 * Classify whether a patch's find text can be uniquely located within the
 * previous code. Returns the match status and, for unique matches, the
 * 1-based line number where the match starts.
 */
export function classifyPatchValidation(
  previousCode: string,
  findText: string
): PatchValidationResult {
  const matchCount = countOccurrences(previousCode, findText)

  if (matchCount === 0) {
    return { status: 'not_found', matchCount: 0 }
  }

  if (matchCount > 1) {
    return { status: 'ambiguous', matchCount }
  }

  // Unique match — compute the 1-based line number.
  const charIndex = previousCode.indexOf(findText)
  const lineNumber =
    previousCode.slice(0, charIndex).split('\n').length

  return {
    status: 'unique_match',
    matchCount: 1,
    lineNumber,
  }
}

/**
 * Walk through a list of patches, recording the intermediate code state
 * (before and after) for each patch application. If a patch fails validation
 * (not found or ambiguous), the error is recorded and the cumulative state
 * is not advanced.
 */
export function computeIntermediatePatchStates(
  previousCode: string,
  patches: Array<{ find: string; replace: string }>
): IntermediatePatchState[] {
  const states: IntermediatePatchState[] = []
  let currentCode = previousCode

  for (let idx = 0; idx < patches.length; idx++) {
    const patch = patches[idx]
    const validation = classifyPatchValidation(currentCode, patch.find)

    if (validation.status === 'not_found') {
      states.push({
        patchIndex: idx,
        beforeCode: currentCode,
        afterCode: currentCode,
        error: `Patch not found: "${patch.find.slice(0, 120)}..."`,
      })
      continue
    }

    if (validation.status === 'ambiguous') {
      states.push({
        patchIndex: idx,
        beforeCode: currentCode,
        afterCode: currentCode,
        error: `Patch is ambiguous: found ${validation.matchCount} matches for "${patch.find.slice(0, 120)}..."`,
      })
      continue
    }

    // Safe to apply — unique match.
    const afterCode = currentCode.replace(patch.find, patch.replace)
    states.push({
      patchIndex: idx,
      beforeCode: currentCode,
      afterCode,
    })
    currentCode = afterCode
  }

  return states
}
