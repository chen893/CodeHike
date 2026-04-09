import type { TutorialDraft } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { GenerationQuality } from '../schemas/generation-quality';

/**
 * Compute quality metrics for a generated tutorial.
 */
export function computeGenerationQuality(
  draft: TutorialDraft,
  outline: TutorialOutline,
  retryCount: number,
  totalGenerationTimeMs: number
): GenerationQuality {
  const { steps } = draft;
  const stepCount = steps.length;

  // Average patches per step
  const totalPatches = steps.reduce((sum, s) => sum + (s.patches?.length ?? 0), 0);
  const avgPatchesPerStep = stepCount > 0 ? totalPatches / stepCount : 0;

  // Average LOC change per step
  let totalLocChange = 0;
  for (const step of steps) {
    if (!step.patches) continue;
    for (const patch of step.patches) {
      const findLines = patch.find.split('\n').length;
      const replaceLines = patch.replace.split('\n').length;
      totalLocChange += Math.abs(replaceLines - findLines);
    }
  }
  const avgLocChangePerStep = stepCount > 0 ? totalLocChange / stepCount : 0;

  // Average paragraphs per step
  const totalParagraphs = steps.reduce((sum, s) => sum + s.paragraphs.length, 0);
  const avgParagraphsPerStep = stepCount > 0 ? totalParagraphs / stepCount : 0;

  // Prose-to-code ratio: total chars in paragraphs / total LOC change
  const totalProseChars = steps.reduce(
    (sum, s) => sum + s.paragraphs.reduce((pSum, p) => pSum + p.length, 0),
    0
  );
  const proseToCodeRatio = totalLocChange > 0 ? totalProseChars / totalLocChange : 0;

  // Patch validation pass rate: steps without patches are considered failed
  const failedSteps = steps.filter(
    (s) => !s.patches || s.patches.length === 0
  ).length;
  const patchValidationPassRate = stepCount > 0
    ? (stepCount - failedSteps) / stepCount
    : 1;

  // Outline-to-fill consistency: fraction of steps where titles match
  let consistentCount = 0;
  for (let i = 0; i < Math.min(steps.length, outline.steps.length); i++) {
    const outlineTitle = outline.steps[i].title.trim().toLowerCase();
    const fillTitle = steps[i].title.trim().toLowerCase();
    // Match if exact, substring, or share significant keywords (>2 chars)
    const isExactMatch = outlineTitle === fillTitle;
    const isSubstring = outlineTitle.includes(fillTitle) || fillTitle.includes(outlineTitle);
    const outlineKeywords = new Set(outlineTitle.split(/[\s：:，,、（）()\-—]+/).filter(w => w.length > 1));
    const fillKeywords = new Set(fillTitle.split(/[\s：:，,、（）()\-—]+/).filter(w => w.length > 1));
    let sharedKeywords = 0;
    for (const kw of outlineKeywords) {
      if (fillKeywords.has(kw)) sharedKeywords++;
    }
    const hasSharedConcept = sharedKeywords > 0 && (sharedKeywords / Math.max(outlineKeywords.size, fillKeywords.size)) >= 0.3;
    if (isExactMatch || isSubstring || hasSharedConcept) {
      consistentCount++;
    }
  }
  const outlineToFillConsistency = Math.min(steps.length, outline.steps.length) > 0
    ? consistentCount / Math.min(steps.length, outline.steps.length)
    : 1;

  return {
    stepCount,
    avgPatchesPerStep: Math.round(avgPatchesPerStep * 100) / 100,
    avgLocChangePerStep: Math.round(avgLocChangePerStep * 100) / 100,
    avgParagraphsPerStep: Math.round(avgParagraphsPerStep * 100) / 100,
    proseToCodeRatio: Math.round(proseToCodeRatio * 100) / 100,
    patchValidationPassRate: Math.round(patchValidationPassRate * 100) / 100,
    outlineToFillConsistency: Math.round(outlineToFillConsistency * 100) / 100,
    retryCount,
    totalGenerationTimeMs,
  };
}
