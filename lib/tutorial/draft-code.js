import { diffArrays } from "diff"
import { normalizeBaseCode } from "./normalize.js"

export function countOccurrences(text, search) {
  if (!search) return 0

  let count = 0
  let position = 0

  while ((position = text.indexOf(search, position)) !== -1) {
    count++
    position += search.length
  }

  return count
}

// ── Single-file patch application (unchanged) ──

function applyPatchesToString(code, patches) {
  let result = code

  for (const patch of patches) {
    const firstIndex = result.indexOf(patch.find)

    if (firstIndex === -1) {
      throw new Error(`Patch 匹配失败: 找不到:\n${patch.find.slice(0, 120)}...`)
    }

    const secondIndex = result.indexOf(patch.find, firstIndex + 1)
    if (secondIndex !== -1) {
      throw new Error(
        `Patch 匹配歧义: 出现 ${countOccurrences(result, patch.find)} 次:\n${patch.find.slice(0, 120)}...`
      )
    }

    result =
      result.slice(0, firstIndex) +
      patch.replace +
      result.slice(firstIndex + patch.find.length)
  }

  return result
}

/**
 * Apply content patches to a single-file code string.
 * @param {string} code
 * @param {ContentPatch[]} patches
 * @returns {string}
 */
/**
 * Apply content patches to a multi-file code map.
 * @param {Record<string, string>} files
 * @param {ContentPatch[]} patches
 * @param {string} primaryFile
 * @returns {Record<string, string>}
 */
export function applyContentPatches(codeOrFiles, patches, primaryFile) {
  if (typeof codeOrFiles === "string") {
    // Single-file mode: filter patches to only those without a file field
    // (or targeting no specific file)
    const stringPatches = patches.filter(p => !p.file)
    return stringPatches.length > 0
      ? applyPatchesToString(codeOrFiles, stringPatches)
      : codeOrFiles
  }

  // Multi-file mode: codeOrFiles is Record<string, string>
  const result = { ...codeOrFiles }
  const primary = primaryFile || Object.keys(result)[0]
  const knownFiles = Object.keys(result)

  for (const patch of patches) {
    let targetFile = patch.file || primary
    // Fuzzy match: case-insensitive lookup if exact match fails
    if (!(targetFile in result)) {
      const lowerTarget = targetFile.toLowerCase()
      const match = knownFiles.find(f => f.toLowerCase() === lowerTarget)
      if (match) {
        targetFile = match
      } else {
        throw new Error(`Patch 目标文件 "${patch.file}" 不存在于当前文件集中 (可用: ${knownFiles.join(', ')})`)
      }
    }
    result[targetFile] = applyPatchesToString(result[targetFile], [patch])
  }

  return result
}

// ── Helpers to normalize tutorial draft at the boundary ──

function normalizeDraft(tutorialDraft) {
  const { files, primaryFile, lang } = normalizeBaseCode(
    tutorialDraft.baseCode,
    tutorialDraft.meta
  )
  return { files: { ...files }, primaryFile, lang, steps: tutorialDraft.steps }
}

// ── Multi-file code state tracking ──

/**
 * Get the multi-file code state before a given step index.
 * Returns Record<string, string> (fileName -> code).
 */
export function getFilesBeforeStep(tutorialDraft, stepIndex) {
  const { files, primaryFile } = normalizeDraft(tutorialDraft)
  let currentFiles = files

  for (let index = 0; index < stepIndex; index++) {
    const step = tutorialDraft.steps[index]
    if (step?.patches?.length) {
      currentFiles = applyContentPatches(currentFiles, step.patches, primaryFile)
    }
  }

  return currentFiles
}

/**
 * Get the multi-file code state after a given step.
 * Returns Record<string, string> (fileName -> code).
 */
export function getFilesAfterStep(tutorialDraft, stepIndex, stepOverride) {
  const { primaryFile } = normalizeDraft(tutorialDraft)
  const previousFiles = getFilesBeforeStep(tutorialDraft, stepIndex)
  const step = stepOverride || tutorialDraft.steps[stepIndex]

  if (!step?.patches?.length) {
    return previousFiles
  }

  return applyContentPatches(previousFiles, step.patches, primaryFile)
}

/**
 * Get code preview for a step, including per-file before/after and diff summary.
 * Backward compatible: also provides singular previousCode/currentCode for the primary file.
 */
export function getStepCodePreview(tutorialDraft, stepIndex, stepOverride) {
  const { primaryFile } = normalizeDraft(tutorialDraft)
  const previousFiles = getFilesBeforeStep(tutorialDraft, stepIndex)
  const currentFiles = getFilesAfterStep(tutorialDraft, stepIndex, stepOverride)

  return {
    previousFiles,
    currentFiles,
    primaryFile,
    previousCode: previousFiles[primaryFile] || "",
    currentCode: currentFiles[primaryFile] || "",
    diffSummary: summarizeCodeDiff(previousFiles[primaryFile] || "", currentFiles[primaryFile] || ""),
  }
}

// ── Backward-compatible single-string helpers ──

/**
 * @deprecated Use getFilesBeforeStep for multi-file support.
 * Returns the primary file's code before the given step (backward compat).
 */
export function getCodeBeforeStep(tutorialDraft, stepIndex) {
  const files = getFilesBeforeStep(tutorialDraft, stepIndex)
  const { primaryFile } = normalizeDraft(tutorialDraft)
  return files[primaryFile] || ""
}

/**
 * @deprecated Use getFilesAfterStep for multi-file support.
 * Returns the primary file's code after the given step (backward compat).
 */
export function getCodeAfterStep(tutorialDraft, stepIndex, stepOverride) {
  const files = getFilesAfterStep(tutorialDraft, stepIndex, stepOverride)
  const { primaryFile } = normalizeDraft(tutorialDraft)
  return files[primaryFile] || ""
}

// ── Validation ──

export function validatePatchesAgainstCode(previousCodeOrFiles, patches, primaryFile) {
  try {
    const currentCodeOrFiles = patches?.length
      ? applyContentPatches(previousCodeOrFiles, patches, primaryFile)
      : previousCodeOrFiles

    return {
      valid: true,
      errors: [],
      currentCode: currentCodeOrFiles,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      valid: false,
      errors: [message],
      currentCode: previousCodeOrFiles,
    }
  }
}

export function findFirstInvalidStep(tutorialDraft) {
  const { files, primaryFile } = normalizeDraft(tutorialDraft)
  let currentFiles = files

  for (let stepIndex = 0; stepIndex < tutorialDraft.steps.length; stepIndex++) {
    const step = tutorialDraft.steps[stepIndex]

    try {
      if (step?.patches?.length) {
        currentFiles = applyContentPatches(currentFiles, step.patches, primaryFile)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      return {
        stepIndex,
        stepId: step?.id ?? null,
        stepTitle: step?.title ?? `步骤 ${stepIndex + 1}`,
        message,
      }
    }
  }

  return null
}

export function summarizeCodeDiff(previousCode, currentCode) {
  const diffs = diffArrays(previousCode.split("\n"), currentCode.split("\n"))

  let added = 0
  let removed = 0
  let modified = 0

  for (let index = 0; index < diffs.length; index++) {
    const part = diffs[index]

    if (part.removed && index + 1 < diffs.length && diffs[index + 1].added) {
      const nextPart = diffs[index + 1]
      modified += Math.min(part.count, nextPart.count)
      if (part.count > nextPart.count) {
        removed += part.count - nextPart.count
      }
      if (nextPart.count > part.count) {
        added += nextPart.count - part.count
      }
      index++
      continue
    }

    if (part.added) added += part.count
    if (part.removed) removed += part.count
  }

  return {
    added,
    removed,
    modified,
  }
}
