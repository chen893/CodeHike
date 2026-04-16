import type { TutorialOutline } from '../schemas/tutorial-outline';

export interface SourceScopeValidationResult {
  outline: TutorialOutline;
  repaired: boolean;
  errors: string[];
  /** Fraction of steps that needed repair (0-1). Over 0.3 means retry is recommended. */
  repairRatio: number;
  /** Whether the outline should be regenerated. */
  shouldRetry: boolean;
}

/**
 * Validate and repair the source scope of an outline.
 *
 * After AI generates an outline, targetFiles/contextFiles may contain:
 * - Invalid paths (not in sourceItems)
 * - Duplicates between targetFiles and contextFiles
 * - Empty targetFiles (need fallback to primaryFile)
 *
 * This function repairs these issues in-place and reports what was fixed.
 */
export function validateOutlineSourceScope(
  outline: TutorialOutline,
  sourceItems: { label: string }[],
  primaryFile: string,
): SourceScopeValidationResult {
  const knownPaths = new Set(sourceItems.map((item) => item.label));
  const errors: string[] = [];
  let repairedCount = 0;

  for (const step of outline.steps) {
    const stepErrors: string[] = [];

    // Validate targetFiles: remove unknown paths, dedupe, limit to 3
    const validTargetFiles = dedupe(step.targetFiles ?? [])
      .filter((path) => knownPaths.has(path))
      .slice(0, 3);

    // Validate contextFiles: remove unknown paths, remove those already in targetFiles, limit to 5
    const validContextFiles = dedupe(step.contextFiles ?? [])
      .filter((path) => knownPaths.has(path) && !validTargetFiles.includes(path))
      .slice(0, 5);

    // If targetFiles is empty after validation, repair to primaryFile
    let targetFiles = validTargetFiles;
    if (targetFiles.length === 0) {
      targetFiles = [primaryFile];
      stepErrors.push(`step "${step.id}" missing valid targetFiles; repaired to primary file`);
    }

    // Check if anything was repaired
    const originalTarget = dedupe(step.targetFiles ?? []);
    const originalContext = dedupe(step.contextFiles ?? []);
    const wasRepaired =
      targetFiles.length !== originalTarget.length ||
      !targetFiles.every((f) => originalTarget.includes(f)) ||
      validContextFiles.length !== originalContext.length ||
      !validContextFiles.every((f) => originalContext.includes(f));

    if (wasRepaired || stepErrors.length > 0) {
      repairedCount++;
    }

    // Apply repaired values
    step.targetFiles = targetFiles;
    step.contextFiles = validContextFiles;
    errors.push(...stepErrors);
  }

  const repairRatio = outline.steps.length > 0 ? repairedCount / outline.steps.length : 0;
  const shouldRetry = repairRatio > 0.3;

  return {
    outline,
    repaired: repairedCount > 0,
    errors,
    repairRatio,
    shouldRetry,
  };
}

/**
 * Helper to derive which source files a step-fill call should inject.
 */
export function deriveStepSourceScope(
  step: { targetFiles?: string[]; contextFiles?: string[] },
  previousFiles: Record<string, string>,
): {
  targetFiles: string[];
  contextFiles: string[];
} {
  const target = (step.targetFiles ?? []).filter((p) => p in previousFiles);
  const context = (step.contextFiles ?? []).filter(
    (p) => p in previousFiles && !target.includes(p),
  );
  return { targetFiles: target, contextFiles: context };
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
