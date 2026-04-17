#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as draftRepo from '../lib/repositories/draft-repository';
import { createMultiPhaseGenerationStream } from '../lib/ai/multi-phase-generator';
import { materializeBaseCodeForFilledSteps } from '../lib/ai/progressive-snapshot-base-code';
import { ensureDraftChapters } from '../lib/tutorial/chapters';
import { validateTutorialDraft } from '../lib/utils/validation';
import { computeGenerationQuality } from '../lib/services/compute-generation-quality';
import {
  recommendExperimentDecision,
  reviewGeneratedTutorial,
  type GenerationReviewReport,
} from '../lib/review/generation-quality-review';
import type { TutorialOutline } from '../lib/schemas/tutorial-outline';
import type { TutorialDraft, TutorialStep } from '../lib/schemas/tutorial-draft';
import type { SourceItem } from '../lib/schemas/source-item';
import type { TeachingBrief } from '../lib/schemas/teaching-brief';

const DEFAULT_CSV_PATH = path.join(process.cwd(), 'dataset', 'generation-quality-loop.csv');
const DEFAULT_REPORTS_DIR = path.join(process.cwd(), 'dataset', 'generation-quality-reports');
const CSV_HEADER = [
  'timestamp',
  'run_id',
  'round',
  'mode',
  'draft_id',
  'variant',
  'parent_run_id',
  'model_id',
  'decision',
  'total_score',
  'content_integrity',
  'pedagogical_progression',
  'source_coverage',
  'scrollytelling_readiness',
  'publish_readiness',
  'prompt_alignment',
  'critical_issue_count',
  'major_issue_count',
  'placeholder_step_count',
  'source_coverage_ratio',
  'patch_file_coverage_ratio',
  'patch_concentration_ratio',
  'validation_valid',
  'stop_condition_met',
  'issues',
  'prompt_files',
  'change_summary',
  'next_direction',
  'decision_reason',
].join(',');

interface LoopOptions {
  draftId: string;
  variant: string;
  mode: 'existing' | 'generate';
  modelId?: string;
  parentRunId?: string;
  round?: string;
  csvPath: string;
  reportsDir: string;
  changeSummary?: string;
  nextDirection?: string;
}

function resolveEffectiveModel(modelId?: string) {
  return modelId || process.env.DEFAULT_AI_MODEL || process.env.DEEPSEEK_MODEL || 'minimax/MiniMax-M2.7';
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function ensureCsvFile(csvPath: string) {
  const dir = path.dirname(csvPath);
  mkdirSync(dir, { recursive: true });
  if (!existsSync(csvPath)) {
    writeFileSync(csvPath, `${CSV_HEADER}\n`);
  }
}

async function consumeGenerationStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: Array<{ event: string; data: unknown }> = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        const event = lines.find((line) => line.startsWith('event: '))?.slice(7).trim() ?? 'message';
        const dataLine = lines.find((line) => line.startsWith('data: '));
        if (!dataLine) continue;
        try {
          events.push({ event, data: JSON.parse(dataLine.slice(6)) });
        } catch {
          events.push({ event, data: dataLine.slice(6) });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return events;
}

async function loadDraftRecord(draftId: string) {
  const draft = await draftRepo.getDraftById(draftId);
  if (!draft) {
    throw new Error(`Draft ${draftId} not found`);
  }
  return draft;
}

async function evaluateExistingDraft(draftId: string) {
  const draft = await loadDraftRecord(draftId);
  const review = reviewGeneratedTutorial({
    tutorialDraft: draft.tutorialDraft,
    sourceItems: draft.sourceItems,
    teachingBrief: draft.teachingBrief,
    outline: draft.generationOutline,
    validationValid: draft.validationValid,
    validationErrors: draft.validationErrors,
  });

  return {
    draftRecord: draft,
    tutorialDraft: draft.tutorialDraft,
    outline: draft.generationOutline,
    validation: {
      valid: draft.validationValid,
      errors: draft.validationErrors,
    },
    storedQuality: draft.generationQuality,
    review,
    generationError: draft.generationErrorMessage,
    events: [] as Array<{ event: string; data: unknown }>,
  };
}

async function generateAndEvaluateDraft(draftId: string, modelId?: string) {
  const draft = await loadDraftRecord(draftId);
  const effectiveModel = resolveEffectiveModel(modelId);
  let latestOutline: TutorialOutline | null = null;
  let latestSteps: TutorialStep[] = [];

  const generation = createMultiPhaseGenerationStream(
    draft.sourceItems as SourceItem[],
    draft.teachingBrief as TeachingBrief,
    effectiveModel,
    undefined,
    {
      onOutlineReady: (outline) => {
        latestOutline = outline;
      },
      onStepFilled: (_stepIndex, _step, filledSteps) => {
        latestSteps = [...filledSteps];
      },
    },
  );

  const streamPromise = consumeGenerationStream(generation.stream);
  let tutorialDraft: TutorialDraft | null = null;
  let outline: TutorialOutline | null = null;
  let generationError: string | null = null;
  let retryCount = 0;

  try {
    const result = await generation.result;
    tutorialDraft = result.draft;
    outline = result.outline;
    retryCount = result.retryCount;
  } catch (error) {
    generationError = error instanceof Error ? error.message : String(error);
    const recoveredOutline = latestOutline as TutorialOutline | null;
    outline = recoveredOutline;
    if (recoveredOutline && latestSteps.length > 0) {
      tutorialDraft = ensureDraftChapters({
        meta: recoveredOutline.meta,
        intro: recoveredOutline.intro,
        baseCode: materializeBaseCodeForFilledSteps(recoveredOutline, draft.sourceItems, latestSteps),
        chapters: recoveredOutline.chapters,
        steps: latestSteps,
      });
    }
  }

  const events = await streamPromise;
  const validation = tutorialDraft
    ? await validateTutorialDraft(tutorialDraft)
    : { valid: false, errors: generationError ? [generationError] : ['Generation failed before a draft was assembled.'] };
  const storedQuality = tutorialDraft && outline
    ? computeGenerationQuality(tutorialDraft, outline, retryCount, 0)
    : null;
  const review = reviewGeneratedTutorial({
    tutorialDraft,
    sourceItems: draft.sourceItems,
    teachingBrief: draft.teachingBrief,
    outline,
    validationValid: validation.valid,
    validationErrors: validation.errors,
  });

  return {
    draftRecord: draft,
    tutorialDraft,
    outline,
    validation,
    storedQuality,
    review,
    generationError,
    events,
  };
}

function loadParentReport(reportsDir: string, parentRunId?: string): GenerationReviewReport | null {
  if (!parentRunId) return null;
  const reportPath = path.join(reportsDir, `${parentRunId}.json`);
  if (!existsSync(reportPath)) {
    throw new Error(`Parent report not found: ${reportPath}`);
  }
  const data = JSON.parse(readFileSync(reportPath, 'utf8'));
  return data.review as GenerationReviewReport;
}

function buildRunId(options: LoopOptions) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const variant = sanitizeId(options.variant);
  const round = sanitizeId(options.round ?? 'r0');
  return `${round}-${variant}-${timestamp}`;
}

function appendCsvRow(
  csvPath: string,
  row: {
    timestamp: string;
    runId: string;
    round: string;
    mode: string;
    draftId: string;
    variant: string;
    parentRunId: string;
    modelId: string;
    decision: string;
    decisionReason: string;
    review: GenerationReviewReport;
    validationValid: boolean;
    changeSummary: string;
    nextDirection: string;
  },
) {
  ensureCsvFile(csvPath);
  const criticalIssueCount = row.review.issues.filter((issue) => issue.severity === 'critical').length;
  const majorIssueCount = row.review.issues.filter((issue) => issue.severity === 'major').length;
  const promptFiles = row.review.promptReview.map((item) => item.file).join('; ');
  const issues = row.review.issues.map((issue) => issue.code).join('; ');
  const values = [
    row.timestamp,
    row.runId,
    row.round,
    row.mode,
    row.draftId,
    row.variant,
    row.parentRunId,
    row.modelId,
    row.decision,
    row.review.totalScore,
    row.review.scorecard.contentIntegrity,
    row.review.scorecard.pedagogicalProgression,
    row.review.scorecard.sourceCoverage,
    row.review.scorecard.scrollytellingReadiness,
    row.review.scorecard.publishReadiness,
    row.review.scorecard.promptAlignment,
    criticalIssueCount,
    majorIssueCount,
    row.review.metrics.placeholderStepCount,
    row.review.metrics.sourceCoverageRatio,
    row.review.metrics.patchFileCoverageRatio,
    row.review.metrics.patchConcentrationRatio,
    row.validationValid,
    row.review.stopCondition.met,
    issues,
    promptFiles,
    row.changeSummary,
    row.nextDirection,
    row.decisionReason,
  ].map(csvEscape);

  appendFileSync(csvPath, `${values.join(',')}\n`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      'draft-id': { type: 'string' },
      variant: { type: 'string' },
      mode: { type: 'string' },
      model: { type: 'string' },
      'parent-run-id': { type: 'string' },
      round: { type: 'string' },
      csv: { type: 'string' },
      'reports-dir': { type: 'string' },
      'change-summary': { type: 'string' },
      'next-direction': { type: 'string' },
    },
    allowPositionals: false,
  });

  if (!values['draft-id'] || !values.variant) {
    throw new Error('Usage: tsx scripts/generation-quality-loop.ts --draft-id <id> --variant <name> [--mode existing|generate]');
  }

  const options: LoopOptions = {
    draftId: values['draft-id'],
    variant: values.variant,
    mode: (values.mode === 'generate' ? 'generate' : 'existing'),
    modelId: values.model,
    parentRunId: values['parent-run-id'],
    round: values.round,
    csvPath: values.csv ?? DEFAULT_CSV_PATH,
    reportsDir: values['reports-dir'] ?? DEFAULT_REPORTS_DIR,
    changeSummary: values['change-summary'],
    nextDirection: values['next-direction'],
  };
  const effectiveModel = resolveEffectiveModel(options.modelId);

  mkdirSync(options.reportsDir, { recursive: true });

  const result = options.mode === 'generate'
    ? await generateAndEvaluateDraft(options.draftId, effectiveModel)
    : await evaluateExistingDraft(options.draftId);

  const parentReview = loadParentReport(options.reportsDir, options.parentRunId);
  const recommendation = recommendExperimentDecision(result.review, parentReview);
  const runId = buildRunId(options);
  const timestamp = new Date().toISOString();

  const report = {
    runId,
    timestamp,
    draftId: options.draftId,
    parentRunId: options.parentRunId ?? null,
    round: options.round ?? null,
    mode: options.mode,
    variant: options.variant,
    modelId: effectiveModel,
    changeSummary: options.changeSummary ?? '',
    nextDirection: options.nextDirection ?? '',
    decision: recommendation,
    generationError: result.generationError,
    validation: result.validation,
    storedQuality: result.storedQuality,
    review: result.review,
    outline: result.outline,
    tutorialDraft: result.tutorialDraft,
    events: result.events,
  };

  const reportPath = path.join(options.reportsDir, `${runId}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  appendCsvRow(options.csvPath, {
    timestamp,
    runId,
    round: options.round ?? '',
    mode: options.mode,
    draftId: options.draftId,
    variant: options.variant,
    parentRunId: options.parentRunId ?? '',
    modelId: effectiveModel,
    decision: recommendation.recommendedDecision,
    decisionReason: recommendation.reason,
    review: result.review,
    validationValid: result.validation.valid,
    changeSummary: options.changeSummary ?? '',
    nextDirection: options.nextDirection ?? '',
  });

  console.log(JSON.stringify({
    runId,
    reportPath,
    csvPath: options.csvPath,
    totalScore: result.review.totalScore,
    scorecard: result.review.scorecard,
    issues: result.review.issues.map((issue) => ({
      code: issue.code,
      severity: issue.severity,
      stage: issue.stage,
    })),
    stopCondition: result.review.stopCondition,
    decision: recommendation,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
