/**
 * Patch auto-fix module for AI-generated patches.
 *
 * When an AI-generated patch's `find` text fails to match the current code,
 * this module attempts to fix common issues:
 *   1. Trailing whitespace / newline alignment
 *   2. Indentation normalization (tab <-> spaces)
 *   3. Fuzzy substring matching (find a unique approximate match)
 *
 * All fixes require the result to be a **unique** match in the code.
 * Non-unique matches are rejected to avoid ambiguity.
 */

import type { ContentPatch } from '../schemas/tutorial-draft';
import type { PreprocessedSource } from './source-preprocessor';

export interface AutoFixResult {
  success: boolean;
  fixedPatches: ContentPatch[];
  fixesApplied: string[];
}

/**
 * Normalize whitespace for comparison: trim edges, collapse internal whitespace.
 */
function normalizeForComparison(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\s+|\s+$/g, '');
}

/**
 * Try to find a unique match for `find` in `code` after normalization.
 * Returns the actual matched text from `code` (preserving original formatting)
 * or null if no unique match.
 */
function findNormalizedMatch(code: string, find: string): string | null {
  const normalizedCode = normalizeForComparison(code);
  const normalizedFind = normalizeForComparison(find);

  // Guard: empty find after normalization is meaningless
  if (!normalizedFind) return null;

  // Strategy 1: Exact normalized match
  const idx = normalizedCode.indexOf(normalizedFind);
  if (idx !== -1) {
    // Verify uniqueness
    const secondIdx = normalizedCode.indexOf(normalizedFind, idx + 1);
    if (secondIdx === -1) {
      // Extract the actual text from the original code at the same position.
      // Count characters up to idx in normalized to find corresponding position in original.
      return extractOriginalSegment(code, normalizedCode, idx, normalizedFind.length);
    }
  }

  return null;
}

/**
 * Extract a segment from the original code corresponding to a range
 * in the normalized version.
 */
function extractOriginalSegment(
  original: string,
  normalized: string,
  normStart: number,
  normLength: number,
): string {
  // Walk both strings character by character to find the mapping
  let origIdx = 0;
  let normIdx = 0;
  let safetyCounter = 0;
  const maxIter = original.length + normalized.length + 2;

  while (normIdx < normStart && origIdx < original.length && safetyCounter < maxIter) {
    safetyCounter++;
    const oChar = original[origIdx];
    const nChar = normalized[normIdx];

    if (oChar === nChar) {
      origIdx++;
      normIdx++;
    } else {
      // Skip a character in original that was normalized away
      origIdx++;
    }
  }

  const origStart = origIdx;
  let remaining = normLength;
  safetyCounter = 0;
  while (remaining > 0 && origIdx < original.length && safetyCounter < maxIter) {
    safetyCounter++;
    const oChar = original[origIdx];
    const nChar = normalized[normIdx];

    if (oChar === nChar) {
      origIdx++;
      normIdx++;
      remaining--;
    } else {
      origIdx++;
    }
  }

  return original.slice(origStart, origIdx);
}

/**
 * Try to fix indentation: convert tabs to spaces and retry matching.
 * Maps the match back to the original code's character positions.
 */
function tryIndentationFix(
  code: string,
  find: string,
  _file?: string,
): { matched: string; description: string } | null {
  // Convert tabs to 2 spaces in both
  const codeSpaced = code.replace(/\t/g, '  ');
  const findSpaced = find.replace(/\t/g, '  ');

  if (codeSpaced !== code || findSpaced !== find) {
    const idx = codeSpaced.indexOf(findSpaced);
    if (idx !== -1) {
      const secondIdx = codeSpaced.indexOf(findSpaced, idx + 1);
      if (secondIdx === -1) {
        // Unique match in spaced version. Map back to original positions.
        // Build a mapping from spaced indices to original indices.
        let origIdx = 0;
        let spacedIdx = 0;
        let origStart = 0;
        let foundStart = false;

        while (spacedIdx <= idx + findSpaced.length && origIdx < code.length) {
          if (spacedIdx === idx && !foundStart) {
            origStart = origIdx;
            foundStart = true;
          }
          if (code[origIdx] === '\t') {
            origIdx++;
            spacedIdx += 2; // tab -> 2 spaces
          } else {
            origIdx++;
            spacedIdx++;
          }
        }

        if (foundStart) {
          const actualText = code.slice(origStart, origIdx);
          return {
            matched: actualText,
            description: 'tab-to-space indentation normalization',
          };
        }
      }
    }
  }

  return null;
}

/**
 * Attempt to auto-fix a single patch's find text against the current code.
 * Returns the fixed find text or null if no fix found.
 */
function tryFixSinglePatch(
  currentCode: string,
  patch: ContentPatch,
): { fixedFind: string; description: string } | null {
  const find = patch.find;
  const file = patch.file;

  // Strategy 1: Normalized whitespace match
  const normMatch = findNormalizedMatch(currentCode, find);
  if (normMatch) {
    return { fixedFind: normMatch, description: 'whitespace normalization' };
  }

  // Strategy 2: Indentation fix (tab <-> space)
  const indentFix = tryIndentationFix(currentCode, find, file);
  if (indentFix) {
    return { fixedFind: indentFix.matched, description: indentFix.description };
  }

  return null;
}

/**
 * Attempt to auto-fix patches that failed to match.
 *
 * @param currentFiles - Current state of all files (multi-file mode)
 * @param patches - Patches to fix
 * @param primaryFile - Primary file name
 * @param _context - Optional preprocessed source context (for future use)
 * @returns AutoFixResult with success status and fixed patches
 */
export function tryAutoFixPatches(
  currentFiles: Record<string, string>,
  patches: ContentPatch[],
  primaryFile: string,
  _context?: PreprocessedSource[],
): AutoFixResult {
  const fixedPatches: ContentPatch[] = [];
  const fixesApplied: string[] = [];
  let anyFixed = false;

  // Apply patches sequentially, using accumulated state
  const accumulated = { ...currentFiles };

  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];
    const targetFile = patch.file || primaryFile;
    const code = accumulated[targetFile];

    if (code === undefined) {
      // Can't fix if the target file doesn't exist
      fixedPatches.push(patch);
      continue;
    }

    // Check if the find text already matches
    const idx = code.indexOf(patch.find);
    if (idx !== -1) {
      // Verify unique match
      if (code.indexOf(patch.find, idx + 1) === -1) {
        // Already matches uniquely — no fix needed
        fixedPatches.push(patch);
        // Apply to accumulated state
        const replaced = code.slice(0, idx) + patch.replace + code.slice(idx + patch.find.length);
        accumulated[targetFile] = replaced;
        continue;
      }
    }

    // Try auto-fix
    const fix = tryFixSinglePatch(code, patch);
    if (fix) {
      // Verify the fixed find text matches uniquely in the current code
      const fixIdx = code.indexOf(fix.fixedFind);
      if (fixIdx !== -1 && code.indexOf(fix.fixedFind, fixIdx + 1) === -1) {
        fixedPatches.push({
          ...patch,
          find: fix.fixedFind,
        });
        fixesApplied.push(`Patch ${i + 1}: ${fix.description}`);
        anyFixed = true;
        // Apply to accumulated state
        const replaced =
          code.slice(0, fixIdx) + patch.replace + code.slice(fixIdx + fix.fixedFind.length);
        accumulated[targetFile] = replaced;
        continue;
      }
    }

    // Could not fix — keep original
    fixedPatches.push(patch);
  }

  return {
    success: anyFixed,
    fixedPatches,
    fixesApplied,
  };
}
