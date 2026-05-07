import { generateText, stepCountIs } from 'ai';
import type { z } from 'zod';
import {
  legacyTutorialStepSchema,
  type ContentPatch,
  type TutorialStep,
} from '../../schemas/tutorial-draft';
import type { TutorialOutline } from '../../schemas/tutorial-outline';
import type { SourceItem } from '../../schemas/source-item';
import type { TeachingBrief } from '../../schemas/teaching-brief';
import {
  buildCurrentSnapshotSummary,
  buildRepairPrompt,
  buildRetrievalStepFillPrompt,
  buildStepFillPrompt,
} from '../step-fill-prompt';
import { adaptPromptForModel } from '../prompt-adapters';
import { applyContentPatches } from '../../tutorial/draft-code';
import { tryAutoFixPatches } from '../patch-auto-fix';
import { findProgressivePlaceholderTargets } from '../progressive-snapshot-base-code';
import { createScopedSourceTools } from '../source-tools';
import { createTokenBudgetSession } from '../token-budget';
import { deriveStepSourceScope } from '../outline-source-scope';
import { getMaxOutputTokens } from '../provider-registry';
import {
  generateStructuredObject,
  type StructuredOutputTelemetry,
} from '../structured-output-adapter';
import { DEFAULT_CHAPTER_ID } from '../../tutorial/chapters';
import type {
  AgentFailureCategory,
  RepairRecord,
  StepOutcome,
  StepValidationResult,
} from './types';
import {
  classifyFailureMessage,
  shouldAbortRun,
  shouldRetryRepair,
} from './recovery-policy';
import { buildDistilledContextPromptSection } from './context-manager';
import type { MultiPhaseLifecycleHooks } from '../multi-phase-generator';
import type { DistilledContext } from '../agent-context';
import type { AgentRunLogger } from '../agent-run-logger';

const STEP_FILL_TOOLS_ENABLED = process.env.VIBEDOCS_STEP_FILL_TOOLS === '1';

type RuntimeModel = Parameters<typeof generateText>[0]['model'];
type GeneratedTutorialStep = z.infer<typeof legacyTutorialStepSchema>;
type StepAttemptMode = 'initial' | 'repair' | 'post_replan';
export type { StepAttemptMode };

function logStructuredOutput(logger: AgentRunLogger | undefined) {
  return (event: StructuredOutputTelemetry) => {
    logger?.logEvent('structured-output', { ...event });
  };
}

export interface StepExecutionTimings {
  promptBuildMs: number;
  llmCallMs: number;
  validationMs: number;
}

export interface StepAttemptParams {
  mode: StepAttemptMode;
  attempt: number;
  stepIndex: number;
  outline: TutorialOutline;
  sourceItems: SourceItem[];
  teachingBrief: TeachingBrief;
  previousFiles: Record<string, string>;
  primaryFile: string;
  model: RuntimeModel;
  modelId?: string;
  modelSupportsRetrieval: boolean;
  useNativeStructuredOutput: boolean;
  lastError?: string | null;
  lastFailedStep?: TutorialStep | null;
  distilledContext?: DistilledContext | null;
  logger?: AgentRunLogger;
}

interface StepAttemptSuccess {
  status: 'pass';
  step: TutorialStep;
  locChange: number;
  timings: StepExecutionTimings;
}

interface StepAttemptFailure {
  status: 'repairable' | 'unrecoverable' | 'error';
  errorMessage: string;
  failedStep: TutorialStep | null;
  category: AgentFailureCategory;
  timings: StepExecutionTimings;
}

type StepAttemptResult = StepAttemptSuccess | StepAttemptFailure;

export interface ExecuteStepParams {
  stepIndex: number;
  totalSteps: number;
  outline: TutorialOutline;
  sourceItems: SourceItem[];
  teachingBrief: TeachingBrief;
  previousFiles: Record<string, string>;
  primaryFile: string;
  model: RuntimeModel;
  modelId?: string;
  modelSupportsRetrieval: boolean;
  useNativeStructuredOutput: boolean;
  distilledContext?: DistilledContext | null;
  totalRetries: number;
  currentTurnCount: number;
  maxTurns: number;
  maxRepairsPerStep: number;
  lifecycleHooks?: Pick<
    MultiPhaseLifecycleHooks,
    'onAction' | 'onStepRetry'
  >;
  emitEvent?: (event: string, data: unknown) => Promise<void> | void;
  logger?: AgentRunLogger;
  generateStepAttempt?: (params: StepAttemptParams) => Promise<StepAttemptResult>;
  initialMode?: Extract<StepAttemptMode, 'initial' | 'post_replan'>;
}

export interface StepExecutionSuccess {
  status: 'committed';
  step: TutorialStep;
  outcome: StepOutcome;
  repairHistory: RepairRecord[];
  retryCount: number;
  lastError: string | null;
  forceReplan: false;
  forceReplanReason: null;
  turnsConsumed: number;
  usedRepairPrompt: boolean;
  timings: StepExecutionTimings;
}

export interface StepExecutionFailure {
  status: 'failed';
  repairHistory: RepairRecord[];
  retryCount: number;
  lastError: string | null;
  forceReplan: boolean;
  forceReplanReason: string | null;
  turnsConsumed: number;
  usedRepairPrompt: boolean;
  timings: StepExecutionTimings;
}

export type StepExecutionResult = StepExecutionSuccess | StepExecutionFailure;

export async function executeStep(
  params: ExecuteStepParams,
): Promise<StepExecutionResult> {
  let retryCount = params.totalRetries;
  let turnsConsumed = 0;
  let usedRepairPrompt = false;
  let lastError: string | null = null;
  let lastFailedStep: TutorialStep | null = null;
  const repairHistory: RepairRecord[] = [];
  const timings: StepExecutionTimings = {
    promptBuildMs: 0,
    llmCallMs: 0,
    validationMs: 0,
  };
  const runStepAttempt = params.generateStepAttempt ?? attemptStep;

  for (let attempt = 0; attempt < params.maxRepairsPerStep; attempt++) {
    const nextTurnCount = params.currentTurnCount + turnsConsumed + 1;
    if (
      shouldAbortRun({
        currentTurnCount: nextTurnCount,
        maxTurns: params.maxTurns,
      })
    ) {
      lastError =
        `Turn budget exhausted before step ${params.stepIndex + 1} attempt ${attempt + 1}` +
        ` (used ${params.currentTurnCount + turnsConsumed}/${params.maxTurns} turns)`;
      console.warn(
        `[agent-loop] ${lastError}. Marking step as failed.`,
      );
      params.logger?.logEvent('step-validation', {
        stepIndex: params.stepIndex,
        attempt,
        result: 'turn-budget-exhausted',
        error: lastError,
      });
      break;
    }

    const mode: StepAttemptMode =
      attempt > 0 && lastFailedStep && lastError
        ? 'repair'
        : params.initialMode ?? 'initial';
    if (mode === 'repair') {
      usedRepairPrompt = true;
    }
    turnsConsumed++;

    const result = await runStepAttempt({
      mode,
      attempt,
      stepIndex: params.stepIndex,
      outline: params.outline,
      sourceItems: params.sourceItems,
      teachingBrief: params.teachingBrief,
      previousFiles: params.previousFiles,
      primaryFile: params.primaryFile,
      model: params.model,
      modelId: params.modelId,
      modelSupportsRetrieval: params.modelSupportsRetrieval,
      useNativeStructuredOutput: params.useNativeStructuredOutput,
      lastError,
      lastFailedStep,
      distilledContext: mode === 'initial' ? params.distilledContext ?? null : null,
      logger: params.logger,
    });

    timings.promptBuildMs += result.timings.promptBuildMs;
    timings.llmCallMs += result.timings.llmCallMs;
    timings.validationMs += result.timings.validationMs;

    if (result.status === 'pass') {
      params.logger?.logEvent('step-validation', {
        stepIndex: params.stepIndex,
        attempt,
        result: 'pass',
        autoFixed: result.step.patches
          ? hasAutoFixedPatches(result.step.patches, params.previousFiles, params.primaryFile)
          : false,
      });

      const outcome: StepOutcome = {
        stepIndex: params.stepIndex,
        result: attempt === 0 ? 'pass' : 'repaired',
        repairCount: attempt,
        patchStrategy: inferPatchStrategy(
          result.step.patches ?? [],
          params.previousFiles,
          params.primaryFile,
        ),
        locChange: result.locChange,
      };

      if (attempt > 0) {
        await params.emitEvent?.('step-repaired', {
          stepIndex: params.stepIndex,
          step: result.step,
        });
      }

      return {
        status: 'committed',
        step: result.step,
        outcome,
        repairHistory,
        retryCount,
        lastError,
        forceReplan: false,
        forceReplanReason: null,
        turnsConsumed,
        usedRepairPrompt,
        timings,
      };
    }

    retryCount++;
    lastError = result.errorMessage;

    if (result.status === 'repairable') {
      lastFailedStep = result.failedStep;
      params.logger?.logEvent('step-validation', {
        stepIndex: params.stepIndex,
        attempt,
        result: 'repairable',
        error: result.errorMessage,
      });

      console.warn(
        `[agent-loop] Step ${params.stepIndex + 1} REPAIRABLE (attempt ${attempt + 1}/${params.maxRepairsPerStep}):`,
        lastError,
      );

      await params.emitEvent?.('repair', {
        stepIndex: params.stepIndex,
        attempt: attempt + 1,
        errorMessage: result.errorMessage,
      });
      await params.lifecycleHooks?.onAction?.({
        action: 'repair',
        stepIndex: params.stepIndex,
        totalSteps: params.totalSteps,
        attempt: attempt + 1,
        retryCount,
        errorMessage: result.errorMessage,
        category: 'repairable',
      });
      await params.lifecycleHooks?.onStepRetry?.({
        stepIndex: params.stepIndex,
        totalSteps: params.totalSteps,
        attempt: attempt + 1,
        retryCount,
        errorMessage: result.errorMessage,
        category: 'repairable',
      });

      repairHistory.push({
        stepIndex: params.stepIndex,
        attempts: attempt + 1,
        strategy: 'full-rewrite',
        outcome: 'degraded',
        errorMessage: result.errorMessage,
      });
      if (
        !shouldRetryRepair({
          attempt,
          maxRepairsPerStep: params.maxRepairsPerStep,
          category: 'repairable',
        })
      ) {
        break;
      }
      continue;
    }

    if (result.status === 'unrecoverable') {
      params.logger?.logEvent('step-validation', {
        stepIndex: params.stepIndex,
        attempt,
        result: 'unrecoverable',
        error: result.errorMessage,
      });

      console.warn(
        `[agent-loop] Step ${params.stepIndex + 1} UNRECOVERABLE:`,
        result.errorMessage,
      );

      await params.emitEvent?.('replan', {
        fromStepIndex: params.stepIndex,
        reason: `unrecoverable: ${result.errorMessage}`,
        revisedStepCount: 0,
      });

      return {
        status: 'failed',
        repairHistory,
        retryCount,
        lastError,
        forceReplan: true,
        forceReplanReason: result.errorMessage,
        turnsConsumed,
        usedRepairPrompt,
        timings,
      };
    }

    console.error(
      `[agent-loop] Step ${params.stepIndex + 1} attempt ${attempt + 1} failed:`,
      result.errorMessage,
    );
    await params.lifecycleHooks?.onStepRetry?.({
      stepIndex: params.stepIndex,
      totalSteps: params.totalSteps,
      attempt: attempt + 1,
      retryCount,
      errorMessage: result.errorMessage,
      category: result.category,
    });
    if (shouldAbortRun({ category: result.category })) {
      return {
        status: 'failed',
        repairHistory,
        retryCount,
        lastError,
        forceReplan: false,
        forceReplanReason: result.errorMessage,
        turnsConsumed,
        usedRepairPrompt,
        timings,
      };
    }
  }

  return {
    status: 'failed',
    repairHistory,
    retryCount,
    lastError,
    forceReplan: false,
    forceReplanReason: null,
    turnsConsumed,
    usedRepairPrompt,
    timings,
  };
}

export async function attemptStep(
  params: StepAttemptParams,
): Promise<StepAttemptResult> {
  const promptStart = Date.now();
  let step: TutorialStep;
  let retrievalStepScope:
    | { targetFiles: string[]; contextFiles: string[] }
    | null = null;

  try {
    if (params.mode === 'repair' && params.lastFailedStep && params.lastError) {
      const { systemPrompt, userPrompt } = buildRepairPrompt(
        params.lastFailedStep,
        params.previousFiles,
        params.lastError,
        params.outline,
        params.stepIndex,
        params.teachingBrief,
        params.sourceItems,
      );

      const llmStart = Date.now();
      const result = await generateStructuredObject<GeneratedTutorialStep>({
        label: `step-${params.stepIndex + 1}-repair-attempt-${params.attempt}`,
        schemaName: 'tutorial_step',
        schema: legacyTutorialStepSchema,
        model: params.model,
        modelId: params.modelId,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: getMaxOutputTokens(params.modelId),
        preferredModes: params.useNativeStructuredOutput
          ? ['native_object', 'forced_output_tool', 'prompted_json']
          : ['forced_output_tool', 'prompted_json'],
        useNativeStructuredOutput: params.useNativeStructuredOutput,
        allowOutputTool: params.modelSupportsRetrieval,
        onTelemetry: logStructuredOutput(params.logger),
      });
      const llmCallMs = Date.now() - llmStart;

      step = {
        ...result.output,
        chapterId:
          params.outline.steps[params.stepIndex]?.chapterId ?? DEFAULT_CHAPTER_ID,
      };

      return validateGeneratedStep({
        step,
        previousFiles: params.previousFiles,
        primaryFile: params.primaryFile,
        retrievalStepScope: null,
        timings: {
          promptBuildMs: Date.now() - promptStart - llmCallMs,
          llmCallMs,
          validationMs: 0,
        },
      });
    }

    if (params.modelSupportsRetrieval) {
      const stepScope = deriveStepSourceScope(
        params.outline.steps[params.stepIndex],
        params.previousFiles,
      );
      retrievalStepScope = stepScope;
      const budget = STEP_FILL_TOOLS_ENABLED
        ? createTokenBudgetSession({
            modelId: params.modelId ?? 'deepseek/deepseek-chat',
            basePrompt: '',
          })
        : null;
      const scopedTools = budget
        ? createScopedSourceTools(params.sourceItems, params.previousFiles, { budget })
        : undefined;
      const snapshotSummary = buildCurrentSnapshotSummary(params.previousFiles);
      let { systemPrompt, userPrompt } = buildRetrievalStepFillPrompt(
        params.sourceItems,
        params.teachingBrief,
        params.outline,
        params.stepIndex,
        params.previousFiles,
        stepScope,
        snapshotSummary,
        params.lastError ?? undefined,
        { toolsEnabled: STEP_FILL_TOOLS_ENABLED },
      );
      userPrompt += buildDistilledContextPromptSection(params.distilledContext ?? null);

      const llmStart = Date.now();
      const generateOptions: Parameters<typeof generateText>[0] = {
        model: params.model,
        system: adaptPromptForModel(systemPrompt, params.modelId),
        prompt: adaptPromptForModel(userPrompt, params.modelId),
        maxOutputTokens: getMaxOutputTokens(params.modelId),
      };
      if (scopedTools) {
        generateOptions.tools = scopedTools;
        generateOptions.stopWhen = stepCountIs(6);
      }
      let structuredResult;
      if (scopedTools) {
        const result = await generateText(generateOptions);
        structuredResult = await generateStructuredObject<GeneratedTutorialStep>({
          label:
            params.mode === 'post_replan'
              ? `step-${params.stepIndex + 1}-post-replan`
              : `step-${params.stepIndex + 1}-retrieval`,
          schemaName: 'tutorial_step',
          schema: legacyTutorialStepSchema,
          model: params.model,
          modelId: params.modelId,
          system: systemPrompt,
          prompt: userPrompt,
          responseMessages: result.response.messages,
          maxOutputTokens: getMaxOutputTokens(params.modelId),
          preferredModes: ['forced_output_tool', 'prompted_json'],
          allowOutputTool: params.modelSupportsRetrieval,
          onTelemetry: logStructuredOutput(params.logger),
        });
      } else {
        structuredResult = await generateStructuredObject<GeneratedTutorialStep>({
          label:
            params.mode === 'post_replan'
              ? `step-${params.stepIndex + 1}-post-replan`
              : `step-${params.stepIndex + 1}-retrieval`,
          schemaName: 'tutorial_step',
          schema: legacyTutorialStepSchema,
          model: params.model,
          modelId: params.modelId,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: getMaxOutputTokens(params.modelId),
          preferredModes: ['forced_output_tool', 'prompted_json'],
          allowOutputTool: params.modelSupportsRetrieval,
          onTelemetry: logStructuredOutput(params.logger),
        });
      }
      const llmCallMs = Date.now() - llmStart;

      step = {
        ...structuredResult.output,
        chapterId:
          params.outline.steps[params.stepIndex]?.chapterId ?? DEFAULT_CHAPTER_ID,
      };

      return validateGeneratedStep({
        step,
        previousFiles: params.previousFiles,
        primaryFile: params.primaryFile,
        retrievalStepScope,
        timings: {
          promptBuildMs: Date.now() - promptStart - llmCallMs,
          llmCallMs,
          validationMs: 0,
        },
      });
    }

    let { systemPrompt, userPrompt } = buildStepFillPrompt(
      params.sourceItems,
      params.teachingBrief,
      params.outline,
      params.stepIndex,
      params.previousFiles,
      params.lastError ?? undefined,
    );
    userPrompt += buildDistilledContextPromptSection(params.distilledContext ?? null);

    const llmStart = Date.now();
    const result = await generateStructuredObject<GeneratedTutorialStep>({
      label:
        params.mode === 'post_replan'
          ? `step-${params.stepIndex + 1}-post-replan`
          : `step-${params.stepIndex + 1}-legacy`,
      schemaName: 'tutorial_step',
      schema: legacyTutorialStepSchema,
      model: params.model,
      modelId: params.modelId,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: getMaxOutputTokens(params.modelId),
      useNativeStructuredOutput: params.useNativeStructuredOutput,
      preferredModes: params.useNativeStructuredOutput
        ? ['native_object', 'forced_output_tool', 'prompted_json']
        : ['forced_output_tool', 'prompted_json'],
      allowOutputTool: params.modelSupportsRetrieval,
      onTelemetry: logStructuredOutput(params.logger),
    });
    const llmCallMs = Date.now() - llmStart;

    step = {
      ...result.output,
      chapterId:
        params.outline.steps[params.stepIndex]?.chapterId ?? DEFAULT_CHAPTER_ID,
    };

    return validateGeneratedStep({
      step,
      previousFiles: params.previousFiles,
      primaryFile: params.primaryFile,
      retrievalStepScope: null,
      timings: {
        promptBuildMs: Date.now() - promptStart - llmCallMs,
        llmCallMs,
        validationMs: 0,
      },
    });
  } catch (error: any) {
    return {
      status: 'error',
      errorMessage: error?.message || String(error),
      failedStep: null,
      category: classifyFailureMessage(error?.message || String(error)),
      timings: {
        promptBuildMs: Date.now() - promptStart,
        llmCallMs: 0,
        validationMs: 0,
      },
    };
  }
}

export function calculatePatchLocChange(patches: ContentPatch[]) {
  return patches.reduce((sum, patch) => {
    return sum + Math.abs(patch.replace.split('\n').length - patch.find.split('\n').length);
  }, 0);
}

export function validateStepPatches(
  previousFiles: Record<string, string>,
  patches: ContentPatch[],
  primaryFile: string,
): StepValidationResult {
  try {
    const newFiles = applyContentPatches(previousFiles, patches, primaryFile);
    return {
      result: 'pass',
      errors: [],
      actualCode: previousFiles,
      appliedFiles: newFiles,
    };
  } catch (patchError: any) {
    const errorMessage =
      patchError instanceof Error ? patchError.message : String(patchError);

    const fixResult = tryAutoFixPatches(previousFiles, patches, primaryFile);
    if (fixResult.success) {
      try {
        const newFiles = applyContentPatches(
          previousFiles,
          fixResult.fixedPatches,
          primaryFile,
        );
        return {
          result: 'pass',
          errors: [],
          actualCode: previousFiles,
          appliedFiles: newFiles,
          fixedPatches: fixResult.fixedPatches,
        };
      } catch {
        // Fall through to the repairable branch below.
      }
    }

    const isUnrecoverable =
      classifyFailureMessage(errorMessage) === 'unrecoverable';
    return {
      result: isUnrecoverable ? 'unrecoverable' : 'repairable',
      errors: [errorMessage],
      actualCode: previousFiles,
    };
  }
}

function validateGeneratedStep(params: {
  step: TutorialStep;
  previousFiles: Record<string, string>;
  primaryFile: string;
  retrievalStepScope: { targetFiles: string[]; contextFiles: string[] } | null;
  timings: StepExecutionTimings;
}): StepAttemptResult {
  const validationStart = Date.now();
  try {
    if (params.retrievalStepScope) {
      validateRetrievalStepTargets(
        params.step,
        params.primaryFile,
        params.retrievalStepScope,
        params.previousFiles,
      );
    }

    if (params.step.patches?.length) {
      const validation = validateStepPatches(
        params.previousFiles,
        params.step.patches,
        params.primaryFile,
      );
      if (validation.result === 'pass') {
        if (validation.fixedPatches) {
          params.step.patches = validation.fixedPatches;
          console.log(
            `[agent-loop] Auto-fix applied for step ${params.step.id ?? '(generated)'}`
          );
        }

        return {
          status: 'pass',
          step: params.step,
          locChange: calculatePatchLocChange(params.step.patches),
          timings: {
            ...params.timings,
            validationMs: Date.now() - validationStart,
          },
        };
      }

      return {
        status: validation.result,
        errorMessage: validation.errors.join('\n'),
        failedStep: params.step,
        category: classifyFailureMessage(validation.errors[0]),
        timings: {
          ...params.timings,
          validationMs: Date.now() - validationStart,
        },
      };
    }

    return {
      status: 'pass',
      step: params.step,
      locChange: 0,
      timings: {
        ...params.timings,
        validationMs: Date.now() - validationStart,
      },
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    return {
      status: 'error',
      errorMessage,
      failedStep: params.step,
      category: classifyFailureMessage(errorMessage),
      timings: {
        ...params.timings,
        validationMs: Date.now() - validationStart,
      },
    };
  }
}

function inferPatchStrategy(
  patches: ContentPatch[],
  previousFiles: Record<string, string>,
  primaryFile: string,
): StepOutcome['patchStrategy'] {
  const validation = validateStepPatches(previousFiles, patches, primaryFile);
  if (validation.result === 'pass' && validation.fixedPatches) {
    return 'auto-fixed';
  }
  return 'exact';
}

function hasAutoFixedPatches(
  patches: ContentPatch[],
  previousFiles: Record<string, string>,
  primaryFile: string,
) {
  const validation = validateStepPatches(previousFiles, patches, primaryFile);
  return Boolean(validation.fixedPatches);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function getStepPatchFiles(step: TutorialStep, primaryFile: string) {
  return unique(
    (step.patches ?? [])
      .map((patch) => patch.file ?? primaryFile)
      .filter((value): value is string => Boolean(value)),
  );
}

function validateRetrievalStepTargets(
  step: TutorialStep,
  primaryFile: string,
  stepScope: { targetFiles: string[]; contextFiles: string[] },
  previousFiles: Record<string, string>,
) {
  if (stepScope.targetFiles.length === 0) return;

  const patchFiles = getStepPatchFiles(step, primaryFile);
  if (patchFiles.length === 0) {
    throw new Error(
      `Step must include at least one patch for targetFiles: ${stepScope.targetFiles.join(', ')}`,
    );
  }

  if (!patchFiles.some((file) => stepScope.targetFiles.includes(file))) {
    throw new Error(
      `Step patches must target one of the outline targetFiles: ${stepScope.targetFiles.join(', ')}`,
    );
  }

  const placeholderTargets = findProgressivePlaceholderTargets(
    previousFiles,
    stepScope.targetFiles,
  );
  if (
    placeholderTargets.length > 0 &&
    !patchFiles.some((file) => placeholderTargets.includes(file))
  ) {
    throw new Error(
      `Step must replace the placeholder target file instead of editing an earlier file: ${placeholderTargets.join(', ')}`,
    );
  }
}
