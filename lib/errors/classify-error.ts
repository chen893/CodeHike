import type { ClassifiedError, PatchError, GenerationError } from './error-types'

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
 */
export function classifyGenerationError(rawError: unknown, context?: { phase?: string; stepIndex?: number }): GenerationError {
  const message = rawError instanceof Error ? rawError.message : String(rawError)

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
 */
export function classifyError(rawError: unknown): ClassifiedError {
  const message = rawError instanceof Error ? rawError.message : String(rawError)

  // Try patch patterns
  if (message.includes('Patch') || message.includes('patch') || message.includes('匹配')) {
    return classifyPatchError(rawError)
  }

  // Try generation patterns
  if (message.includes('generation') || message.includes('generate') || message.includes('outline') || message.includes('step-fill')) {
    return classifyGenerationError(rawError)
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
