import type { TutorialDraft } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import { analyzeSourceCollectionShape } from '../utils/source-collection-shape';
import { ensureDraftChapters } from '../tutorial/chapters';

// ---------------------------------------------------------------------------
// Step granularity thresholds
// ---------------------------------------------------------------------------

const OVERSIZED_LOC_THRESHOLD = 40;
const SEVERELY_OVERSIZED_LOC_THRESHOLD = 80;
const OUTLINE_FILL_CONSISTENCY_FLOOR = 0.6;
const AVG_LOC_TRIGGER = 40;
const SEVERE_STEP_RATIO = 0.15;

export interface GenerationReviewIssue {
  code: string;
  severity: 'critical' | 'major' | 'minor';
  title: string;
  summary: string;
  stage: 'outline' | 'step_fill' | 'validate' | 'pipeline';
  promptFiles: string[];
  flowFiles: string[];
  suggestedDirections: string[];
}

export interface GenerationReviewScorecard {
  contentIntegrity: number;
  pedagogicalProgression: number;
  sourceCoverage: number;
  scrollytellingReadiness: number;
  publishReadiness: number;
  promptAlignment: number;
}

export interface GenerationReviewStopCondition {
  met: boolean;
  reasons: string[];
  threshold: number;
}

export interface GenerationReviewReport {
  totalScore: number;
  scorecard: GenerationReviewScorecard;
  issues: GenerationReviewIssue[];
  stopCondition: GenerationReviewStopCondition;
  metrics: {
    stepCount: number;
    chapterCount: number;
    sourceItemCount: number;
    baseFileCount: number;
    uniquePatchFileCount: number;
    placeholderStepCount: number;
    missingLeadCount: number;
    missingPatchCount: number;
    missingFocusCount: number;
    missingMarksCount: number;
    sourceCoverageRatio: number;
    patchFileCoverageRatio: number;
    patchConcentrationRatio: number;
    avgLocChangePerStep: number;
    maxLocChangePerStep: number;
    oversizedStepCount: number;
    severelyOversizedStepCount: number;
    outlineToFillConsistency: number;
  };
  promptReview: Array<{
    file: string;
    issueCodes: string[];
    summary: string;
  }>;
}

export interface ReviewGenerationInput {
  tutorialDraft: TutorialDraft | null;
  sourceItems: SourceItem[];
  teachingBrief?: TeachingBrief | null;
  outline?: TutorialOutline | null;
  validationValid?: boolean;
  validationErrors?: string[];
}

const FAILURE_PATTERNS = [
  /⚠️\s*此步骤自动生成失败/u,
  /Failed to parse JSON from model response/u,
  /请手动编辑/u,
];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasFailurePlaceholder(text: string): boolean {
  return FAILURE_PATTERNS.some((pattern) => pattern.test(text));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function getPatchFile(step: TutorialDraft['steps'][number], primaryFile: string | null) {
  return (step.patches ?? [])
    .map((patch) => patch.file ?? primaryFile)
    .filter((value): value is string => Boolean(value));
}

function hasValidFocus(step: TutorialDraft['steps'][number]) {
  if (!step.focus) return false;
  return (
    Number.isInteger(step.focus.start) &&
    Number.isInteger(step.focus.end) &&
    step.focus.start >= 1 &&
    step.focus.end >= step.focus.start
  );
}

function hasValidMarks(step: TutorialDraft['steps'][number]) {
  if (!step.marks?.length) return false;
  return step.marks.every((mark) =>
    Number.isInteger(mark.start) &&
    Number.isInteger(mark.end) &&
    mark.start >= 1 &&
    mark.end >= mark.start
  );
}

function buildPromptReview(issues: GenerationReviewIssue[]) {
  const grouped = new Map<string, string[]>();
  for (const issue of issues) {
    for (const file of issue.promptFiles) {
      if (!grouped.has(file)) grouped.set(file, []);
      grouped.get(file)!.push(issue.code);
    }
  }

  return [...grouped.entries()].map(([file, issueCodes]) => ({
    file,
    issueCodes: unique(issueCodes),
    summary: `Needs review for ${unique(issueCodes).join(', ')}.`,
  }));
}

function computeStepLoc(step: TutorialDraft['steps'][number]) {
  return (step.patches ?? []).reduce((sum, patch) => {
    const findLines = patch.find.split('\n').length;
    const replaceLines = patch.replace.split('\n').length;
    return sum + Math.abs(replaceLines - findLines);
  }, 0);
}

function computeOutlineToFillConsistency(
  draft: TutorialDraft,
  outline?: TutorialOutline | null,
) {
  if (!outline || !Array.isArray(outline.steps) || outline.steps.length === 0 || draft.steps.length === 0) {
    return 1;
  }

  let consistentCount = 0;
  const comparableCount = Math.min(draft.steps.length, outline.steps.length);
  for (let i = 0; i < comparableCount; i++) {
    const outlineTitle = outline.steps[i].title.trim().toLowerCase();
    const fillTitle = draft.steps[i].title.trim().toLowerCase();
    const isExactMatch = outlineTitle === fillTitle;
    const isSubstring = outlineTitle.includes(fillTitle) || fillTitle.includes(outlineTitle);
    const outlineKeywords = new Set(
      outlineTitle.split(/[\s：:，,、（）()\-—]+/).filter((word) => word.length > 1),
    );
    const fillKeywords = new Set(
      fillTitle.split(/[\s：:，,、（）()\-—]+/).filter((word) => word.length > 1),
    );
    let sharedKeywords = 0;
    for (const keyword of outlineKeywords) {
      if (fillKeywords.has(keyword)) sharedKeywords++;
    }
    const hasSharedConcept =
      sharedKeywords > 0 &&
      (sharedKeywords / Math.max(outlineKeywords.size || 1, fillKeywords.size || 1)) >= 0.3; // keyword overlap ratio threshold
    if (isExactMatch || isSubstring || hasSharedConcept) {
      consistentCount++;
    }
  }

  return comparableCount > 0 ? consistentCount / comparableCount : 1;
}

export function reviewGeneratedTutorial({
  tutorialDraft,
  sourceItems,
  outline,
  validationValid = false,
  validationErrors = [],
}: ReviewGenerationInput): GenerationReviewReport {
  if (!tutorialDraft) {
    const issues: GenerationReviewIssue[] = [
      {
        code: 'GENERATION_OUTPUT_MISSING',
        severity: 'critical',
        title: 'No tutorial draft was produced',
        summary: 'The pipeline failed before producing a usable tutorial draft.',
        stage: 'pipeline',
        promptFiles: ['lib/ai/outline-prompt.ts', 'lib/ai/step-fill-prompt.ts'],
        flowFiles: ['lib/ai/multi-phase-generator.ts', 'lib/services/generate-tutorial-draft.ts'],
        suggestedDirections: [
          'Review the first failing phase and remove the blocking prompt or parsing issue before further prompt tuning.',
        ],
      },
    ];

    return {
      totalScore: 0,
      scorecard: {
        contentIntegrity: 0,
        pedagogicalProgression: 0,
        sourceCoverage: 0,
        scrollytellingReadiness: 0,
        publishReadiness: 0,
        promptAlignment: 0,
      },
      issues,
      stopCondition: {
        met: false,
        reasons: ['No tutorial draft was produced.'],
        threshold: 90,
      },
      metrics: {
        stepCount: 0,
        chapterCount: 0,
        sourceItemCount: sourceItems.length,
        baseFileCount: 0,
        uniquePatchFileCount: 0,
        placeholderStepCount: 0,
        missingLeadCount: 0,
        missingPatchCount: 0,
        missingFocusCount: 0,
        missingMarksCount: 0,
        sourceCoverageRatio: 0,
        patchFileCoverageRatio: 0,
        patchConcentrationRatio: 0,
        avgLocChangePerStep: 0,
        maxLocChangePerStep: 0,
        oversizedStepCount: 0,
        severelyOversizedStepCount: 0,
        outlineToFillConsistency: 0,
      },
      promptReview: buildPromptReview(issues),
    };
  }

  const draft = ensureDraftChapters(tutorialDraft as any) as TutorialDraft;
  const shape = analyzeSourceCollectionShape(sourceItems);
  const baseFiles = typeof draft.baseCode === 'string'
    ? [draft.meta.fileName].filter((value): value is string => Boolean(value))
    : Object.keys(draft.baseCode);
  const primaryFile = draft.meta.fileName ?? baseFiles[0] ?? null;
  const patchFiles = draft.steps.flatMap((step) => getPatchFile(step, primaryFile));
  const uniquePatchFiles = unique(patchFiles);
  const patchFileCounts = patchFiles.reduce<Record<string, number>>((acc, file) => {
    acc[file] = (acc[file] ?? 0) + 1;
    return acc;
  }, {});
  const maxPatchFileCount = Math.max(0, ...Object.values(patchFileCounts));
  const patchConcentrationRatio = patchFiles.length > 0 ? maxPatchFileCount / patchFiles.length : 1;

  const placeholderSteps = draft.steps.filter((step) =>
    step.paragraphs.some((paragraph) => hasFailurePlaceholder(paragraph)),
  );
  const missingLeadSteps = draft.steps.filter((step) => !step.lead?.trim());
  const missingPatchSteps = draft.steps.filter((step) => !step.patches?.length);
  const missingFocusSteps = draft.steps.filter((step) => !hasValidFocus(step));
  const missingMarksSteps = draft.steps.filter((step) => !hasValidMarks(step));

  const sourceItemLabels = sourceItems.map((item) => item.label);
  const baseCoverage = sourceItemLabels.length > 0 ? baseFiles.length / sourceItemLabels.length : 1;
  const patchCoverage = sourceItemLabels.length > 0 ? uniquePatchFiles.length / sourceItemLabels.length : 1;
  const sourceCoverageRatio = Math.min(1, Math.max(baseCoverage, patchCoverage));
  const stepLocValues = draft.steps.map((step) => computeStepLoc(step));
  const avgLocChangePerStep = stepLocValues.length > 0
    ? stepLocValues.reduce((sum, value) => sum + value, 0) / stepLocValues.length
    : 0;
  const maxLocChangePerStep = stepLocValues.length > 0 ? Math.max(...stepLocValues) : 0;
  const oversizedStepCount = stepLocValues.filter((value) => value > OVERSIZED_LOC_THRESHOLD).length;
  const severelyOversizedStepCount = stepLocValues.filter((value) => value > SEVERELY_OVERSIZED_LOC_THRESHOLD).length;
  const outlineToFillConsistency = computeOutlineToFillConsistency(draft, outline);

  const issues: GenerationReviewIssue[] = [];

  if (placeholderSteps.length > 0) {
    issues.push({
      code: 'PLACEHOLDER_STEP_CONTENT',
      severity: 'critical',
      title: 'Failed step placeholders leaked into the draft',
      summary: `${placeholderSteps.length} step(s) contain generation failure placeholders instead of publishable tutorial content.`,
      stage: 'step_fill',
      promptFiles: ['lib/ai/step-fill-prompt.ts'],
      flowFiles: ['lib/ai/multi-phase-generator.ts', 'lib/utils/validation.ts'],
      suggestedDirections: [
        'Treat exhausted step-fill retries as a validation failure instead of a successful draft.',
        'Tighten step-fill prompts to require valid JSON, non-empty lead, and no meta-commentary.',
      ],
    });
  }

  if (shape.mode === 'progressive_snapshots' && sourceCoverageRatio < 0.5) {
    issues.push({
      code: 'SOURCE_COVERAGE_COLLAPSE',
      severity: 'major',
      title: 'Progressive snapshot inputs collapsed into too few tutorial files',
      summary: `Source inputs look like milestone snapshots, but only ${baseFiles.length} base file(s) and ${uniquePatchFiles.length} patched file(s) are represented.`,
      stage: 'outline',
      promptFiles: ['lib/ai/outline-prompt.ts', 'lib/ai/step-fill-prompt.ts'],
      flowFiles: ['lib/ai/multi-phase-generator.ts'],
      suggestedDirections: [
        'Explicitly tell the outline prompt when inputs are progressive snapshots rather than parallel modules.',
        'Require the outline to preserve milestone coverage and forbid collapsing all later capabilities into the earliest file.',
      ],
    });
  }

  if (shape.mode !== 'single_file' && patchConcentrationRatio > 0.85 && uniquePatchFiles.length <= 1) {
    issues.push({
      code: 'PATCH_FILE_CONCENTRATION',
      severity: 'major',
      title: 'Nearly all code changes landed in one file',
      summary: 'The tutorial concentrates almost all patches in a single file, which weakens source fidelity and architectural realism.',
      stage: 'step_fill',
      promptFiles: ['lib/ai/step-fill-prompt.ts'],
      flowFiles: ['lib/ai/multi-phase-generator.ts'],
      suggestedDirections: [
        'Encourage step-fill to align each step with the relevant milestone or target file instead of defaulting to the primary file.',
      ],
    });
  }

  if (missingLeadSteps.length > 0 || missingFocusSteps.length > 0 || missingMarksSteps.length > 0) {
    issues.push({
      code: 'SCROLLY_METADATA_GAPS',
      severity: 'minor',
      title: 'Some steps are missing scrollytelling metadata',
      summary: `Missing lead: ${missingLeadSteps.length}, focus: ${missingFocusSteps.length}, marks: ${missingMarksSteps.length}.`,
      stage: 'step_fill',
      promptFiles: ['lib/ai/step-fill-prompt.ts'],
      flowFiles: ['lib/ai/multi-phase-generator.ts'],
      suggestedDirections: [
        'Require lead/focus/marks for every non-summary step and reject empty metadata in review.',
      ],
    });
  }

  if (avgLocChangePerStep > AVG_LOC_TRIGGER || severelyOversizedStepCount >= Math.max(2, Math.ceil(draft.steps.length * SEVERE_STEP_RATIO))) {
    issues.push({
      code: 'STEP_GRANULARITY_OVERSIZED',
      severity: 'major',
      title: 'Too many steps land oversized code changes',
      summary: `Average LOC change per step is ${avgLocChangePerStep.toFixed(1)}, with ${oversizedStepCount} step(s) over ${OVERSIZED_LOC_THRESHOLD} LOC and ${severelyOversizedStepCount} step(s) over ${SEVERELY_OVERSIZED_LOC_THRESHOLD} LOC.`,
      stage: 'step_fill',
      promptFiles: ['lib/ai/step-fill-prompt.ts'],
      flowFiles: ['lib/ai/multi-phase-generator.ts'],
      suggestedDirections: [
        'Turn the LOC budget into a real retry or split trigger instead of accepting oversized steps.',
        'Allow outline/pipeline to insert intermediate steps when a target file would otherwise land as a whole-file patch.',
      ],
    });
  }

  if (outline && outlineToFillConsistency < OUTLINE_FILL_CONSISTENCY_FLOOR) {
    issues.push({
      code: 'OUTLINE_FILL_DRIFT',
      severity: 'major',
      title: 'Filled steps drifted away from the approved outline',
      summary: `Outline-to-fill consistency is ${outlineToFillConsistency.toFixed(2)}, which suggests the final steps no longer match the outline titles/concepts closely enough.`,
      stage: 'pipeline',
      promptFiles: ['lib/ai/outline-prompt.ts', 'lib/ai/step-fill-prompt.ts'],
      flowFiles: ['lib/ai/multi-phase-generator.ts'],
      suggestedDirections: [
        'Keep more explicit concept anchors from the outline in step-fill prompts.',
        'Split broad outline steps before step-fill so later steps do not collapse into file-sized patches.',
      ],
    });
  }

  if (!validationValid || validationErrors.length > 0) {
    issues.push({
      code: 'PUBLISH_VALIDATION_FAILED',
      severity: 'critical',
      title: 'The generated draft does not pass final validation',
      summary: validationErrors.length > 0
        ? validationErrors.join(' | ')
        : 'The draft is not validation-safe for publication.',
      stage: 'validate',
      promptFiles: ['lib/ai/outline-prompt.ts', 'lib/ai/step-fill-prompt.ts'],
      flowFiles: ['lib/utils/validation.ts', 'lib/services/generate-tutorial-draft.ts'],
      suggestedDirections: [
        'Block publish-ready status when validation fails, even if partial content exists.',
      ],
    });
  }

  if (outline && sourceItems.length > 1) {
    const outlineHasSourceScope = outline.steps.some(
      (step) => (step.targetFiles?.length ?? 0) > 0 || (step.contextFiles?.length ?? 0) > 0,
    );
    if (!outlineHasSourceScope) {
      issues.push({
        code: 'OUTLINE_SOURCE_SCOPE_MISSING',
        severity: 'minor',
        title: 'Outline did not preserve per-step source scope',
        summary: 'Outline steps lack target/context file hints, which makes later step-fill drift more likely.',
        stage: 'outline',
        promptFiles: ['lib/ai/outline-prompt.ts'],
        flowFiles: ['lib/ai/outline-source-scope.ts', 'lib/ai/multi-phase-generator.ts'],
        suggestedDirections: [
          'Prefer retrieval mode or add source-scope hints when generating outlines for multi-file inputs.',
        ],
      });
    }
  }

  let contentIntegrity = 100;
  contentIntegrity -= placeholderSteps.length * 35;
  contentIntegrity -= missingPatchSteps.length * 5;
  contentIntegrity -= validationValid ? 0 : 15;

  let pedagogicalProgression = 100;
  pedagogicalProgression -= missingLeadSteps.length * 8;
  pedagogicalProgression -= draft.steps.filter((step) => step.paragraphs.length < 2).length * 4;
  if (draft.chapters.length === 0) pedagogicalProgression -= 10;
  pedagogicalProgression -= Math.min(25, oversizedStepCount * 2 + severelyOversizedStepCount * 3);
  pedagogicalProgression -= Math.min(25, Math.round((1 - outlineToFillConsistency) * 25));

  let sourceCoverage = 100;
  sourceCoverage -= Math.round((1 - sourceCoverageRatio) * 65);
  sourceCoverage -= Math.round((1 - Math.min(1, uniquePatchFiles.length / Math.max(1, baseFiles.length))) * 15);
  if (patchConcentrationRatio > 0.85) sourceCoverage -= 15;

  let scrollytellingReadiness = 100;
  scrollytellingReadiness -= missingFocusSteps.length * 5;
  scrollytellingReadiness -= missingMarksSteps.length * 3;
  scrollytellingReadiness -= missingLeadSteps.length * 4;
  scrollytellingReadiness -= Math.min(35, Math.round(Math.max(0, avgLocChangePerStep - 20) * 0.25));
  scrollytellingReadiness -= Math.min(20, severelyOversizedStepCount * 2);

  let publishReadiness = validationValid ? 100 : 40;
  publishReadiness -= placeholderSteps.length * 20;
  publishReadiness -= missingPatchSteps.length * 3;

  let promptAlignment = 100;
  promptAlignment -= issues.filter((issue) => issue.stage === 'outline').length * 12;
  promptAlignment -= issues.filter((issue) => issue.stage === 'step_fill').length * 10;
  promptAlignment -= placeholderSteps.length * 8;

  const scorecard: GenerationReviewScorecard = {
    contentIntegrity: clampScore(contentIntegrity),
    pedagogicalProgression: clampScore(pedagogicalProgression),
    sourceCoverage: clampScore(sourceCoverage),
    scrollytellingReadiness: clampScore(scrollytellingReadiness),
    publishReadiness: clampScore(publishReadiness),
    promptAlignment: clampScore(promptAlignment),
  };

  const totalScore = clampScore(
    scorecard.contentIntegrity * 0.25 +
    scorecard.pedagogicalProgression * 0.2 +
    scorecard.sourceCoverage * 0.2 +
    scorecard.scrollytellingReadiness * 0.15 +
    scorecard.publishReadiness * 0.1 +
    scorecard.promptAlignment * 0.1,
  );

  const threshold = 90;
  const stopReasons: string[] = [];
  if (totalScore < threshold) stopReasons.push(`Total score ${totalScore} is below ${threshold}.`);
  if (scorecard.contentIntegrity < 90) stopReasons.push('Content integrity is below 90.');
  if (scorecard.sourceCoverage < 90) stopReasons.push('Source coverage is below 90.');
  if (scorecard.publishReadiness < 90) stopReasons.push('Publish readiness is below 90.');
  if (issues.some((issue) => issue.severity === 'critical')) {
    stopReasons.push('Critical issues are still present.');
  }

  return {
    totalScore,
    scorecard,
    issues,
    stopCondition: {
      met: stopReasons.length === 0,
      reasons: stopReasons,
      threshold,
    },
    metrics: {
      stepCount: draft.steps.length,
      chapterCount: draft.chapters.length,
      sourceItemCount: sourceItems.length,
      baseFileCount: baseFiles.length,
      uniquePatchFileCount: uniquePatchFiles.length,
      placeholderStepCount: placeholderSteps.length,
      missingLeadCount: missingLeadSteps.length,
      missingPatchCount: missingPatchSteps.length,
      missingFocusCount: missingFocusSteps.length,
      missingMarksCount: missingMarksSteps.length,
      sourceCoverageRatio: Number(sourceCoverageRatio.toFixed(2)),
      patchFileCoverageRatio: Number(patchCoverage.toFixed(2)),
      patchConcentrationRatio: Number(patchConcentrationRatio.toFixed(2)),
      avgLocChangePerStep: Number(avgLocChangePerStep.toFixed(2)),
      maxLocChangePerStep: maxLocChangePerStep,
      oversizedStepCount,
      severelyOversizedStepCount,
      outlineToFillConsistency: Number(outlineToFillConsistency.toFixed(2)),
    },
    promptReview: buildPromptReview(issues),
  };
}

export function recommendExperimentDecision(
  current: GenerationReviewReport,
  previous?: GenerationReviewReport | null,
): { recommendedDecision: 'baseline' | 'keep' | 'revert'; reason: string } {
  if (!previous) {
    return {
      recommendedDecision: 'baseline',
      reason: 'No previous report was provided; this run establishes the baseline.',
    };
  }

  const currentCritical = current.issues.filter((issue) => issue.severity === 'critical').length;
  const previousCritical = previous.issues.filter((issue) => issue.severity === 'critical').length;

  if (current.totalScore > previous.totalScore && currentCritical <= previousCritical) {
    return {
      recommendedDecision: 'keep',
      reason: `Score improved from ${previous.totalScore} to ${current.totalScore} without introducing more critical issues.`,
    };
  }

  return {
    recommendedDecision: 'revert',
    reason: `Score moved from ${previous.totalScore} to ${current.totalScore}, or critical issues increased (${previousCritical} → ${currentCritical}).`,
  };
}
