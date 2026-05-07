import {
  createMultiPhaseGenerationStream,
  GenerationCancelledError,
  MultiPhaseGenerationError,
  type MultiPhaseResult,
  type CancelToken,
  type MultiPhaseLifecycleHooks,
} from "../ai/multi-phase-generator";
import {
  createAgentGenerationStream,
} from "../ai/agent-generator";
import {
  computeSnapshotHash,
  createEmptyAgentState,
  deriveAgentResumeState,
  validateAgentResumeCheckpoint,
  withAgentAction,
  withCommittedCheckpoint,
  withFailureState,
} from "../ai/agent-runtime/checkpoint-adapter";
import { classifyFailureMessage } from "../ai/agent-runtime/recovery-policy";
import { materializeBaseCodeForFilledSteps } from "../ai/progressive-snapshot-base-code";
import { RetrievalModelRequiredError } from "../ai/model-capabilities";
import { PatchValidationError } from "../errors/error-types";
import {
  TutorialDraftValidationError,
  type ValidationProvenance,
  validateTutorialDraft,
} from "../utils/validation";
import { computeGenerationQuality } from "./compute-generation-quality";
import { db } from "../db";
import * as draftRepo from "../repositories/draft-repository";
import * as generationJobRepo from "../repositories/draft-generation-job-repository";
import type {
  GenerationJobErrorCode,
  GenerationJobFailureDetail,
  GenerationJobPhase,
} from "../schemas/generation-job";
import type { DraftGenerationJob } from "../types/generation-job";
import {
  getJobCurrentAction,
  isTerminalDraftGenerationJobStatus,
} from "../types/generation-job";
import { ensureDraftChapters } from "../tutorial/chapters";
import { ensureOutlineChapters } from "../tutorial/outline-chapters";
import { normalizeBaseCode } from "../tutorial/normalize";
import { getFilesAfterStep } from "../tutorial/draft-code";
import type { TutorialOutline } from "../schemas/tutorial-outline";
import type { SourceItem } from "../schemas/source-item";
import type { DraftGenerationMode } from "../types/generation-mode";
import type {
  AgentResumeState,
  AgentStateSnapshot,
} from "../ai/agent-runtime/types";

/**
 * In-memory registry of active generations.
 * Key: draftId, Value: cancelToken that the generation loop checks between steps.
 *
 * Allows explicit cancellation via API without coupling to the SSE stream lifecycle.
 * Entries are cleaned up when generation completes (success, failure, or cancel).
 * This map is only a request-local optimization; persisted generation jobs are
 * the source of truth for status, phase, heartbeat, and terminal state.
 */
const activeGenerations = new Map<
  string,
  { jobId: string; token: CancelToken }
>();

// Complex retrieval-based generations can spend well over 5 minutes in the
// initial outline pass on slower providers (notably MiniMax) before the next
// lifecycle heartbeat is emitted. Keep the lease comfortably above that window
// so healthy runs are not recovered as stale mid-flight.
const GENERATION_JOB_LEASE_MS = 15 * 60 * 1000;
const GENERATION_HEARTBEAT_INTERVAL_MS = 30 * 1000;

async function recoverStaleGenerationJobsFor(context: string) {
  const recoveredCount = await generationJobRepo.recoverStaleGenerationJobs();
  if (recoveredCount > 0) {
    console.log(`[generate-v2] Recovered ${recoveredCount} stale generation job(s) before ${context}`);
  }
}

/**
 * Request cancellation of an in-progress generation.
 *
 * Writes the cancel signal to both:
 * 1. In-memory cancelToken (fast path — immediate detection on same instance)
 * 2. DB cancelRequested flag (reliable path — works across instances / restarts)
 *
 * Returns true if any signal was written (in-memory or DB).
 */
export async function requestGenerationCancel(draftId: string): Promise<boolean> {
  // Fast path: signal in-memory token on this instance
  const activeGeneration = activeGenerations.get(draftId);
  if (activeGeneration) {
    activeGeneration.token.value = true;
  }

  // Reliable path: also write cancelRequested to DB via the active job
  let dbSignalled = false;
  const latestJob = await generationJobRepo.getLatestDraftGenerationJobByDraftId(draftId);
  if (latestJob && !isTerminalDraftGenerationJobStatus(latestJob.status)) {
    dbSignalled = await generationJobRepo.signalCancelDraftGenerationJob(latestJob.id);
  }

  return !!(activeGeneration || dbSignalled);
}

export async function requestGenerationCancelForUser(
  draftId: string,
  userId: string,
): Promise<boolean | null> {
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft) return null;
  return requestGenerationCancel(draftId);
}

function getLeaseUntil(now = new Date()): Date {
  return new Date(now.getTime() + GENERATION_JOB_LEASE_MS);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function unwrapGenerationError(error: unknown): unknown {
  if (error instanceof MultiPhaseGenerationError) {
    return error.cause;
  }
  return error;
}

function isCancelledGenerationError(error: unknown): boolean {
  if (error instanceof GenerationCancelledError) return true;
  if (error instanceof MultiPhaseGenerationError) {
    return isCancelledGenerationError(error.cause);
  }
  return getErrorMessage(error).toLowerCase() === "cancelled";
}

function getErrorPhase(error: unknown): GenerationJobPhase | null {
  if (error instanceof MultiPhaseGenerationError) return error.phase;
  return null;
}

function getErrorStepIndex(error: unknown): number | null {
  if (error instanceof MultiPhaseGenerationError) return error.stepIndex;
  return null;
}

function getFirstValidationStepIndex(
  provenance: unknown,
): number | null {
  if (!Array.isArray(provenance)) return null;
  const match = provenance.find(
    (
      item,
    ): item is ValidationProvenance =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as { stepIndex?: unknown }).stepIndex === "number" &&
      ((item as { stepIndex: number }).stepIndex >= 0),
  );
  return match?.stepIndex ?? null;
}

function getFailureDetail(error: unknown): GenerationJobFailureDetail {
  const unwrapped = unwrapGenerationError(error);
  const detail: GenerationJobFailureDetail = {
    name: unwrapped instanceof Error ? unwrapped.name : typeof unwrapped,
  };

  if (error instanceof MultiPhaseGenerationError) {
    detail.phase = error.phase;
    if (error.stepIndex !== null) detail.stepIndex = error.stepIndex;
  }

  if (unwrapped instanceof RetrievalModelRequiredError) {
    detail.modelId = unwrapped.modelId;
    detail.fileCount = unwrapped.fileCount;
    detail.estimatedTokens = unwrapped.estimatedTokens;
  }

  if (unwrapped instanceof TutorialDraftValidationError) {
    detail.validationErrors = unwrapped.validation.errors;
    detail.validationProvenance = unwrapped.validation.provenance;
  }

  return detail;
}

export function getGenerationJobFailureUpdate(error: unknown): {
  status: "failed" | "cancelled";
  errorCode: GenerationJobErrorCode;
  errorMessage: string;
  failureDetail: GenerationJobFailureDetail;
  phase: GenerationJobPhase | null;
  currentStepIndex: number | null;
} {
  const failureDetail = getFailureDetail(error);
  const currentStepIndex =
    getErrorStepIndex(error) ?? getFirstValidationStepIndex(failureDetail.validationProvenance);

  if (isCancelledGenerationError(error)) {
    return {
      status: "cancelled",
      errorCode: "JOB_CANCELLED",
      errorMessage: "生成已取消",
      failureDetail,
      phase: getErrorPhase(error),
      currentStepIndex,
    };
  }

  const unwrapped = unwrapGenerationError(error);
  const phase = getErrorPhase(error);
  const errorCode: GenerationJobErrorCode =
    unwrapped instanceof RetrievalModelRequiredError
      ? "MODEL_CAPABILITY_MISMATCH"
      : unwrapped instanceof TutorialDraftValidationError
        ? "DRAFT_VALIDATION_FAILED"
      : unwrapped instanceof PatchValidationError
        ? "PATCH_VALIDATION_FAILED"
        : phase === "outline"
          ? "OUTLINE_GENERATION_FAILED"
          : phase === "validate"
            ? "DRAFT_VALIDATION_FAILED"
            : phase === "step_fill"
              ? "STEP_GENERATION_FAILED"
              : "PERSIST_FAILED";

  return {
    status: "failed",
    errorCode,
    errorMessage: getErrorMessage(unwrapped),
    failureDetail,
    phase,
    currentStepIndex,
  };
}

function phaseToAction(phase: GenerationJobPhase | null | undefined) {
  if (phase === "outline") return "planning" as const;
  if (phase === "step_fill") return "step_fill" as const;
  if (phase === "validate") return "validate" as const;
  return "planning" as const;
}

function createJobLifecycleHooks(
  jobId: string,
  draftId: string,
  sourceItems: SourceItem[],
  initialAgentState: AgentStateSnapshot | null = null,
): MultiPhaseLifecycleHooks {
  async function touchJob(data: Parameters<typeof generationJobRepo.updateDraftGenerationJob>[1]) {
    const now = new Date();
    await generationJobRepo.updateDraftGenerationJob(jobId, {
      status: "running",
      heartbeatAt: now,
      leaseUntil: getLeaseUntil(now),
      ...data,
    });
  }

  let cachedOutline: TutorialOutline | null = null;
  let agentState = initialAgentState;

  return {
    onPhase: async (event) => {
      agentState = withAgentAction(agentState, phaseToAction(event.phase), {
        retryCount: event.retryCount ?? agentState?.retryCount ?? 0,
      });
      await touchJob({
        phase: event.phase,
        currentStepIndex: event.stepIndex ?? null,
        totalSteps: event.totalSteps ?? undefined,
        retryCount: event.retryCount,
        agentState,
      });
    },
    onAction: async (event) => {
      const nextReplanCount =
        event.action === "replan"
          ? (agentState?.replanCount ?? 0) + 1
          : agentState?.replanCount;
      const nextCompressionCount =
        event.action === "compress"
          ? (agentState?.compressionCount ?? 0) + 1
          : agentState?.compressionCount;
      const nextFailureCategory =
        event.category ?? classifyFailureMessage(event.errorMessage);

      agentState = event.errorMessage
        ? withFailureState({
            state: agentState,
            action: event.action,
            stepIndex: event.stepIndex ?? null,
            category: nextFailureCategory,
            message: event.errorMessage,
            retryCount: event.retryCount,
            currentAttempt: event.attempt ?? agentState?.currentAttempt ?? 0,
            consecutiveRepairFailures:
              agentState?.driftSignals.consecutiveRepairFailures,
          })
        : withAgentAction(agentState, event.action, {
            retryCount: event.retryCount ?? agentState?.retryCount ?? 0,
            currentAttempt: event.attempt ?? agentState?.currentAttempt ?? 0,
            replanCount: nextReplanCount,
            compressionCount: nextCompressionCount,
          });

      await touchJob({
        phase: "step_fill",
        currentStepIndex: event.stepIndex ?? null,
        totalSteps: event.totalSteps ?? undefined,
        retryCount: event.retryCount,
        agentState,
      });
    },
    onOutlineReady: async (outline) => {
      cachedOutline = outline;
      const stepTitles = outline.steps.map((step) => step.title);
      if ((agentState?.checkpointIndex ?? -1) < 0) {
        const { files } = normalizeBaseCode(outline.baseCode, outline.meta);
        agentState = withCommittedCheckpoint({
          state: agentState,
          checkpointIndex: -1,
          currentAction: "planning",
          snapshotHash: computeSnapshotHash(files),
        });
      }
      await touchJob({
        outlineSnapshot: outline,
        totalSteps: outline.steps.length,
        stepTitlesSnapshot: stepTitles,
        agentState,
      });
    },
    onStepRetry: async (event) => {
      agentState = withFailureState({
        state: agentState,
        action: "repair",
        stepIndex: event.stepIndex,
        category: event.category ?? classifyFailureMessage(event.errorMessage),
        message: event.errorMessage,
        retryCount: event.retryCount,
        currentAttempt: event.attempt,
        consecutiveRepairFailures:
          (agentState?.driftSignals.consecutiveRepairFailures ?? 0) + 1,
      });
      await touchJob({
        phase: "step_fill",
        currentStepIndex: event.stepIndex,
        totalSteps: event.totalSteps,
        retryCount: event.retryCount,
        failureDetail: {
          lastRetryStepIndex: event.stepIndex,
          lastRetryAttempt: event.attempt,
          lastRetryError: event.errorMessage,
        },
        agentState,
      });
    },
    onStepCompleted: async (event) => {
      const nextConsecutiveDegradedSteps =
        event.result === "replanned"
          ? (agentState?.driftSignals.consecutiveDegradedSteps ?? 0) + 1
          : 0;
      agentState = withAgentAction(agentState, "step_fill", {
        retryCount: event.retryCount,
        currentAttempt: 0,
        driftSignals: {
          consecutiveRepairFailures: 0,
          consecutiveDegradedSteps: nextConsecutiveDegradedSteps,
        },
        lastFailure: null,
      });
      await touchJob({
        phase: "step_fill",
        currentStepIndex: event.stepIndex,
        totalSteps: event.totalSteps,
        retryCount: event.retryCount,
        agentState,
      });
    },
    onStepFilled: async (_stepIndex, _step, filledSteps) => {
      if (!cachedOutline) return;
      const _partialStart = Date.now();
      try {
        const partialDraft = ensureDraftChapters({
          meta: cachedOutline.meta,
          intro: cachedOutline.intro,
          baseCode: materializeBaseCodeForFilledSteps(
            cachedOutline,
            sourceItems,
            filledSteps,
          ),
          chapters: cachedOutline.chapters,
          steps: filledSteps,
        });
        await draftRepo.writePartialTutorial(draftId, partialDraft);
        const committedFiles =
          filledSteps.length > 0
            ? getFilesAfterStep(partialDraft, filledSteps.length - 1)
            : normalizeBaseCode(partialDraft.baseCode, partialDraft.meta).files;
        agentState = withCommittedCheckpoint({
          state: agentState,
          checkpointIndex: filledSteps.length - 1,
          currentAction: "step_fill",
          snapshotHash: computeSnapshotHash(committedFiles),
          retryCount: agentState?.retryCount ?? 0,
          replanCount: agentState?.replanCount ?? 0,
          compressionCount: agentState?.compressionCount ?? 0,
          consecutiveRepairFailures: 0,
        });
        await touchJob({
          phase: "step_fill",
          currentStepIndex: _stepIndex,
          totalSteps: cachedOutline.steps.length,
          retryCount: agentState.retryCount,
          agentState,
        });
        console.log(`[generate-v2] Partial persist for step ${_stepIndex}: ${Date.now() - _partialStart}ms`);
      } catch (err) {
        console.error(`[generate-v2] Failed to persist partial draft for step ${_stepIndex} (${Date.now() - _partialStart}ms):`, err);
        throw err;
      }
    },
  };
}

function sseEvent(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  );
}

export async function initiateGeneration(
  draftId: string,
  modelId: string | undefined,
  userId: string,
  generationMode: DraftGenerationMode = "auto",
): Promise<Response> {
  // Clean up stale jobs before checking the draft state. A crashed request can
  // leave drafts.generationState='running'; recovery must get the first chance
  // to clear that state before we reject a new generation.
  await recoverStaleGenerationJobsFor("starting generation");

  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft) throw new Error("Draft not found");

  if (draft.generationState === "running") {
    throw new Error("Generation is already in progress for this draft");
  }

  const useAgentLoop = process.env.USE_AGENT_LOOP === '1';

  const savedOutline =
    generationMode === "fill_from_saved_outline"
      ? draft.generationOutline
        ? ensureOutlineChapters(draft.generationOutline)
        : null
      : null;

  if (generationMode === "fill_from_saved_outline" && !savedOutline) {
    throw new Error("outline_missing: 请先生成并保存大纲后，再继续生成教程。");
  }

  const effectiveModel =
    modelId ||
    draft.generationModel ||
    process.env.DEFAULT_AI_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    "minimax/MiniMax-M2.7";

  const latestJob = useAgentLoop
    ? await generationJobRepo.getLatestDraftGenerationJobByDraftId(draftId)
    : null;
  let resumeState = deriveAgentResumeState({
    useAgentLoop,
    generationMode,
    draftTutorial: draft.tutorialDraft,
    latestJob,
  });

  if (resumeState) {
    const checkpointValidation = validateAgentResumeCheckpoint(resumeState);
    if (checkpointValidation.status === "invalid") {
      console.warn(
        `[generate-v2] Resume disabled for draft ${draftId}: ${checkpointValidation.reason}` +
          (checkpointValidation.errorMessage ? ` (${checkpointValidation.errorMessage})` : ""),
      );
      resumeState = null;
    } else if (checkpointValidation.status === "realigned") {
      console.warn(
        `[generate-v2] Resume checkpoint realigned for draft ${draftId}: ${checkpointValidation.reason}. Partial draft wins.`,
      );
      resumeState = {
        ...resumeState,
        agentState: checkpointValidation.agentState,
      };
    }
  }

  let job: DraftGenerationJob;
  const startedAt = new Date();
  const _setupStart = Date.now();

  await db.transaction(async (tx) => {
    job = await generationJobRepo.createDraftGenerationJob(
      {
        draftId,
        userId,
        status: "running",
        phase: "outline",
        startedAt,
        heartbeatAt: startedAt,
        leaseUntil: getLeaseUntil(startedAt),
        modelId: effectiveModel,
        outlineSnapshot: resumeState?.outline ?? null,
        stepTitlesSnapshot: resumeState?.outline.steps.map((step) => step.title) ?? null,
        agentState: resumeState?.agentState ?? createEmptyAgentState(),
      },
      tx
    );
    await draftRepo.clearDraftTutorialForGeneration(draftId, tx, {
      preserveOutline: generationMode === "fill_from_saved_outline",
      preservePartialDraft: Boolean(resumeState),
    });
    await draftRepo.updateDraftGenerationState(draftId, "running", undefined, tx);
    await draftRepo.updateDraftActiveGenerationJobId(draftId, job.id, tx);
  });
  console.log(`[generate-v2] DB setup transaction: ${Date.now() - _setupStart}ms`);

  return initiateGenerationStream(
    draftId,
    draft,
    effectiveModel,
    job!,
    generationMode,
    savedOutline,
    resumeState,
  );
}

/**
 * Multi-phase generation (outline → step fill → validate).
 */
async function initiateGenerationStream(
  draftId: string,
  draft: any,
  model: string,
  job: DraftGenerationJob,
  generationMode: DraftGenerationMode,
  savedOutline: TutorialOutline | null,
  resumeState: AgentResumeState | null,
): Promise<Response> {
  const cancelToken: CancelToken = { value: false };
  const useAgentLoop = process.env.USE_AGENT_LOOP === '1';
  const lifecycleHooks = createJobLifecycleHooks(
    job.id,
    draftId,
    draft.sourceItems,
    resumeState?.agentState ?? job.agentState ?? null,
  );

  // Register so the cancel API endpoint can signal this generation
  activeGenerations.set(draftId, { jobId: job.id, token: cancelToken });

  // DB-based cancel check for cross-instance reliability
  const jobId = job.id;
  const checkDbCancel = async () => {
    return generationJobRepo.isCancelRequestedForJob(jobId);
  };

  let stream: ReadableStream<Uint8Array>;
  let result: Promise<MultiPhaseResult>;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const stopHeartbeat = () => {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const startHeartbeat = () => {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      const now = new Date();
      generationJobRepo.updateDraftGenerationJob(jobId, {
        heartbeatAt: now,
        leaseUntil: getLeaseUntil(now),
      }).catch((err) => {
        console.error(
          `[generate-v2] Failed to refresh heartbeat for draft ${draftId}, job ${jobId}:`,
          err,
        );
      });
    }, GENERATION_HEARTBEAT_INTERVAL_MS);
  };

  try {
    const generationStream = useAgentLoop
      ? createAgentGenerationStream(
          draft.sourceItems,
          draft.teachingBrief,
          model,
          cancelToken,
          lifecycleHooks,
          checkDbCancel,
          {
            mode:
              generationMode === "outline_review"
                ? "outline_only"
                : generationMode === "fill_from_saved_outline"
                  ? "fill_from_outline"
                  : "full",
            initialOutline: savedOutline ?? undefined,
            resume: resumeState ?? undefined,
            trace: {
              jobId: job.id,
              draftId,
            },
          },
        )
      : createMultiPhaseGenerationStream(
          draft.sourceItems,
          draft.teachingBrief,
          model,
          cancelToken,
          lifecycleHooks,
          checkDbCancel,
          {
            mode:
              generationMode === "outline_review"
                ? "outline_only"
                : generationMode === "fill_from_saved_outline"
                  ? "fill_from_outline"
                  : "full",
            initialOutline: savedOutline ?? undefined,
          },
        );
    stream = generationStream.stream;
    result = generationStream.result;
    generationStream.outlineReady.then((outline) => {
      draftRepo.updateDraftGenerationOutline(draftId, outline).catch((err) => {
        console.error(`[generate-v2] Failed to persist outline for draft ${draftId}:`, err);
      });
    });
  } catch (err: any) {
    await markGenerationFailed(draftId, job.id, err);
    activeGenerations.delete(draftId);
    throw err;
  }

  startHeartbeat();

  // Persist all content asynchronously after generation completes.
  // Always clean up the registry entry regardless of outcome.
  persistContent(draftId, job.id, result, draft, model, generationMode)
    .catch((persistErr) => {
      console.error(
        `[generate-v2] Failed to persist content for draft ${draftId}:`,
        persistErr,
      );
    })
    .finally(() => {
      stopHeartbeat();
      const activeGeneration = activeGenerations.get(draftId);
      if (activeGeneration?.jobId === job.id) {
        activeGenerations.delete(draftId);
      }
    });

  // Wrap the stream — client disconnect does NOT stop generation.
  // Only an explicit cancel API call sets cancelToken.
  const wrappedStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sseEvent("job", { jobId: job.id }));
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err: any) {
        const message = err?.message ?? String(err);
        if (!message.includes("Controller is already closed")) {
          console.error(`[generate-v2] Stream error for draft ${draftId}, job ${job.id}:`, message);
        }
        try {
          controller.error(err);
        } catch {
          // Ignore secondary stream errors after the response has already closed.
        }
      } finally {
        reader.releaseLock();
      }
    },
  });

  return new Response(wrappedStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Generation-Job-Id": job.id,
    },
  });
}

async function persistContent(
  draftId: string,
  jobId: string,
  resultPromise: Promise<MultiPhaseResult>,
  draft: any,
  model: string,
  generationMode: DraftGenerationMode,
) {
  const startTime = Date.now();

  let multiPhaseResult: MultiPhaseResult;
  try {
    multiPhaseResult = await resultPromise;
  } catch (err: any) {
    await markGenerationFailed(draftId, jobId, err);
    return;
  }

  const { draft: tutorialDraft, outline, retryCount } = multiPhaseResult;
  const currentJob = await generationJobRepo.getDraftGenerationJobById(jobId);

  try {
    const persistStartedAt = new Date();
    await generationJobRepo.updateDraftGenerationJob(jobId, {
      status: "running",
      phase: "persist",
      heartbeatAt: persistStartedAt,
      leaseUntil: getLeaseUntil(persistStartedAt),
        retryCount,
    });

    if (generationMode === "outline_review" || !tutorialDraft) {
      const finishedAt = new Date();
      await db.transaction(async (tx) => {
        await draftRepo.saveDraftOutlineReviewResult(
          draftId,
          outline,
          model,
          tx,
        );
        await draftRepo.updateDraftGenerationState(
          draftId,
          "idle",
          undefined,
          tx,
        );
        await generationJobRepo.updateDraftGenerationJob(
          jobId,
          {
            status: "succeeded",
            phase: "outline",
            finishedAt,
            heartbeatAt: finishedAt,
            leaseUntil: null,
            currentStepIndex: null,
            totalSteps: outline.steps.length,
            retryCount,
            errorCode: null,
            errorMessage: null,
            failureDetail: null,
            outlineSnapshot: outline,
            stepTitlesSnapshot: outline.steps.map((step) => step.title),
          },
          tx,
        );
      });
      return;
    }

    const _valStart = Date.now();
    const validation = await validateTutorialDraft(tutorialDraft);
    const _valMs = Date.now() - _valStart;
    const totalMs = Date.now() - startTime;

    // Compute quality metrics
    const _qualityStart = Date.now();
    const quality = computeGenerationQuality(
      tutorialDraft,
      outline,
      retryCount,
      totalMs,
      multiPhaseResult.agentMetrics,
    );
    const _qualityMs = Date.now() - _qualityStart;

    const finalState = validation.valid ? "succeeded" : "failed";
    const validationStepIndex = validation.valid
      ? null
      : getFirstValidationStepIndex(validation.provenance);
    const errorMsg = validation.valid
      ? undefined
      : validation.errors.join("; ");
    const finishedAt = new Date();
    const terminalAgentState = validation.valid
      ? withAgentAction(currentJob?.agentState, "validate", {
          retryCount,
          currentAttempt: 0,
        })
      : withFailureState({
          state: currentJob?.agentState,
          action: "validate",
          stepIndex: validationStepIndex,
          category: "validation",
          message: errorMsg ?? null,
          retryCount,
          currentAttempt: 0,
        });

    // Persist all updates atomically in a single transaction
    const _txStart = Date.now();
    await db.transaction(async (tx) => {
      await draftRepo.updateDraftTutorial(
        draftId,
        tutorialDraft,
        { inputHash: validation.valid ? draft.inputHash : null, model },
        tx,
      );
      await draftRepo.updateDraftGenerationOutline(draftId, outline, tx);
      await draftRepo.updateDraftGenerationQuality(draftId, quality, tx);
      await draftRepo.updateDraftValidation(
        draftId,
        validation.valid,
        validation.valid ? [] : validation.errors,
        tx,
      );
      await draftRepo.updateDraftGenerationState(
        draftId,
        finalState,
        errorMsg,
        tx,
      );
      await generationJobRepo.updateDraftGenerationJob(
        jobId,
        {
          status: validation.valid ? "succeeded" : "failed",
          phase: "persist",
          finishedAt,
          heartbeatAt: finishedAt,
          leaseUntil: null,
          currentStepIndex: validation.valid ? null : validationStepIndex,
          totalSteps: outline.steps.length,
          retryCount,
          errorCode: validation.valid ? null : "DRAFT_VALIDATION_FAILED",
          errorMessage: validation.valid ? null : errorMsg,
          failureDetail: validation.valid
            ? null
            : {
                validationErrors: validation.errors,
                validationProvenance: validation.provenance,
              },
          outlineSnapshot: outline,
          stepTitlesSnapshot: outline.steps.map((step) => step.title),
          agentState: terminalAgentState,
        },
        tx
      );
    });
    const _txMs = Date.now() - _txStart;
    console.log(`[generate-v2] Persist phase timing: total=${Date.now() - startTime}ms (validate:${_valMs}ms quality:${_qualityMs}ms db-tx:${_txMs}ms)`);
    console.log(`[generate-v2] Full generation wall time: ${Date.now() - startTime}ms`);
  } catch (err: any) {
    console.error(`[generate-v2] Persist failed for draft ${draftId}, job ${jobId}:`, err);
    await markGenerationFailed(draftId, jobId, err, "PERSIST_FAILED", "persist");
  }
}

async function markGenerationFailed(
  draftId: string,
  jobId: string,
  error: unknown,
  errorCodeOverride?: GenerationJobErrorCode,
  phaseOverride?: GenerationJobPhase,
) {
  const failure = getGenerationJobFailureUpdate(error);
  const existingJob = await generationJobRepo.getDraftGenerationJobById(jobId);
  const finishedAt = new Date();
  const errorCode = errorCodeOverride ?? failure.errorCode;
  const phase = phaseOverride ?? failure.phase;
  const nextAgentState = withFailureState({
    state: existingJob?.agentState,
    action:
      phase === "validate"
        ? "validate"
        : phase === "outline"
          ? "planning"
          : getJobCurrentAction(existingJob) ?? "step_fill",
    stepIndex: failure.currentStepIndex,
    category:
      error instanceof TutorialDraftValidationError
        ? "validation"
        : classifyFailureMessage(failure.errorMessage),
    message: failure.errorMessage,
    retryCount: existingJob?.agentState?.retryCount,
    currentAttempt: existingJob?.agentState?.currentAttempt,
    consecutiveRepairFailures:
      existingJob?.agentState?.driftSignals.consecutiveRepairFailures,
  });

  console.error(
    `[generate-v2] Generation failed for draft ${draftId}, job ${jobId}:`,
    JSON.stringify({
      errorCode,
      phase,
      errorMessage: failure.errorMessage,
      currentStepIndex: failure.currentStepIndex,
    }),
    error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : '',
  );

  await db.transaction(async (tx) => {
    await draftRepo.updateDraftGenerationState(
      draftId,
      "failed",
      failure.errorMessage,
      tx
    );
    await generationJobRepo.updateDraftGenerationJob(
      jobId,
      {
        status: failure.status,
        phase,
        finishedAt,
        heartbeatAt: finishedAt,
        leaseUntil: null,
        currentStepIndex: failure.currentStepIndex,
        errorCode,
        errorMessage: failure.errorMessage,
        failureDetail: failure.failureDetail,
        agentState: nextAgentState,
      },
      tx
    );
  });
}

/**
 * Fetch generation status for a draft.
 * Returns { draft, job } where draft is the ownership-verified record
 * and job is the latest generation job (or null).
 */
export async function getGenerationStatus(draftId: string, userId: string) {
  const { drafts } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const { mapJobToRecoverability } = await import("../types/generation-job");

  // Status polling is the reconnect path. Recover stale jobs here too so a
  // page opened on an expired running job can leave the progress screen without
  // requiring the user to start another generation first.
  await recoverStaleGenerationJobsFor("reading generation status");

  const [draft] = await db
    .select({ id: drafts.id, userId: drafts.userId })
    .from(drafts)
    .where(eq(drafts.id, draftId))
    .limit(1);

  if (!draft || draft.userId !== userId) {
    return { draft: null, job: null };
  }

  const job = await generationJobRepo.getLatestDraftGenerationJobByDraftId(draftId);

  if (!job) {
    return { draft, job: null };
  }

  return {
    draft,
    job: {
      id: job.id,
      status: job.status,
      phase: job.phase,
      currentAction: getJobCurrentAction(job),
      checkpointIndex: job.agentState?.checkpointIndex ?? null,
      currentStepIndex: job.currentStepIndex,
      totalSteps: job.totalSteps,
      modelId: job.modelId,
      cancelRequested: job.cancelRequested,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      recoverability: mapJobToRecoverability(job),
      startedAt: job.startedAt?.toISOString() ?? null,
      finishedAt: job.finishedAt?.toISOString() ?? null,
      heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
      outlineSnapshot: job.outlineSnapshot,
      stepTitlesSnapshot: job.stepTitlesSnapshot,
    },
  };
}
