import type { ClassifiedError, PatchError, GenerationError } from './error-types'
import type { GenerationJobErrorCode } from './error-types'
import { ERROR_CODE_RECOVERABILITY, PublishSlugConflictError } from './error-types'

/**
 * Classify errors from applyContentPatches.
 * These throw Chinese error messages containing specific patterns.
 */
export function classifyPatchError(rawError: unknown, patchIndex?: number): PatchError {
  const message = rawError instanceof Error ? rawError.message : String(rawError)

  // Pattern: "Patch 匹配失败: 找不到:\n..."
  if (message.includes('匹配失败') || message.includes('找不到')) {
    const findText = extractFindText(message)
    return {
      type: 'patch_not_found',
      message,
      patchIndex,
      findText,
    }
  }

  // Pattern: "Patch 匹配歧义: 出现 N 次:\n..."
  if (message.includes('歧义') || message.includes('多次')) {
    const findText = extractFindText(message)
    return {
      type: 'patch_ambiguous',
      message,
      patchIndex,
      findText,
    }
  }

  // Pattern: "Patch 目标文件 ... 不存在于当前文件集中 (可用: ...)"
  if (message.includes('文件') || message.includes('file')) {
    return {
      type: 'patch_file_not_found',
      message,
      patchIndex,
      availableFiles: extractAvailableFiles(message),
    }
  }

  return {
    type: 'patch_not_found',
    message,
    patchIndex,
  }
}

/**
 * Classify generation-related errors from SSE and DB state.
 *
 * When `errorCode` is provided (from the generation job), it is used directly
 * and message-based heuristic matching is skipped. This is the preferred path:
 * callers that have a structured error code should always pass it.
 *
 * The message-based path is retained for backward compatibility but is
 * deprecated for new callers.
 */
export function classifyGenerationError(
  rawError: unknown,
  context?: { phase?: string; stepIndex?: number; errorCode?: GenerationJobErrorCode },
): GenerationError {
  const message = rawError instanceof Error ? rawError.message : String(rawError)
  const errorCode = context?.errorCode

  // ── Code-driven path (preferred) ──
  if (errorCode) {
    const recoverability = ERROR_CODE_RECOVERABILITY[errorCode] ?? 'retry_full'

    if (errorCode === 'OUTLINE_GENERATION_FAILED') {
      return {
        type: 'generation_outline_failed',
        message,
        phase: 'outline',
        errorCode,
        recoverability,
      }
    }

    if (errorCode === 'JOB_CANCELLED') {
      return {
        type: 'generation_cancelled',
        message,
        phase: context?.phase,
        errorCode,
        recoverability,
      }
    }

    // All other error codes map to step failure (STEP_GENERATION_FAILED,
    // PATCH_VALIDATION_FAILED, DRAFT_VALIDATION_FAILED, PERSIST_FAILED, etc.)
    return {
      type: 'generation_step_failed',
      message,
      stepIndex: context?.stepIndex,
      phase: context?.phase,
      errorCode,
      recoverability: ERROR_CODE_RECOVERABILITY[errorCode] ?? 'retry_full',
    }
  }

  // ── Legacy message-based path (deprecated) ──
  if (message.includes('outline') || context?.phase === 'outline') {
    return { type: 'generation_outline_failed', message, phase: 'outline' }
  }

  if (message.includes('cancelled') || message.includes('abort')) {
    return { type: 'generation_cancelled', message, phase: context?.phase }
  }

  return {
    type: 'generation_step_failed',
    message,
    stepIndex: context?.stepIndex,
    phase: context?.phase,
  }
}

/**
 * General classifier that tries all categories.
 *
 * When `errorCode` is provided (e.g. from a generation job API response),
 * it is forwarded to `classifyGenerationError` for code-driven classification.
 */
export function classifyError(
  rawError: unknown,
  context?: { errorCode?: GenerationJobErrorCode; phase?: string; stepIndex?: number },
): ClassifiedError {
  // Structured conflict error from DB unique constraint
  if (rawError instanceof PublishSlugConflictError) {
    return { type: 'publish_slug_conflict', message: rawError.message }
  }

  const message = rawError instanceof Error ? rawError.message : String(rawError)

  // Try patch patterns
  if (message.includes('Patch') || message.includes('patch') || message.includes('匹配')) {
    return classifyPatchError(rawError)
  }

  // Try generation patterns — prefer code-driven classification when errorCode is available
  if (context?.errorCode || message.includes('generation') || message.includes('generate') || message.includes('outline') || message.includes('step-fill')) {
    return classifyGenerationError(rawError, context)
  }

  // Validation
  if (message.includes('validation') || message.includes('校验')) {
    return { type: 'validation_failed', message, errors: [message] }
  }

  // Publish
  if (message.includes('publish') || message.includes('发布')) {
    if (message.includes('fresh') || message.includes('过期')) {
      return { type: 'publish_not_fresh', message }
    }
    if (message.includes('valid') || message.includes('校验')) {
      return { type: 'publish_invalid', message }
    }
    return { type: 'publish_not_found', message }
  }

  return { type: 'unknown', message, rawError: message }
}

// --- Helpers ---

function extractFindText(message: string): string | undefined {
  // Find text after the last colon or newline prefix
  const match = message.match(/[:\n]\s*(.{10,})/s)
  return match ? match[1].trim().slice(0, 200) : undefined
}

function extractAvailableFiles(message: string): string[] | undefined {
  // Pattern: "(可用: a.js, b.js)" or "Available files: [a.js, b.js]"
  const match = message.match(/[（(]可用:\s*([^)）]+)[)）]/)
    ?? message.match(/\[([^\]]+)\]/)
  if (match) {
    return match[1].split(',').map(f => f.trim())
  }
  return undefined
}
