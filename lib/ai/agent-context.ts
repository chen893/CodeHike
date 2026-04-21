/**
 * Context Distillation for the Agent Loop
 *
 * Three-tier compression system that prevents token overflow in long tutorials:
 *   1. microCompact (free) — replaces completed steps with one-line summaries
 *   2. autoSummarize (65% threshold) — LLM-based context distillation
 *   3. fullReplan (85% threshold) — regenerate remaining outline steps
 *
 * Key principle: distillation preserves "why" not "what" — decision paths,
 * not intermediate steps. Repair records are highest priority in compressed
 * context because they are most easily lost and most valuable to preserve.
 */

import { generateText } from 'ai';
import type { TutorialStep } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { TeachingBrief } from '../schemas/teaching-brief';
import type { SourceItem } from '../schemas/source-item';
import { estimateTokens } from './token-budget';
import { createProvider, getMaxOutputTokens } from './provider-registry';
import { parseJsonFromText } from './parse-json-text';
import { tutorialOutlineSchema } from '../schemas/tutorial-outline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DistilledContext {
  /** One-line-per-step summary of completed work. */
  completedStepsSummary: string;
  /** Key function/class/import signatures from current code. */
  currentCodeSignatures: string;
  /** Complete repair records, not summarized (highest priority). */
  errorAndRepairHistory: string;
  /** Teaching goals for remaining steps. */
  remainingSteps: string;
  /** Full detail of the current step being worked on. */
  currentStepDetail: string;
  /** Brief preview of the next step. */
  nextStepPreview: string;
  /** Token budget snapshot at time of distillation. */
  tokenBudget: { used: number; budget: number };
}

export interface CompressionResult {
  type: 'micro' | 'summary' | 'replan';
  tokensBefore: number;
  tokensAfter: number;
  context?: DistilledContext;
  revisedOutline?: TutorialOutline;
}

// ---------------------------------------------------------------------------
// Tier 1: microCompact (free — no LLM cost)
// ---------------------------------------------------------------------------

/**
 * Replace completed steps with one-line summaries.
 * Called after every successful step. Zero LLM cost.
 *
 * Output format:
 *   [step 1: Title — 3 patches, 12 LOC]
 *   [step 2: Title — 1 patches, 5 LOC]
 */
export function microCompact(
  steps: TutorialStep[],
  currentIndex: number,
): string {
  return steps.slice(0, currentIndex).map((step, i) => {
    const patchCount = step.patches?.length ?? 0;
    const locChange = (step.patches ?? []).reduce((sum, p) => {
      return sum + Math.abs(p.replace.split('\n').length - p.find.split('\n').length);
    }, 0);
    return `[step ${i + 1}: ${step.title} — ${patchCount} patches, ${locChange} LOC]`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Distillation prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the distillation prompt for auto-summarize.
 *
 * Priority order (per architecture doc section 7.2):
 *   1. Repair records and errors (highest priority)
 *   2. Current step's full context
 *   3. Remaining steps' teaching goals
 *   4. Current code's key structure (function signatures, imports)
 */
export function buildDistillPrompt(input: {
  completedStepsSummary: string;
  currentCode: Record<string, string>;
  repairHistory: Array<{ stepIndex: number; attempts: number; errorMessage: string }>;
  outline: TutorialOutline;
  currentStepIndex: number;
  teachingBrief: TeachingBrief;
}): { systemPrompt: string; userPrompt: string } {
  const { completedStepsSummary, currentCode, repairHistory, outline, currentStepIndex, teachingBrief } = input;

  // Build code signatures (function names, import lists, class names -- not full code)
  const codeSignatures = Object.entries(currentCode).map(([file, code]) => {
    const lines = code.split('\n');
    const signatures = lines
      .filter(line => /^(export\s+)?(function|const|class|interface|type|import)\s/.test(line.trim()))
      .slice(0, 10)
      .join('\n');
    return `### ${file} (${lines.length} lines)\n\`\`\`\n${signatures}\n\`\`\``;
  }).join('\n\n');

  const repairSection = repairHistory.length > 0
    ? `## Repair records (highest priority -- preserve completely)\n` +
      repairHistory.map(r =>
        `- Step ${r.stepIndex + 1}: ${r.attempts} attempts, error: ${r.errorMessage}`
      ).join('\n')
    : '(no repairs)';

  const remainingSteps = outline.steps.slice(currentStepIndex).map((step, i) =>
    `${currentStepIndex + i + 1}. ${step.title} — ${step.teachingGoal}`
  ).join('\n');

  const currentStep = outline.steps[currentStepIndex];

  const systemPrompt = `You are a context distiller for a tutorial generation system.
Your task: compress the generation context while preserving critical information.

Priority (highest to lowest):
1. Repair records and errors — must be preserved completely
2. Current step context — full detail
3. Remaining steps — teaching goals only
4. Code structure — signatures, not implementations

Output a JSON object with these fields:
{
  "completedStepsSummary": "one-line-per-step summary of completed work",
  "currentCodeSignatures": "key function/class/import signatures from current code",
  "errorAndRepairHistory": "complete repair records, not summarized",
  "remainingSteps": "teaching goals for remaining steps",
  "currentStepDetail": "full detail of current step being worked on",
  "nextStepPreview": "brief preview of next step"
}`;

  const userPrompt = `## Completed steps summary
${completedStepsSummary}

## Current code signatures
${codeSignatures}

${repairSection}

## Remaining steps (from outline)
${remainingSteps}

## Current step detail
- Title: ${currentStep?.title ?? 'N/A'}
- Teaching goal: ${currentStep?.teachingGoal ?? 'N/A'}
- Concept: ${currentStep?.conceptIntroduced ?? 'N/A'}

## Next step preview
${currentStepIndex + 1 < outline.steps.length ? `${outline.steps[currentStepIndex + 1].title} — ${outline.steps[currentStepIndex + 1].teachingGoal}` : '(last step)'}

## Tutorial context
- Topic: ${teachingBrief.topic}
- Total steps: ${outline.steps.length}
- Completed: ${currentStepIndex}`;

  return { systemPrompt, userPrompt };
}

// ---------------------------------------------------------------------------
// Tier 2: autoSummarize (LLM-based, 65% threshold)
// ---------------------------------------------------------------------------

/**
 * Auto-summarize: call LLM to distill context when token usage exceeds 65%.
 * Returns a DistilledContext that replaces the full history in subsequent prompts.
 */
export async function autoSummarize(
  input: {
    completedStepsSummary: string;
    currentCode: Record<string, string>;
    repairHistory: Array<{ stepIndex: number; attempts: number; errorMessage: string }>;
    outline: TutorialOutline;
    currentStepIndex: number;
    teachingBrief: TeachingBrief;
  },
  modelId?: string,
): Promise<DistilledContext> {
  const model = createProvider(modelId);
  const { systemPrompt, userPrompt } = buildDistillPrompt(input);

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 2000,
  });

  // Parse the distilled context from the LLM response.
  // Use a permissive JSON extraction — the output is a DistilledContext
  // but we don't have a dedicated Zod schema for it.
  let parsed: DistilledContext | null = null;
  try {
    const text = result.text;
    const braceStart = text.indexOf('{');
    const braceEnd = text.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      const jsonObj = JSON.parse(text.slice(braceStart, braceEnd + 1));
      if (jsonObj && typeof jsonObj === 'object') {
        parsed = jsonObj as DistilledContext;
      }
    }
  } catch {
    parsed = null;
  }

  if (!parsed) {
    // Fallback: return a minimal context from the input data
    return {
      completedStepsSummary: input.completedStepsSummary,
      currentCodeSignatures: '(distillation parse failed)',
      errorAndRepairHistory: input.repairHistory.map(r =>
        `Step ${r.stepIndex + 1}: ${r.attempts} attempts, error: ${r.errorMessage}`
      ).join('\n'),
      remainingSteps: input.outline.steps.slice(input.currentStepIndex).map((s, i) =>
        `${input.currentStepIndex + i + 1}. ${s.title} — ${s.teachingGoal}`
      ).join('\n'),
      currentStepDetail: input.outline.steps[input.currentStepIndex]?.teachingGoal ?? '',
      nextStepPreview: input.currentStepIndex + 1 < input.outline.steps.length
        ? input.outline.steps[input.currentStepIndex + 1].teachingGoal
        : '(last step)',
      tokenBudget: { used: 0, budget: 0 },
    };
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Tier 3: fullReplan (LLM-based, 85% threshold)
// ---------------------------------------------------------------------------

/**
 * Full-replan: regenerate the remaining outline steps from the current step.
 * Called when token usage exceeds 85%. Preserves already-completed steps.
 */
export async function fullReplan(
  input: {
    outline: TutorialOutline;
    currentStepIndex: number;
    completedStepsSummary: string;
    currentCode: Record<string, string>;
    teachingBrief: TeachingBrief;
    sourceItems: SourceItem[];
  },
  modelId?: string,
): Promise<TutorialOutline> {
  const model = createProvider(modelId);
  const { outline, currentStepIndex, completedStepsSummary, currentCode, teachingBrief } = input;

  const codeSignatures = Object.entries(currentCode).map(([file, code]) => {
    const lines = code.split('\n');
    return `${file} (${lines.length} lines)`;
  }).join(', ');

  const completedSteps = outline.steps.slice(0, currentStepIndex);
  const originalRemaining = outline.steps.slice(currentStepIndex);

  const systemPrompt = `You are replanning the remaining steps of a tutorial.
The tutorial has already completed ${currentStepIndex} steps. You must design the remaining steps.

Output a JSON object with the SAME structure as the original outline, but with:
- steps: only the REMAINING steps (starting from step ${currentStepIndex + 1})
- Keep the same meta, intro, and baseCode
- Steps must continue from where the completed steps left off
- Each step: { id, title, teachingGoal, conceptIntroduced, estimatedLocChange }`;

  const userPrompt = `## Completed steps
${completedStepsSummary}

## Current code state
Files: ${codeSignatures}

## Original remaining steps (for reference)
${originalRemaining.map((s, i) => `${currentStepIndex + i + 1}. ${s.title} — ${s.teachingGoal}`).join('\n')}

## Tutorial context
- Topic: ${teachingBrief.topic}
- Audience: ${teachingBrief.audience_level}
- Core question: ${teachingBrief.core_question}
- Language: ${teachingBrief.output_language}

Please redesign the remaining ${originalRemaining.length} steps, keeping the teaching goals but adjusting based on what has actually been completed.`;

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: getMaxOutputTokens(modelId),
  });

  // Parse the revised outline
  const partialOutline = parseJsonFromText(result.text, tutorialOutlineSchema, 'full-replan');
  if (!partialOutline) {
    // Fallback: return original outline unchanged
    return outline;
  }

  // Merge: keep completed steps, replace remaining
  const revisedSteps = [
    ...completedSteps,
    ...(partialOutline.steps ?? originalRemaining),
  ];

  return {
    ...outline,
    steps: revisedSteps,
  };
}

// ---------------------------------------------------------------------------
// Compression threshold checker
// ---------------------------------------------------------------------------

/**
 * Check if token usage has crossed a compression threshold.
 * Returns the recommended compression action.
 *
 * Thresholds:
 *   - 85%+ → 'replan' (full outline regeneration)
 *   65%+ → 'summary' (LLM context distillation)
 *   <65% → 'none' (no compression needed)
 */
export function checkCompressionThreshold(
  tokenUsage: { used: number; budget: number },
): 'none' | 'micro' | 'summary' | 'replan' {
  const ratio = tokenUsage.budget > 0 ? tokenUsage.used / tokenUsage.budget : 0;
  if (ratio >= 0.85) return 'replan';
  if (ratio >= 0.65) return 'summary';
  return 'none';
}
