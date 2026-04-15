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
    } catch {}
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
      } catch {}
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

      highlightedFiles[fileName] = await highlight(
        { lang: fileLang, value: annotated, meta: "" },
        githubDark
      )
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
    })
  }

  return steps
}

export { applyContentPatches }
