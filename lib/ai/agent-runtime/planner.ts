import { generateText, stepCountIs } from 'ai';
import { tutorialOutlineSchema } from '../../schemas/tutorial-outline';
import type { TutorialOutline } from '../../schemas/tutorial-outline';
import type { SourceItem } from '../../schemas/source-item';
import type { TeachingBrief } from '../../schemas/teaching-brief';
import {
  buildOutlinePrompt,
  buildRetrievalOutlinePrompt,
  buildReviseOutlinePrompt,
} from '../outline-prompt';
import { adaptPromptForModel } from '../prompt-adapters';
import { normalizeTutorialMeta } from '../../tutorial/normalize';
import { getMaxOutputTokens } from '../provider-registry';
import {
  generateStructuredObject,
  type StructuredOutputTelemetry,
} from '../structured-output-adapter';
import { createSourceTools, buildDirectorySummary } from '../source-tools';
import {
  createTokenBudgetSession,
  estimateTokens,
  getMaxInputTokens,
} from '../token-budget';
import { validateOutlineSourceScope } from '../outline-source-scope';
import type { AgentRunLogger } from '../agent-run-logger';

const OUTLINE_MAX_RETRIES = 3;
const revisedOutlineTailSchema = tutorialOutlineSchema.pick({ steps: true });

type RuntimeModel = Parameters<typeof generateText>[0]['model'];

function logStructuredOutput(logger: AgentRunLogger | undefined) {
  return (event: StructuredOutputTelemetry) => {
    logger?.logEvent('structured-output', { ...event });
  };
}

export interface PlannerTiming {
  totalMs: number;
  promptBuildMs: number;
  llmCallMs: number;
  validationMs: number;
}

export interface ResolveInitialOutlineParams {
  model: RuntimeModel;
  modelId?: string;
  sourceItems: SourceItem[];
  teachingBrief: TeachingBrief;
  modelSupportsRetrieval: boolean;
  useNativeStructuredOutput: boolean;
  resumeOutline?: TutorialOutline | null;
  initialOutline?: TutorialOutline | null;
  logger?: AgentRunLogger;
}

export interface ResolveInitialOutlineResult {
  outline: TutorialOutline;
  source: 'resume' | 'initial' | 'generated';
  timing: PlannerTiming;
}

export async function resolveInitialOutline(
  params: ResolveInitialOutlineParams,
): Promise<ResolveInitialOutlineResult> {
  const startMs = Date.now();
  let promptBuildMs = 0;
  let llmCallMs = 0;
  let validationMs = 0;
  let source: ResolveInitialOutlineResult['source'] = 'generated';
  let outline = params.resumeOutline ?? params.initialOutline ?? null;

  if (params.resumeOutline) {
    source = 'resume';
  } else if (params.initialOutline) {
    source = 'initial';
  } else if (params.modelSupportsRetrieval) {
    const promptStart = Date.now();
    const directorySummary = buildDirectorySummary(params.sourceItems);
    const budget = createTokenBudgetSession({
      modelId: params.modelId ?? 'deepseek/deepseek-chat',
      basePrompt: directorySummary,
    });
    const sourceTools = createSourceTools(params.sourceItems, { budget });
    const { systemPrompt, userPrompt } = buildRetrievalOutlinePrompt(
      params.sourceItems,
      params.teachingBrief,
      directorySummary,
    );
    const adaptedSystemPrompt = adaptPromptForModel(systemPrompt, params.modelId);
    const adaptedUserPrompt = adaptPromptForModel(userPrompt, params.modelId);
    promptBuildMs = Date.now() - promptStart;

    console.log('[agent-loop] Retrieval outline prompt sizes:', {
      systemPromptChars: systemPrompt.length,
      userPromptChars: userPrompt.length,
      systemPromptTokens: estimateTokens(systemPrompt),
      userPromptTokens: estimateTokens(userPrompt),
      budgetUsed: budget.usedInputTokens,
      budgetRemaining: budget.remainingInputTokens,
      budgetMax: budget.maxInputTokens,
      promptBuildMs,
    });

    let lastOutlineError: unknown = null;
    for (let attempt = 0; attempt < OUTLINE_MAX_RETRIES; attempt++) {
      try {
        console.log(
          `[agent-loop] Retrieval outline attempt ${attempt + 1}/${OUTLINE_MAX_RETRIES}`,
        );
        const generateStart = Date.now();
        const result = await generateText({
          model: params.model,
          system: adaptedSystemPrompt,
          prompt: adaptedUserPrompt,
          tools: sourceTools,
          stopWhen: stepCountIs(20),
          maxOutputTokens: getMaxOutputTokens(params.modelId),
        });
        const llmMs = Date.now() - generateStart;
        llmCallMs += llmMs;
        console.log(
          '[agent-loop] generateText completed in',
          llmMs,
          'ms, response length:',
          result.text?.length ?? 0,
        );

        const finalizeStart = Date.now();
        const finalized = await generateStructuredObject<TutorialOutline>({
          label: 'outline-retrieval',
          schemaName: 'tutorial_outline',
          schema: tutorialOutlineSchema,
          model: params.model,
          modelId: params.modelId,
          system: systemPrompt,
          prompt: userPrompt,
          responseMessages: result.response.messages,
          preferredModes: ['forced_output_tool', 'prompted_json'],
          allowOutputTool: params.modelSupportsRetrieval,
          maxOutputTokens: getMaxOutputTokens(params.modelId),
          onTelemetry: logStructuredOutput(params.logger),
        });
        outline = finalized.output;
        llmCallMs += Date.now() - finalizeStart;
        lastOutlineError = null;
        break;
      } catch (err: any) {
        lastOutlineError = err;
        const isConnectionError =
          err?.message?.includes('terminated') ||
          err?.message?.includes('other side closed') ||
          err?.cause?.message?.includes('terminated');
        if (isConnectionError && attempt < OUTLINE_MAX_RETRIES - 1) {
          console.warn(
            `[agent-loop] Outline attempt ${attempt + 1} failed with connection error, retrying...`,
            err.message,
          );
          continue;
        }
        throw err;
      }
    }

    if (lastOutlineError) {
      throw lastOutlineError;
    }
  } else {
    const promptStart = Date.now();
    const { systemPrompt, userPrompt } = buildOutlinePrompt(
      params.sourceItems,
      params.teachingBrief,
    );
    promptBuildMs = Date.now() - promptStart;

    console.log('[agent-loop] Legacy outline prompt sizes:', {
      systemPromptChars: systemPrompt.length,
      userPromptChars: userPrompt.length,
      systemPromptTokens: estimateTokens(systemPrompt),
      userPromptTokens: estimateTokens(userPrompt),
      promptBuildMs,
    });

    const generateStart = Date.now();
    const generated = await generateStructuredObject<TutorialOutline>({
      label: 'outline-legacy',
      schemaName: 'tutorial_outline',
      schema: tutorialOutlineSchema,
      model: params.model,
      modelId: params.modelId,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: getMaxOutputTokens(params.modelId),
      useNativeStructuredOutput: params.useNativeStructuredOutput,
      preferredModes: params.useNativeStructuredOutput
        ? ['native_object', 'forced_output_tool', 'prompted_json']
        : ['forced_output_tool', 'prompted_json'],
      onTelemetry: logStructuredOutput(params.logger),
    });
    llmCallMs = Date.now() - generateStart;
    console.log(
      '[agent-loop] generateText completed in',
      llmCallMs,
      'ms, response length:',
      generated.rawText?.length ?? 0,
    );
    outline = generated.output;
  }

  if (!outline) {
    throw new Error('Outline not generated');
  }

  outline.meta = normalizeTutorialMeta(outline.meta, outline.baseCode);

  const validationStart = Date.now();
  if (params.modelSupportsRetrieval) {
    const scopeValidation = validateOutlineSourceScope(
      outline,
      params.sourceItems,
      getPrimaryFileForOutline(outline, params.sourceItems),
    );
    if (scopeValidation.shouldRetry) {
      console.warn(
        '[agent-loop] Outline scope validation: too many repairs, quality may be degraded',
        scopeValidation.errors,
      );
    }
    outline = scopeValidation.outline;
  }
  validationMs = Date.now() - validationStart;

  return {
    outline,
    source,
    timing: {
      totalMs: Date.now() - startMs,
      promptBuildMs,
      llmCallMs,
      validationMs,
    },
  };
}

export interface ReviseOutlineTailParams {
  model: RuntimeModel;
  modelId?: string;
  outline: TutorialOutline;
  fromStepIndex: number;
  completedStepsSummary: string;
  previousFiles: Record<string, string>;
  teachingBrief: TeachingBrief;
  sourceItems: SourceItem[];
  failureReason: string;
  logger?: AgentRunLogger;
}

export async function reviseOutlineTail(
  params: ReviseOutlineTailParams,
): Promise<TutorialOutline | null> {
  try {
    const { systemPrompt, userPrompt } = buildReviseOutlinePrompt(
      params.outline,
      params.fromStepIndex,
      params.completedStepsSummary,
      params.previousFiles,
      params.teachingBrief,
      params.sourceItems,
      params.failureReason,
    );

    const result = await generateStructuredObject<{ steps: TutorialOutline['steps'] }>({
      label: 'revise-outline-tail',
      schemaName: 'revised_outline_tail',
      schema: revisedOutlineTailSchema,
      model: params.model,
      modelId: params.modelId,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: getMaxOutputTokens(params.modelId),
      preferredModes: ['forced_output_tool', 'prompted_json'],
      onTelemetry: logStructuredOutput(params.logger),
    });

    if (!result.output.steps?.length) {
      console.error('[agent-loop] reviseOutline: failed to parse revised steps');
      return null;
    }

    return {
      ...params.outline,
      steps: mergeRemainingSteps(
        params.outline.steps,
        params.fromStepIndex,
        result.output.steps,
      ),
    };
  } catch (err) {
    console.error('[agent-loop] reviseOutline failed:', err);
    return null;
  }
}

export interface ReplanRemainingOutlineParams {
  model: RuntimeModel;
  modelId?: string;
  outline: TutorialOutline;
  currentStepIndex: number;
  completedStepsSummary: string;
  currentCode: Record<string, string>;
  teachingBrief: TeachingBrief;
  sourceItems: SourceItem[];
  logger?: AgentRunLogger;
}

export async function replanRemainingOutline(
  params: ReplanRemainingOutlineParams,
): Promise<TutorialOutline> {
  const codeSignatures = Object.entries(params.currentCode)
    .map(([file, code]) => `${file} (${code.split('\n').length} lines)`)
    .join(', ');
  const completedSteps = params.outline.steps.slice(0, params.currentStepIndex);
  const originalRemaining = params.outline.steps.slice(params.currentStepIndex);

  const systemPrompt = `You are replanning the remaining steps of a tutorial.
The tutorial has already completed ${params.currentStepIndex} steps. You must design the remaining steps.

Output a JSON object with the SAME structure as the original outline, but with:
- steps: only the REMAINING steps (starting from step ${params.currentStepIndex + 1})
- Keep the same meta, intro, and baseCode
- Steps must continue from where the completed steps left off
- Each step: { id, title, teachingGoal, conceptIntroduced, estimatedLocChange }`;

  const userPrompt = `## Completed steps
${params.completedStepsSummary}

## Current code state
Files: ${codeSignatures}

## Original remaining steps (for reference)
${originalRemaining
  .map(
    (step, index) =>
      `${params.currentStepIndex + index + 1}. ${step.title} — ${step.teachingGoal}`,
  )
  .join('\n')}

## Tutorial context
- Topic: ${params.teachingBrief.topic}
- Audience: ${params.teachingBrief.audience_level}
- Core question: ${params.teachingBrief.core_question}
- Language: ${params.teachingBrief.output_language}

Please redesign the remaining ${originalRemaining.length} steps, keeping the teaching goals but adjusting based on what has actually been completed.`;

  const result = await generateStructuredObject<TutorialOutline>({
    label: 'full-replan',
    schemaName: 'tutorial_outline',
    schema: tutorialOutlineSchema,
    model: params.model,
    modelId: params.modelId,
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: getMaxOutputTokens(params.modelId),
    preferredModes: ['forced_output_tool', 'prompted_json'],
    onTelemetry: logStructuredOutput(params.logger),
  });

  return {
    ...params.outline,
    steps: mergeRemainingSteps(
      completedSteps,
      completedSteps.length,
      result.output.steps ?? originalRemaining,
    ),
  };
}

export function shouldUseRetrievalOutline(params: {
  sourceItems: SourceItem[];
  modelId?: string;
}) {
  const totalSourceTokens = estimateTokens(
    params.sourceItems.map((item) => item.content).join('\n'),
  );
  const isLargeRepo =
    params.sourceItems.length > 30 ||
    totalSourceTokens > getMaxInputTokens(params.modelId ?? '') * 0.6;

  return {
    isLargeRepo,
    totalSourceTokens,
  };
}

export function mergeRemainingSteps<T>(
  steps: T[],
  fromStepIndex: number,
  replacementSteps: T[],
) {
  return [...steps.slice(0, fromStepIndex), ...replacementSteps];
}

function getPrimaryFileForOutline(
  outline: TutorialOutline,
  sourceItems: SourceItem[],
) {
  const baseCode =
    typeof outline.baseCode === 'string'
      ? { [outline.meta.fileName ?? sourceItems[0]?.label ?? 'main.ts']: outline.baseCode }
      : outline.baseCode;
  return Object.keys(baseCode)[0] ?? sourceItems[0]?.label ?? '';
}
