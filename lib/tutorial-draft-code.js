import { diffArrays } from "diff"

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

export function applyContentPatches(code, patches) {
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

export function getCodeBeforeStep(tutorialDraft, stepIndex) {
  let code = tutorialDraft.baseCode

  for (let index = 0; index < stepIndex; index++) {
    const step = tutorialDraft.steps[index]
    if (step?.patches?.length) {
      code = applyContentPatches(code, step.patches)
    }
  }

  return code
}

export function getCodeAfterStep(tutorialDraft, stepIndex, stepOverride) {
  const previousCode = getCodeBeforeStep(tutorialDraft, stepIndex)
  const step = stepOverride || tutorialDraft.steps[stepIndex]

  if (!step?.patches?.length) {
    return previousCode
  }

  return applyContentPatches(previousCode, step.patches)
}

export function getStepCodePreview(tutorialDraft, stepIndex, stepOverride) {
  const previousCode = getCodeBeforeStep(tutorialDraft, stepIndex)
  const currentCode = getCodeAfterStep(tutorialDraft, stepIndex, stepOverride)

  return {
    previousCode,
    currentCode,
    diffSummary: summarizeCodeDiff(previousCode, currentCode),
  }
}

export function validatePatchesAgainstCode(previousCode, patches) {
  try {
    const currentCode = patches?.length
      ? applyContentPatches(previousCode, patches)
      : previousCode

    return {
      valid: true,
      errors: [],
      currentCode,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      valid: false,
      errors: [message],
      currentCode: previousCode,
    }
  }
}

export function findFirstInvalidStep(tutorialDraft) {
  let currentCode = tutorialDraft.baseCode

  for (let stepIndex = 0; stepIndex < tutorialDraft.steps.length; stepIndex++) {
    const step = tutorialDraft.steps[stepIndex]

    try {
      if (step?.patches?.length) {
        currentCode = applyContentPatches(currentCode, step.patches)
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
