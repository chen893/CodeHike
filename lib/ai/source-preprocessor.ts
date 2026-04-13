/**
 * Source code preprocessor for AI generation pipeline.
 * Cleans and extracts structural information from source files
 * to improve AI generation quality.
 */

export interface PreprocessedSource {
  original: { label: string; content: string; language?: string };
  cleaned: string;
  structure: string[];
  lineCount: number;
}

/**
 * Remove excessive blank lines (collapse 2+ consecutive blank lines to 1).
 */
function collapseBlankLines(code: string): string {
  return code.replace(/\n{3,}/g, '\n\n');
}

/**
 * Extract structural markers from source code.
 * Captures function declarations, class declarations, imports, and exports.
 */
function extractStructure(code: string, language?: string): string[] {
  const lines = code.split('\n');
  const structure: string[] = [];

  const patterns: RegExp[] = [
    // Import statements
    /^(?:import|from)\s/,
    // Export statements
    /^export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\b/,
    // Function declarations
    /^(?:export\s+)?(?:async\s+)?function\s+\w+/,
    // Class declarations
    /^(?:export\s+)?(?:abstract\s+)?class\s+\w+/,
    // Arrow function const assignments
    /^(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/,
    // Method definitions (in classes)
    /^\s+(?:public|private|protected|static|async|get|set)?\s*(?:\w+\s*)?\([^)]*\)\s*(?::\s*\w+)?\s*\{/,
    // Python: def / class
    /^(?:def|class)\s+\w+/,
    // Python: import / from
    /^(?:import|from)\s+\w+/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        // Truncate long lines for summary
        structure.push(trimmed.length > 120 ? trimmed.slice(0, 117) + '...' : trimmed);
        break;
      }
    }
  }

  return structure;
}

/**
 * Preprocess a single source file for AI generation.
 */
export function preprocessSource(source: {
  label: string;
  content: string;
  language?: string;
}): PreprocessedSource {
  const cleaned = collapseBlankLines(source.content);
  const structure = extractStructure(cleaned, source.language);
  const lineCount = cleaned.split('\n').length;

  return {
    original: {
      label: source.label,
      content: source.content,
      language: source.language,
    },
    cleaned,
    structure,
    lineCount,
  };
}

/**
 * Preprocess multiple source files.
 */
export function preprocessSources(
  sources: { label: string; content: string; language?: string }[],
): PreprocessedSource[] {
  return sources.map((s) => preprocessSource(s));
}
