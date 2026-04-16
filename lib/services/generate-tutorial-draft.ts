import {
  createMultiPhaseGenerationStream,
  GenerationCancelledError,
  MultiPhaseGenerationError,
  type MultiPhaseResult,
  type CancelToken,
  type MultiPhaseLifecycleHooks,
} from "../ai/multi-phase-generator";
import { RetrievalModelRequiredError } from "../ai/model-capabilities";
import { validateTutorialDraft } from "../utils/validation";
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
import { isTerminalDraftGenerationJobStatus } from "../types/generation-job";

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

const GENERATION_JOB_LEASE_MS = 5 * 60 * 1000;

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
  if (isCancelledGenerationError(error)) {
    return {
      status: "cancelled",
      errorCode: "JOB_CANCELLED",
      errorMessage: "Generation cancelled",
      failureDetail: getFailureDetail(error),
      phase: getErrorPhase(error),
      currentStepIndex: getErrorStepIndex(error),
    };
  }

  const unwrapped = unwrapGenerationError(error);
  const phase = getErrorPhase(error);
  const errorCode: GenerationJobErrorCode =
    unwrapped instanceof RetrievalModelRequiredError
      ? "MODEL_CAPABILITY_MISMATCH"
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
    failureDetail: getFailureDetail(error),
    phase,
    currentStepIndex: getErrorStepIndex(error),
  };
}

function createJobLifecycleHooks(jobId: string): MultiPhaseLifecycleHooks {
  async function touchJob(data: Parameters<typeof generationJobRepo.updateDraftGenerationJob>[1]) {
    const now = new Date();
    await generationJobRepo.updateDraftGenerationJob(jobId, {
      status: "running",
      heartbeatAt: now,
      leaseUntil: getLeaseUntil(now),
      ...data,
    });
  }

  return {
    onPhase: async (event) => {
      await touchJob({
        phase: event.phase,
        currentStepIndex: event.stepIndex ?? null,
        totalSteps: event.totalSteps ?? undefined,
        retryCount: event.retryCount,
      });
    },
    onOutlineReady: async (outline) => {
      const stepTitles = outline.steps.map((step) => step.title);
      await touchJob({
        outlineSnapshot: outline,
        totalSteps: outline.steps.length,
        stepTitlesSnapshot: stepTitles,
      });
    },
    onStepRetry: async (event) => {
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
      });
    },
    onStepCompleted: async (event) => {
      await touchJob({
        phase: "step_fill",
        currentStepIndex: event.stepIndex,
        totalSteps: event.totalSteps,
        retryCount: event.retryCount,
      });
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
): Promise<Response> {
  // Clean up stale jobs before checking the draft state. A crashed request can
  // leave drafts.generationState='running'; recovery must get the first chance
  // to clear that state before we reject a new generation.
  const recoveredCount = await generationJobRepo.recoverStaleGenerationJobs();
  if (recoveredCount > 0) {
    console.log(`[generate-v2] Recovered ${recoveredCount} stale generation job(s)`);
  }

  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft) throw new Error("Draft not found");

  if (draft.generationState === "running") {
    throw new Error("Generation is already in progress for this draft");
  }

  const effectiveModel =
    modelId || process.env.DEEPSEEK_MODEL || "deepseek-chat";

  let job: DraftGenerationJob;
  const startedAt = new Date();

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
      },
      tx
    );
    await draftRepo.updateDraftGenerationState(draftId, "running", undefined, tx);
    await draftRepo.updateDraftActiveGenerationJobId(draftId, job.id, tx);
  });

  return initiateGenerationStream(draftId, draft, effectiveModel, job!);
}

/**
 * Multi-phase generation (outline → step fill → validate).
 */
async function initiateGenerationStream(
  draftId: string,
  draft: any,
  model: string,
  job: DraftGenerationJob,
): Promise<Response> {
  const cancelToken: CancelToken = { value: false };
  const lifecycleHooks = createJobLifecycleHooks(job.id);

  // Register so the cancel API endpoint can signal this generation
  activeGenerations.set(draftId, { jobId: job.id, token: cancelToken });

  // DB-based cancel check for cross-instance reliability
  const jobId = job.id;
  const checkDbCancel = async () => {
    return generationJobRepo.isCancelRequestedForJob(jobId);
  };

  let stream: ReadableStream<Uint8Array>;
  let result: Promise<MultiPhaseResult>;

  try {
    const generationStream = createMultiPhaseGenerationStream(
      draft.sourceItems,
      draft.teachingBrief,
      model,
      cancelToken,
      lifecycleHooks,
      checkDbCancel,
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

  // Persist all content asynchronously after generation completes.
  // Always clean up the registry entry regardless of outcome.
  persistContent(draftId, job.id, result, draft, model)
    .catch((persistErr) => {
      console.error(
        `[generate-v2] Failed to persist content for draft ${draftId}:`,
        persistErr,
      );
    })
    .finally(() => {
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
        console.error(`[generate-v2] Stream error for draft ${draftId}, job ${job.id}:`, err?.message ?? err);
        controller.error(err);
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

  try {
    const persistStartedAt = new Date();
    await generationJobRepo.updateDraftGenerationJob(jobId, {
      status: "running",
      phase: "persist",
      heartbeatAt: persistStartedAt,
      leaseUntil: getLeaseUntil(persistStartedAt),
      retryCount,
    });

    const validation = await validateTutorialDraft(tutorialDraft);
    const totalMs = Date.now() - startTime;

    // Compute quality metrics
    const quality = computeGenerationQuality(
      tutorialDraft,
      outline,
      retryCount,
      totalMs,
    );

    const finalState = validation.valid ? "succeeded" : "failed";
    const errorMsg = validation.valid
      ? undefined
      : validation.errors.join("; ");
    const finishedAt = new Date();

    // Persist all updates atomically in a single transaction
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
          currentStepIndex: null,
          totalSteps: outline.steps.length,
          retryCount,
          errorCode: validation.valid ? null : "DRAFT_VALIDATION_FAILED",
          errorMessage: validation.valid ? null : errorMsg,
          failureDetail: validation.valid
            ? null
            : { validationErrors: validation.errors },
          outlineSnapshot: outline,
          stepTitlesSnapshot: outline.steps.map((step) => step.title),
        },
        tx
      );
    });
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
  const finishedAt = new Date();
  const errorCode = errorCodeOverride ?? failure.errorCode;
  const phase = phaseOverride ?? failure.phase;

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
      currentStepIndex: job.currentStepIndex,
      totalSteps: job.totalSteps,
      modelId: job.modelId,
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
