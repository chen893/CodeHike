/**
 * Normalization layer for multi-file tutorial DSL.
 *
 * The DSL supports two baseCode formats:
 * - Old (single-file): `baseCode: string`
 * - New (multi-file):  `baseCode: Record<string, string>` (fileName -> code)
 *
 * This module normalizes both into a guaranteed-multi-file internal representation
 * so that downstream code only deals with Record<string, string>.
 */

const EXT_LANG_MAP = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  sh: 'shellscript',
  bash: 'shellscript',
  json: 'json',
  md: 'markdown',
};

export function guessLangFromFileName(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXT_LANG_MAP[ext] || ext || 'text';
}

/**
 * Normalize baseCode (string or Record) + optional meta into a consistent
 * multi-file representation.
 */
export function normalizeBaseCode(baseCode, meta) {
  if (typeof baseCode === 'string') {
    // Old single-file format — wrap into Record
    const fileName = meta?.fileName || 'main.js';
    const lang = meta?.lang || guessLangFromFileName(fileName);
    return { files: { [fileName]: baseCode }, primaryFile: fileName, lang };
  }

  // New multi-file format
  const entries = Object.keys(baseCode);
  if (entries.length === 0) {
    throw new Error('baseCode record must have at least one file');
  }
  const primaryFile = meta?.fileName || entries[0];
  const lang = meta?.lang || guessLangFromFileName(primaryFile);
  return { files: { ...baseCode }, primaryFile, lang };
}

/**
 * Collapse a single-file Record back to string for old-format compatibility.
 * Returns string if only one file, Record otherwise.
 */
export function denormalizeBaseCode(files) {
  const keys = Object.keys(files);
  if (keys.length === 1) return files[keys[0]];
  return { ...files };
}

/**
 * Post-process tutorial meta to fill missing lang/fileName from baseCode.
 * Call this after AI output parsing or API validation to ensure downstream
 * code doesn't need scattered `meta.lang || ''` fallbacks.
 *
 * Returns a new meta object (does not mutate input).
 */
export function normalizeTutorialMeta(meta, baseCode) {
  if (!meta) return meta;

  const { primaryFile, lang } = normalizeBaseCode(baseCode, meta);
  return {
    ...meta,
    lang: meta.lang || lang,
    fileName: meta.fileName || primaryFile,
  };
}
