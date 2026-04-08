import { highlight } from "codehike/code"
import githubDark from "@code-hike/lighter/theme/github-dark.mjs"

// ─── Content-based patch application ───

function applyContentPatches(code, patches) {
  let result = code
  for (const patch of patches) {
    const firstIndex = result.indexOf(patch.find)
    if (firstIndex === -1) {
      throw new Error(
        `Patch 匹配失败: 找不到:\n${patch.find.slice(0, 120)}...`
      )
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

function countOccurrences(text, search) {
  if (!search) return 0
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++
    pos += search.length
  }
  return count
}

// ─── Content-anchor → line number mapping ───

function findLineRange(code, searchText) {
  const index = code.indexOf(searchText)
  if (index === -1) {
    throw new Error(`找不到定位目标: ${searchText.slice(0, 60)}...`)
  }
  let startLine = 1
  for (let i = 0; i < index; i++) {
    if (code[i] === "\n") startLine++
  }
  let endLine = startLine
  for (let i = 0; i < searchText.length; i++) {
    if (searchText[i] === "\n") endLine++
  }
  return { startLine, endLine }
}

function findLineNumber(code, searchText) {
  return findLineRange(code, searchText).startLine
}

// ─── Inject codehike annotations into code string ───

function injectAnnotations(code, focus, marks) {
  const lines = code.split("\n")

  let focusStartLine = -1
  let focusEndLine = -1

  // Inject focus markers
  if (focus) {
    const range = findLineRange(code, focus.find)
    focusStartLine = range.startLine
    focusEndLine = range.endLine
    lines.splice(focusStartLine - 1, 0, "  // !focus(start)")
    lines.splice(focusEndLine + 1, 0, "  // !focus(end)")
  }

  // Inject mark markers
  if (marks && marks.length > 0) {
    for (const mark of marks) {
      const lineNum = findLineNumber(code, mark.find)
      // Account for inserted annotation lines:
      // - !focus(start) shifts every line at or after focusStartLine by +1
      // - !focus(end) shifts every line after focusEndLine by another +1
      let adjustment = 0
      if (focusStartLine !== -1 && lineNum >= focusStartLine) {
        adjustment++
        if (lineNum > focusEndLine) {
          adjustment++
        }
      }
      const idx = lineNum - 1 + adjustment
      if (idx >= 0 && idx < lines.length) {
        lines[idx] = lines[idx] + `  // !mark(1) ${mark.color}`
      }
    }
  }

  return lines.join("\n")
}

// ─── Main: build highlighted steps from tutorial data ───

export async function buildTutorialSteps(data) {
  let currentCode = data.baseCode
  const steps = []

  for (const step of data.steps) {
    // Apply patches
    if (step.patches && step.patches.length > 0) {
      currentCode = applyContentPatches(currentCode, step.patches)
    }

    // Inject annotations and highlight
    const annotated = injectAnnotations(
      currentCode,
      step.focus || null,
      step.marks || null
    )

    const highlighted = await highlight(
      { lang: data.meta.lang, value: annotated, meta: "" },
      githubDark
    )

    steps.push({
      eyebrow: step.eyebrow,
      title: step.title,
      lead: step.lead,
      paragraphs: step.paragraphs,
      highlighted,
    })
  }

  return steps
}
