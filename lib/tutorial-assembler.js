import { highlight } from "codehike/code"
import { diffArrays } from "diff"
import githubDark from "@code-hike/lighter/theme/github-dark.mjs"

const HASH_COMMENT_LANGS = new Set([
  "py",
  "python",
  "sh",
  "shell",
  "shellscript",
  "bash",
  "zsh",
  "fish",
  "nu",
  "nushell",
  "rb",
  "ruby",
  "pl",
  "perl",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "dockerfile",
  "make",
  "makefile",
  "r",
  "elixir",
  "ex",
  "exs",
  "julia",
  "jl",
])

const DOUBLE_DASH_COMMENT_LANGS = new Set([
  "lua",
  "sql",
  "haskell",
  "hs",
  "ada",
])

const SEMICOLON_COMMENT_LANGS = new Set([
  "clj",
  "cljc",
  "cljs",
  "clojure",
  "lisp",
  "scheme",
  "racket",
  "fennel",
])

const PERCENT_COMMENT_LANGS = new Set([
  "tex",
  "latex",
  "matlab",
  "octave",
])

const QUOTE_COMMENT_LANGS = new Set([
  "vim",
  "viml",
])

const BLOCK_COMMENT_LANGS = new Set([
  "css",
  "scss",
  "sass",
  "less",
])

const HTML_COMMENT_LANGS = new Set([
  "html",
  "xml",
  "svg",
  "vue-html",
  "angular-html",
])

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

function getAnnotationCommentStyle(lang) {
  const normalized = (lang || "").trim().toLowerCase()

  if (HASH_COMMENT_LANGS.has(normalized)) {
    return { type: "line", prefix: "#" }
  }

  if (DOUBLE_DASH_COMMENT_LANGS.has(normalized)) {
    return { type: "line", prefix: "--" }
  }

  if (SEMICOLON_COMMENT_LANGS.has(normalized)) {
    return { type: "line", prefix: ";" }
  }

  if (PERCENT_COMMENT_LANGS.has(normalized)) {
    return { type: "line", prefix: "%" }
  }

  if (QUOTE_COMMENT_LANGS.has(normalized)) {
    return { type: "line", prefix: "\"" }
  }

  if (BLOCK_COMMENT_LANGS.has(normalized)) {
    return { type: "block", open: "/*", close: "*/" }
  }

  if (HTML_COMMENT_LANGS.has(normalized)) {
    return { type: "block", open: "<!--", close: "-->" }
  }

  return { type: "line", prefix: "//" }
}

function getLineIndentation(line) {
  return line.match(/^\s*/)?.[0] || ""
}

function formatAnnotation(style, annotation) {
  if (style.type === "block") {
    return `${style.open} ${annotation} ${style.close}`
  }

  return `${style.prefix} ${annotation}`
}

function formatStandaloneAnnotation(style, indentation, annotation) {
  return `${indentation}${formatAnnotation(style, annotation)}`
}

function pushMapArray(map, key, value) {
  const existing = map.get(key)
  if (existing) {
    existing.push(value)
    return
  }

  map.set(key, [value])
}

// ─── Compute line-level changes between two code strings ───

function computeLineChanges(prevCode, currentCode) {
  const prevLines = prevCode.split("\n")
  const currentLines = currentCode.split("\n")

  // Map from 1-based line number in currentCode to change type
  const changes = new Map()

  const diffs = diffArrays(prevLines, currentLines)
  let currentLineNum = 1

  for (const part of diffs) {
    if (part.added) {
      for (let i = 0; i < part.count; i++) {
        changes.set(currentLineNum + i, "added")
      }
      currentLineNum += part.count
    } else if (part.removed) {
      // Removed lines don't exist in current code
      // but if the next part is added, those are "modified" rather than "added"
      // We'll handle this by looking ahead
    } else {
      currentLineNum += part.count
    }
  }

  // Second pass: detect modified lines (removed + added at same position)
  let curLine = 1
  for (let i = 0; i < diffs.length; i++) {
    const part = diffs[i]
    if (part.removed && i + 1 < diffs.length && diffs[i + 1].added) {
      // This removal + next addition = modification
      const nextPart = diffs[i + 1]
      const modCount = Math.min(part.count, nextPart.count)
      for (let j = 0; j < modCount; j++) {
        changes.set(curLine + j, "modified")
      }
      // Remaining added lines (if more added than removed)
      for (let j = modCount; j < nextPart.count; j++) {
        changes.set(curLine + j, "added")
      }
      curLine += nextPart.count
      i++ // skip the next (added) part
    } else if (part.added) {
      curLine += part.count
    } else if (!part.removed) {
      curLine += part.count
    }
    // removed lines not followed by added: just skip (no current lines)
  }

  return changes
}

// ─── Inject codehike annotations into code string ───

function injectAnnotations(code, lang, focus, marks, lineChanges) {
  const lines = code.split("\n")
  const commentStyle = getAnnotationCommentStyle(lang)
  const beforeLineInsertions = new Map()
  const afterLineInsertions = new Map()

  if (focus) {
    try {
      const range = findLineRange(code, focus.find)
      const startIndentation = getLineIndentation(lines[range.startLine - 1] || "")
      const endIndentation = getLineIndentation(lines[range.endLine - 1] || "")

      pushMapArray(
        beforeLineInsertions,
        range.startLine,
        formatStandaloneAnnotation(commentStyle, startIndentation, "!focus(start)")
      )
      pushMapArray(
        afterLineInsertions,
        range.endLine,
        formatStandaloneAnnotation(commentStyle, endIndentation, "!focus(end)")
      )
    } catch {
      // focus anchor not found — skip focus annotation
    }
  }

  if (marks && marks.length > 0) {
    for (const mark of marks) {
      try {
        const lineNum = findLineNumber(code, mark.find)
        const indentation = getLineIndentation(lines[lineNum - 1] || "")
        pushMapArray(
          beforeLineInsertions,
          lineNum,
          formatStandaloneAnnotation(
            commentStyle,
            indentation,
            `!mark(1) ${mark.color}`
          )
        )
      } catch {
        // mark anchor not found — skip mark annotation
      }
    }
  }

  if (lineChanges && lineChanges.size > 0) {
    for (const [lineNum, changeType] of lineChanges) {
      const indentation = getLineIndentation(lines[lineNum - 1] || "")
      pushMapArray(
        beforeLineInsertions,
        lineNum,
        formatStandaloneAnnotation(
          commentStyle,
          indentation,
          `!change-indicator(1) ${changeType}`
        )
      )
    }
  }

  const annotatedLines = []

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1
    const before = beforeLineInsertions.get(lineNumber)
    const after = afterLineInsertions.get(lineNumber)

    if (before) {
      annotatedLines.push(...before)
    }

    annotatedLines.push(lines[index])

    if (after) {
      annotatedLines.push(...after)
    }
  }

  return annotatedLines.join("\n")
}

// ─── Main: build highlighted steps from tutorial data ───

export async function buildTutorialSteps(data) {
  let currentCode = data.baseCode
  let prevCode = ""
  const steps = []

  for (let stepIdx = 0; stepIdx < data.steps.length; stepIdx++) {
    const step = data.steps[stepIdx]
    prevCode = currentCode

    // Apply patches
    if (step.patches && step.patches.length > 0) {
      currentCode = applyContentPatches(currentCode, step.patches)
    }

    // Compute line changes between previous and current code
    const lineChanges = stepIdx === 0
      ? new Map() // Skip for first step (all lines are "new" from baseCode)
      : computeLineChanges(prevCode, currentCode)

    // Inject annotations and highlight
    const annotated = injectAnnotations(
      currentCode,
      data.meta.lang,
      step.focus || null,
      step.marks || null,
      lineChanges
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

export { applyContentPatches }
