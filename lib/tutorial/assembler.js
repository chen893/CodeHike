import { highlight } from "codehike/code"
import { diffArrays } from "diff"
import githubDark from "@code-hike/lighter/theme/github-dark.mjs"
import { applyContentPatches } from "./draft-code.js"
import { normalizeBaseCode, guessLangFromFileName, normalizeTutorialMeta } from "./normalize.js"
import { ensureDraftChapters } from "./chapters"

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

const SLASH_BLOCK_COMMENT_LANGS = new Set([
  "c",
  "cpp",
  "c++",
  "cs",
  "csharp",
  "dart",
  "go",
  "java",
  "javascript",
  "js",
  "jsx",
  "kotlin",
  "kt",
  "php",
  "rust",
  "rs",
  "scala",
  "scss",
  "solidity",
  "swift",
  "tsx",
  "typescript",
  "ts",
  "wgsl",
])

export function findLineRange(code, searchText) {
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

function resolveFocusRange(code, focus) {
  const lineCount = code.split("\n").length
  const { start, end } = focus

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error("Focus 必须使用整数 start/end 行号")
  }

  if (start < 1 || end < start || end > lineCount) {
    throw new Error(`Focus 行号超出范围: ${start}-${end} (共 ${lineCount} 行)`)
  }

  return { startLine: start, endLine: end }
}

function resolveMarkRange(code, mark) {
  const lineCount = code.split("\n").length
  const { start, end } = mark

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error("Mark 必须使用整数 start/end 行号")
  }

  if (start < 1 || end < start || end > lineCount) {
    throw new Error(`Mark 行号超出范围: ${start}-${end} (共 ${lineCount} 行)`)
  }

  return { startLine: start, endLine: end }
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

function usesSlashBlockComments(lang) {
  const normalized = (lang || "").trim().toLowerCase()
  return SLASH_BLOCK_COMMENT_LANGS.has(normalized) || BLOCK_COMMENT_LANGS.has(normalized)
}

function findSlashBlockCommentRanges(code, lang) {
  if (!usesSlashBlockComments(lang)) {
    return []
  }

  const ranges = []
  let state = "code"
  let quote = null
  let escaped = false
  let blockStartLine = null
  let line = 1

  for (let index = 0; index < code.length; index++) {
    const char = code[index]
    const next = code[index + 1]

    if (char === "\n") {
      line++
      if (state === "line-comment") {
        state = "code"
      }
      continue
    }

    if (state === "string") {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        state = "code"
        quote = null
      }
      continue
    }

    if (state === "line-comment") {
      continue
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        ranges.push({ startLine: blockStartLine, endLine: line })
        blockStartLine = null
        state = "code"
        index++
      }
      continue
    }

    if (char === "/" && next === "/") {
      state = "line-comment"
      index++
      continue
    }

    if (char === "/" && next === "*") {
      state = "block-comment"
      blockStartLine = line
      index++
      continue
    }

    if (char === "\"" || char === "'" || char === "`") {
      state = "string"
      quote = char
      escaped = false
    }
  }

  if (state === "block-comment" && blockStartLine !== null) {
    ranges.push({ startLine: blockStartLine, endLine: line })
  }

  return ranges
}

function findBeforeInsertionBlockRange(blockCommentRanges, lineNum) {
  return blockCommentRanges.find((range) => range.startLine < lineNum && lineNum <= range.endLine) || null
}

function findAfterInsertionBlockRange(blockCommentRanges, lineNum) {
  return blockCommentRanges.find((range) => range.startLine <= lineNum && lineNum < range.endLine) || null
}

function retargetSingleLineAnnotation(annotation, relativeLine) {
  return annotation.replace(/^(![\w-]+)\(1\)(.*)$/, `$1(${relativeLine})$2`)
}

function canRetargetSingleLineAnnotation(annotation) {
  return /^![\w-]+\(1\)/.test(annotation)
}

function pushBeforeLineAnnotation({
  beforeLineInsertions,
  blockCommentRanges,
  commentStyle,
  lines,
  lineNum,
  annotation,
}) {
  const blockRange = findBeforeInsertionBlockRange(blockCommentRanges, lineNum)

  if (!blockRange) {
    const indentation = getLineIndentation(lines[lineNum - 1] || "")
    pushMapArray(
      beforeLineInsertions,
      lineNum,
      formatStandaloneAnnotation(commentStyle, indentation, annotation)
    )
    return
  }

  if (!canRetargetSingleLineAnnotation(annotation)) {
    return
  }

  const relativeLine = lineNum - blockRange.startLine + 1
  const indentation = getLineIndentation(lines[blockRange.startLine - 1] || "")
  pushMapArray(
    beforeLineInsertions,
    blockRange.startLine,
    formatStandaloneAnnotation(
      commentStyle,
      indentation,
      retargetSingleLineAnnotation(annotation, relativeLine)
    )
  )
}

function pushAfterLineAnnotation({
  afterLineInsertions,
  blockCommentRanges,
  commentStyle,
  lines,
  lineNum,
  annotation,
}) {
  if (findAfterInsertionBlockRange(blockCommentRanges, lineNum)) {
    return
  }

  const indentation = getLineIndentation(lines[lineNum - 1] || "")
  pushMapArray(
    afterLineInsertions,
    lineNum,
    formatStandaloneAnnotation(commentStyle, indentation, annotation)
  )
}

export function computeLineChanges(prevCode, currentCode) {
  const prevLines = prevCode.split("\n")
  const currentLines = currentCode.split("\n")
  const changes = new Map()
  const diffs = diffArrays(prevLines, currentLines)
  let currentLineNum = 1

  for (const part of diffs) {
    if (part.added) {
      for (let i = 0; i < part.count; i++) {
        changes.set(currentLineNum + i, "added")
      }
      currentLineNum += part.count
    } else if (!part.removed) {
      currentLineNum += part.count
    }
  }

  let curLine = 1
  for (let i = 0; i < diffs.length; i++) {
    const part = diffs[i]
    if (part.removed && i + 1 < diffs.length && diffs[i + 1].added) {
      const nextPart = diffs[i + 1]
      const modCount = Math.min(part.count, nextPart.count)
      for (let j = 0; j < modCount; j++) {
        changes.set(curLine + j, "modified")
      }
      for (let j = modCount; j < nextPart.count; j++) {
        changes.set(curLine + j, "added")
      }
      curLine += nextPart.count
      i++
    } else if (part.added) {
      curLine += part.count
    } else if (!part.removed) {
      curLine += part.count
    }
  }

  return changes
}

function injectAnnotations(code, lang, focus, marks, lineChanges) {
  const lines = code.split("\n")
  const commentStyle = getAnnotationCommentStyle(lang)
  const blockCommentRanges = findSlashBlockCommentRanges(code, lang)
  const beforeLineInsertions = new Map()
  const afterLineInsertions = new Map()

  if (focus) {
    const range = resolveFocusRange(code, focus)
    pushBeforeLineAnnotation({
      beforeLineInsertions,
      blockCommentRanges,
      commentStyle,
      lines,
      lineNum: range.startLine,
      annotation: "!focus(start)",
    })
    pushAfterLineAnnotation({
      afterLineInsertions,
      blockCommentRanges,
      commentStyle,
      lines,
      lineNum: range.endLine,
      annotation: "!focus(end)",
    })
  }

  if (marks && marks.length > 0) {
    for (const mark of marks) {
      const range = resolveMarkRange(code, mark)
      pushBeforeLineAnnotation({
        beforeLineInsertions,
        blockCommentRanges,
        commentStyle,
        lines,
        lineNum: range.startLine,
        annotation: `!mark(start) ${mark.color}`,
      })
      pushAfterLineAnnotation({
        afterLineInsertions,
        blockCommentRanges,
        commentStyle,
        lines,
        lineNum: range.endLine,
        annotation: "!mark(end)",
      })
    }
  }

  if (lineChanges && lineChanges.size > 0) {
    for (const [lineNum, changeType] of lineChanges) {
      pushBeforeLineAnnotation({
        beforeLineInsertions,
        blockCommentRanges,
        commentStyle,
        lines,
        lineNum,
        annotation: `!change-indicator(1) ${changeType}`,
      })
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

export async function buildTutorialSteps(data) {
  // Ensure legacy drafts without chapters are wrapped with a default chapter
  const normalizedDraft = ensureDraftChapters(data)

  const normalizedMeta = normalizeTutorialMeta(normalizedDraft.meta, normalizedDraft.baseCode)
  const { files: initialFiles, primaryFile, lang: baseLang } = normalizeBaseCode(
    normalizedDraft.baseCode,
    normalizedMeta
  )

  let currentFiles = { ...initialFiles }
  let prevFiles = {}
  const steps = []

  for (let stepIdx = 0; stepIdx < normalizedDraft.steps.length; stepIdx++) {
    const step = normalizedDraft.steps[stepIdx]
    prevFiles = { ...currentFiles }

    if (step.patches && step.patches.length > 0) {
      currentFiles = applyContentPatches(currentFiles, step.patches, primaryFile)
    }

    // Build highlighted output per file
    const highlightedFiles = {}
    const fileNames = Object.keys(currentFiles)
    let activeFile = primaryFile

    // Determine which file to show as active:
    // - If the step has patches, use the first patch's target file
    // - If the step has focus/marks with a file, use that
    if (step.patches && step.patches.length > 0) {
      const firstPatchFile = step.patches[0].file
      if (firstPatchFile && firstPatchFile in currentFiles) {
        activeFile = firstPatchFile
      }
    }
    if (step.focus?.file && step.focus.file in currentFiles) {
      activeFile = step.focus.file
    }

    // Compute change summary from patches
    let changeSummary = undefined
    if (step.patches && step.patches.length > 0) {
      let added = 0
      let removed = 0
      let modified = 0
      for (const patch of step.patches) {
        const findLines = (patch.find || "").split("\n").length
        const replaceLines = (patch.replace || "").split("\n").length
        if (findLines === replaceLines && findLines > 0) {
          modified += findLines
        } else {
          if (replaceLines > 0) added += replaceLines
          if (findLines > 0) removed += findLines
        }
      }
      changeSummary = {
        patchCount: step.patches.length,
        added,
        removed,
        modified,
      }
    }

    // Track which files actually changed at this step
    const changedFiles = []
    for (const fileName of fileNames) {
      if (prevFiles[fileName] !== undefined && currentFiles[fileName] !== prevFiles[fileName]) {
        changedFiles.push(fileName)
      }
    }

    // Highlight each file (skip unchanged non-active files for performance)
    for (const fileName of fileNames) {
      const currentCode = currentFiles[fileName]
      const prevCode = prevFiles[fileName] || ""
      const fileLang = guessLangFromFileName(fileName)

      // Reuse previous highlight if file is unchanged and not the active file
      if (
        stepIdx > 0 &&
        fileName !== activeFile &&
        prevFiles[fileName] !== undefined &&
        currentCode === prevCode &&
        !(step.focus && (step.focus.file === fileName || (!step.focus.file && fileName === primaryFile))) &&
        !(step.marks && step.marks.some(m => m.file === fileName || (!m.file && fileName === primaryFile)))
      ) {
        highlightedFiles[fileName] = steps.length > 0
          ? steps[steps.length - 1]?.highlightedFiles?.[fileName]
          : undefined
        continue
      }

      // Only compute line changes for files that exist in prevFiles
      const lineChanges = stepIdx === 0 || !prevFiles[fileName]
        ? new Map()
        : computeLineChanges(prevCode, currentCode)

      // Filter focus/marks to this file (default to this file if no file specified)
      const stepFocus = step.focus && (step.focus.file === fileName || (!step.focus.file && fileName === primaryFile))
        ? step.focus
        : null
      const stepMarks = step.marks
        ? step.marks.filter(m => m.file === fileName || (!m.file && fileName === primaryFile))
        : null

      const annotated = injectAnnotations(
        currentCode,
        fileLang,
        stepFocus,
        stepMarks,
        lineChanges
      )

      const highlighted = await highlight(
        { lang: fileLang, value: annotated, meta: "" },
        githubDark
      )
      highlightedFiles[fileName] = {
        ...highlighted,
        value: highlighted.code,
      }
    }

    steps.push({
      id: step.id,
      chapterId: step.chapterId,
      eyebrow: step.eyebrow,
      title: step.title,
      lead: step.lead,
      paragraphs: step.paragraphs,
      highlighted: highlightedFiles[primaryFile],
      highlightedFiles,
      activeFile,
      changeSummary,
      changedFiles,
    })
  }

  return steps
}

export { applyContentPatches }
