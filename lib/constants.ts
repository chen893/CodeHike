/**
 * Shared constants used across client and server.
 */

// ── GitHub import limits ──
// Re-exported from dedicated module for backward compatibility.
// Prefer importing directly from @/lib/constants/github-import.
export {
  MAX_FILES_PER_REQUEST as GITHUB_IMPORT_MAX_FILES,
  MAX_LINES_PER_REQUEST as GITHUB_IMPORT_MAX_TOTAL_LINES,
} from './constants/github-import';
