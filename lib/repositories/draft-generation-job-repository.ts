import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { db } from '../db';
import { draftGenerationJobs, drafts } from '../db/schema';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import {
  isTerminalDraftGenerationJobStatus,
  type DraftGenerationJob,
} from '../types/generation-job';
import type {
  GenerationJobErrorCode,
  GenerationJobFailureDetail,
  GenerationJobPhase,
  GenerationJobStatus,
} from '../schemas/generation-job';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DraftGenerationJobRow = typeof draftGenerationJobs.$inferSelect;

/**
 * Convert a raw DB row to a DraftGenerationJob.
 * Drizzle infers pgEnum columns as string; cast to our union types.
 * Safe because DB enum constraints guarantee valid values.
 */
function toDraftGenerationJob(row: DraftGenerationJobRow): DraftGenerationJob {
  return {
    id: row.id,
    draftId: row.draftId,
    userId: row.userId ?? null,
    status: row.status as GenerationJobStatus,
    phase: (row.phase as GenerationJobPhase | null) ?? null,
    startedAt: row.startedAt ?? null,
    finishedAt: row.finishedAt ?? null,
    heartbeatAt: row.heartbeatAt ?? null,
    leaseUntil: row.leaseUntil ?? null,
    currentStepIndex: row.currentStepIndex ?? null,
    totalSteps: row.totalSteps ?? null,
    retryCount: row.retryCount,
    modelId: row.modelId ?? null,
    cancelRequested: row.cancelRequested ?? false,
    errorCode: (row.errorCode as GenerationJobErrorCode | null) ?? null,
    errorMessage: row.errorMessage ?? null,
    failureDetail: (row.failureDetail as GenerationJobFailureDetail | null) ?? null,
    outlineSnapshot: (row.outlineSnapshot as TutorialOutline | null) ?? null,
    stepTitlesSnapshot: (row.stepTitlesSnapshot as string[] | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createDraftGenerationJob(data: {
  draftId: string;
  userId?: string | null;
  status?: GenerationJobStatus;
  phase?: GenerationJobPhase | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  heartbeatAt?: Date | null;
  leaseUntil?: Date | null;
  currentStepIndex?: number | null;
  totalSteps?: number | null;
  retryCount?: number;
  modelId?: string | null;
  cancelRequested?: boolean;
  errorCode?: GenerationJobErrorCode | null;
  errorMessage?: string | null;
  failureDetail?: GenerationJobFailureDetail | null;
  outlineSnapshot?: TutorialOutline | null;
  stepTitlesSnapshot?: string[] | null;
}, tx?: TransactionClient): Promise<DraftGenerationJob> {
  const executor = tx || db;
  const [row] = await executor
    .insert(draftGenerationJobs)
    .values({
      draftId: data.draftId,
      userId: data.userId ?? null,
      status: data.status ?? 'queued',
      phase: data.phase ?? null,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt ?? null,
      heartbeatAt: data.heartbeatAt ?? null,
      leaseUntil: data.leaseUntil ?? null,
      currentStepIndex: data.currentStepIndex ?? null,
      totalSteps: data.totalSteps ?? null,
      retryCount: data.retryCount ?? 0,
      modelId: data.modelId ?? null,
      cancelRequested: data.cancelRequested ?? false,
      errorCode: data.errorCode ?? null,
      errorMessage: data.errorMessage ?? null,
      failureDetail: data.failureDetail as Record<string, unknown> | null,
      outlineSnapshot: data.outlineSnapshot as unknown | null,
      stepTitlesSnapshot: data.stepTitlesSnapshot,
    })
    .returning();

  return toDraftGenerationJob(row);
}

export async function getDraftGenerationJobById(
  id: string
): Promise<DraftGenerationJob | null> {
  const [row] = await db
    .select()
    .from(draftGenerationJobs)
    .where(eq(draftGenerationJobs.id, id));

  return row ? toDraftGenerationJob(row) : null;
}

export async function getLatestDraftGenerationJobByDraftId(
  draftId: string
): Promise<DraftGenerationJob | null> {
  const [row] = await db
    .select()
    .from(draftGenerationJobs)
    .where(eq(draftGenerationJobs.draftId, draftId))
    .orderBy(
      desc(draftGenerationJobs.createdAt),
      desc(draftGenerationJobs.updatedAt),
      desc(draftGenerationJobs.id)
    )
    .limit(1);

  return row ? toDraftGenerationJob(row) : null;
}

export async function listDraftGenerationJobsByDraftId(
  draftId: string
): Promise<DraftGenerationJob[]> {
  const rows = await db
    .select()
    .from(draftGenerationJobs)
    .where(eq(draftGenerationJobs.draftId, draftId))
    .orderBy(
      desc(draftGenerationJobs.createdAt),
      desc(draftGenerationJobs.updatedAt),
      desc(draftGenerationJobs.id)
    );

  return rows.map(toDraftGenerationJob);
}

async function applyDraftGenerationJobUpdate(
  id: string,
  data: {
    status?: GenerationJobStatus;
    phase?: GenerationJobPhase | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    heartbeatAt?: Date | null;
    leaseUntil?: Date | null;
    currentStepIndex?: number | null;
    totalSteps?: number | null;
    retryCount?: number;
    modelId?: string | null;
    cancelRequested?: boolean;
    errorCode?: GenerationJobErrorCode | null;
    errorMessage?: string | null;
    failureDetail?: GenerationJobFailureDetail | null;
    outlineSnapshot?: TutorialOutline | null;
    stepTitlesSnapshot?: string[] | null;
  },
  executor: typeof db | TransactionClient
): Promise<DraftGenerationJob | null> {
  const updates: Partial<typeof draftGenerationJobs.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.status !== undefined) updates.status = data.status;
  if (data.phase !== undefined) updates.phase = data.phase;
  if (data.startedAt !== undefined) updates.startedAt = data.startedAt;
  if (data.finishedAt !== undefined) updates.finishedAt = data.finishedAt;
  if (data.heartbeatAt !== undefined) updates.heartbeatAt = data.heartbeatAt;
  if (data.leaseUntil !== undefined) updates.leaseUntil = data.leaseUntil;
  if (data.currentStepIndex !== undefined) {
    updates.currentStepIndex = data.currentStepIndex;
  }
  if (data.totalSteps !== undefined) updates.totalSteps = data.totalSteps;
  if (data.retryCount !== undefined) updates.retryCount = data.retryCount;
  if (data.modelId !== undefined) updates.modelId = data.modelId;
  if (data.cancelRequested !== undefined) updates.cancelRequested = data.cancelRequested;
  if (data.errorCode !== undefined) updates.errorCode = data.errorCode;
  if (data.errorMessage !== undefined) updates.errorMessage = data.errorMessage;
  if (data.failureDetail !== undefined) {
    updates.failureDetail = data.failureDetail as Record<string, unknown> | null;
  }
  if (data.outlineSnapshot !== undefined) {
    updates.outlineSnapshot = data.outlineSnapshot as unknown | null;
  }
  if (data.stepTitlesSnapshot !== undefined) {
    updates.stepTitlesSnapshot = data.stepTitlesSnapshot;
  }

  const [row] = await executor
    .update(draftGenerationJobs)
    .set(updates)
    .where(eq(draftGenerationJobs.id, id))
    .returning();

  if (row && data.status !== undefined && isTerminalDraftGenerationJobStatus(data.status)) {
    await executor
      .update(drafts)
      .set({
        activeGenerationJobId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(drafts.id, row.draftId),
          eq(drafts.activeGenerationJobId, row.id)
        )
      );
  }

  return row ? toDraftGenerationJob(row) : null;
}

export async function updateDraftGenerationJob(
  id: string,
  data: {
    status?: GenerationJobStatus;
    phase?: GenerationJobPhase | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    heartbeatAt?: Date | null;
    leaseUntil?: Date | null;
    currentStepIndex?: number | null;
    totalSteps?: number | null;
    retryCount?: number;
    modelId?: string | null;
    cancelRequested?: boolean;
    errorCode?: GenerationJobErrorCode | null;
    errorMessage?: string | null;
    failureDetail?: GenerationJobFailureDetail | null;
    outlineSnapshot?: TutorialOutline | null;
    stepTitlesSnapshot?: string[] | null;
  },
  tx?: TransactionClient
): Promise<DraftGenerationJob | null> {
  if (tx) {
    return applyDraftGenerationJobUpdate(id, data, tx);
  }

  if (data.status !== undefined && isTerminalDraftGenerationJobStatus(data.status)) {
    return db.transaction((transaction) =>
      applyDraftGenerationJobUpdate(id, data, transaction)
    );
  }

  return applyDraftGenerationJobUpdate(id, data, db);
}

/**
 * Signal cancellation on a generation job by setting cancelRequested = true.
 * Returns true if the signal was written; false if the job is already terminal or not found.
 */
export async function signalCancelDraftGenerationJob(
  id: string
): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .update(draftGenerationJobs)
    .set({
      cancelRequested: true,
      updatedAt: now,
    })
    .where(
      and(
        eq(draftGenerationJobs.id, id),
        inArray(draftGenerationJobs.status, ['queued', 'running'])
      )
    )
    .returning();

  return row != null;
}

/**
 * Check whether cancelRequested is true for a given job.
 * Used by the generation loop at step boundaries to detect DB-level cancel signals.
 */
export async function isCancelRequestedForJob(
  id: string
): Promise<boolean> {
  const [row] = await db
    .select({ cancelRequested: draftGenerationJobs.cancelRequested })
    .from(draftGenerationJobs)
    .where(eq(draftGenerationJobs.id, id))
    .limit(1);

  return row?.cancelRequested === true;
}

/**
 * Find all jobs where status is 'queued' or 'running' but the lease has expired,
 * and mark them as 'abandoned' with errorCode JOB_STALE.
 * Also clears activeGenerationJobId on the associated drafts.
 * Returns the number of recovered jobs.
 */
export async function recoverStaleGenerationJobs(): Promise<number> {
  const now = new Date();

  const staleJobs = await db
    .select({ id: draftGenerationJobs.id, draftId: draftGenerationJobs.draftId })
    .from(draftGenerationJobs)
    .where(
      and(
        inArray(draftGenerationJobs.status, ['queued', 'running']),
        lt(draftGenerationJobs.leaseUntil, now)
      )
    );

  if (staleJobs.length === 0) return 0;

  const staleJobIds = staleJobs.map((j) => j.id);
  const staleDraftIds = [...new Set(staleJobs.map((j) => j.draftId))];

  await db.transaction(async (tx) => {
    await tx
      .update(draftGenerationJobs)
      .set({
        status: 'abandoned',
        errorCode: 'JOB_STALE',
        errorMessage: 'Job lease expired — recovered by stale detection',
        finishedAt: now,
        heartbeatAt: now,
        leaseUntil: null,
        updatedAt: now,
      })
      .where(inArray(draftGenerationJobs.id, staleJobIds));

    // Clear activeGenerationJobId on the associated drafts
    for (const draftId of staleDraftIds) {
      await tx
        .update(drafts)
        .set({
          activeGenerationJobId: null,
          generationState: 'failed',
          generationErrorMessage: 'Previous generation job expired',
          updatedAt: now,
        })
        .where(eq(drafts.id, draftId));
    }
  });

  return staleJobIds.length;
}
