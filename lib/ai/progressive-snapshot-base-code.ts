import type { TutorialStep } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { SourceItem } from '../schemas/source-item';
import {
  denormalizeBaseCode,
  guessLangFromFileName,
  normalizeBaseCode,
} from '../tutorial/normalize';
import { analyzeSourceCollectionShape } from '../utils/source-collection-shape';

export const PROGRESSIVE_PLACEHOLDER_MARKER = '__VIBEDOCS_PROGRESSIVE_PLACEHOLDER__';

const HASH_COMMENT_LANGS = new Set([
  'python',
  'ruby',
  'shellscript',
  'yaml',
  'toml',
  'ini',
  'dockerfile',
  'makefile',
  'perl',
  'r',
]);

const BLOCK_COMMENT_LANGS = new Set([
  'css',
  'scss',
  'html',
  'xml',
  'svg',
]);

function unique(values: string[]) {
  return [...new Set(values)];
}

function buildPlaceholderComment(fileName: string) {
  const lang = guessLangFromFileName(fileName);
  if (BLOCK_COMMENT_LANGS.has(lang)) {
    return [
      `/* ${PROGRESSIVE_PLACEHOLDER_MARKER}: ${fileName} */`,
      '/* Replace this placeholder when the tutorial reaches this file. */',
    ].join('\n');
  }

  const prefix = HASH_COMMENT_LANGS.has(lang) ? '#' : '//';
  return [
    `${prefix} ${PROGRESSIVE_PLACEHOLDER_MARKER}: ${fileName}`,
    `${prefix} This file is introduced in a later tutorial step.`,
    `${prefix} Replace the entire placeholder when this step targets the file.`,
  ].join('\n');
}

function collectReferencedTargetFiles(outline: TutorialOutline, knownPaths: Set<string>) {
  return unique(
    outline.steps.flatMap((step) => step.targetFiles ?? []),
  ).filter((path) => knownPaths.has(path));
}

export function prepareGenerationBaseFiles(
  outline: TutorialOutline,
  sourceItems: SourceItem[],
): {
  files: Record<string, string>;
  insertedFiles: string[];
} {
  const { files } = normalizeBaseCode(outline.baseCode, outline.meta);
  const sourceShape = analyzeSourceCollectionShape(sourceItems);
  if (sourceShape.mode === 'single_file') {
    return { files, insertedFiles: [] };
  }

  const knownPaths = new Set(sourceItems.map((item) => item.label));
  const referencedTargetFiles = collectReferencedTargetFiles(outline, knownPaths);
  const nextFiles = { ...files };
  const insertedFiles: string[] = [];

  for (const path of referencedTargetFiles) {
    if (nextFiles[path] !== undefined) continue;
    nextFiles[path] = buildPlaceholderComment(path);
    insertedFiles.push(path);
  }

  return { files: nextFiles, insertedFiles };
}

export function materializeBaseCodeForFilledSteps(
  outline: TutorialOutline,
  sourceItems: SourceItem[],
  filledSteps: TutorialStep[],
  insertedFiles?: string[],
) {
  const { files } = normalizeBaseCode(outline.baseCode, outline.meta);
  const sourceShape = analyzeSourceCollectionShape(sourceItems);
  if (sourceShape.mode === 'single_file') {
    return outline.baseCode;
  }

  const prepared = insertedFiles
    ? { insertedFiles }
    : prepareGenerationBaseFiles(outline, sourceItems);
  const patchedFiles = new Set(
    filledSteps.flatMap((step) =>
      (step.patches ?? [])
        .map((patch) => patch.file)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const nextFiles = { ...files };

  for (const path of prepared.insertedFiles) {
    if (!patchedFiles.has(path)) continue;
    nextFiles[path] = buildPlaceholderComment(path);
  }

  return denormalizeBaseCode(nextFiles);
}

export function isProgressivePlaceholderContent(content: string | null | undefined) {
  return Boolean(content?.includes(PROGRESSIVE_PLACEHOLDER_MARKER));
}

export function findProgressivePlaceholderTargets(
  currentFiles: Record<string, string>,
  targetFiles: string[],
) {
  return targetFiles.filter((file) => isProgressivePlaceholderContent(currentFiles[file]));
}
