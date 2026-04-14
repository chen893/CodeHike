import type { ContentMark, ContentPatch } from '@/lib/schemas/tutorial-draft'

export interface DiffLine {
  type: 'added' | 'removed' | 'modified' | 'unchanged'
  content: string
  lineNumber: number  // 1-based line number in the "after" state (for added/unchanged/modified) or "before" state (for removed)
  beforeLineNumber?: number // line number in the "before" state
}

export type SelectionMode = 'off' | 'focus' | 'mark'

export interface FocusRange {
  startLine: number
  endLine: number
}

export interface PatchValidationResult {
  status: 'unique_match' | 'not_found' | 'ambiguous'
  matchCount: number
  lineNumber?: number  // 1-based line where match starts (only for unique_match)
}

export interface PatchValidationState {
  patchIndex: number
  result: PatchValidationResult
  isValid: boolean
}

export interface IntermediatePatchState {
  patchIndex: number
  beforeCode: string
  afterCode: string
  error?: string
}

export interface PatchDraft extends ContentPatch {
  localId: string
  file?: string
}

export interface MarkDraft extends ContentMark {
  localId: string
  file?: string
}
