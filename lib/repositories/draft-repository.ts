import { and, desc, eq, inArray, sql, gte } from 'drizzle-orm';
import { db } from '../db';
import {
  draftGenerationJobs,
  drafts,
  type draftStatusEnum,
  type syncStateEnum,
  type generationStateEnum,
} from '../db/schema';
import {
  ACTIVE_DRAFT_GENERATION_JOB_STATUSES,
  isActiveDraftGenerationJobStatus,
} from '../types/generation-job';

type TransactionClient = Parameters<Parameters<typeof db.transaction>[0]>[0];
import type { DraftRecord, DraftSummary } from '../types/api';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import type { TutorialDraft, TutorialStep } from '../schemas/tutorial-draft';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import type { GenerationQuality } from '../schemas/generation-quality';

type DraftRow = typeof drafts.$inferSelect;
type DraftSummaryRow = {
  id: string;
  status: DraftSummary['status'];
  syncState: DraftSummary['syncState'];
  generationState: DraftSummary['generationState'];
  generationErrorMessage: string | null;
  validationValid: boolean;
  validationErrors: string[];
  publishedSlug: string | null;
  updatedAt: Date;
  hasTutorialDraft: boolean;
  stepCount: number;
  metaTitle: string | null;
  metaDescription: string | null;
  teachingTopic: string | null;
  teachingCoreQuestion: string | null;
};

function toDraftRecord(row: DraftRow): DraftRecord {
  return {
    id: row.id,
    status: row.status as 'draft' | 'published',
    sourceItems: row.sourceItems as SourceItem[],
    teachingBrief: row.teachingBrief as TeachingBrief,
    tutorialDraft: row.tutorialDraft as TutorialDraft | null,
    syncState: row.syncState as 'empty' | 'fresh' | 'stale',
    inputHash: row.inputHash ?? null,
    tutorialDraftInputHash: row.tutorialDraftInputHash ?? null,
    generationState: row.generationState as 'idle' | 'running' | 'succeeded' | 'failed',
    generationErrorMessage: row.generationErrorMessage ?? null,
    generationModel: row.generationModel ?? null,
    generationLastAt: row.generationLastAt ?? null,
    generationOutline: (row.generationOutline as TutorialOutline | null) ?? null,
    generationQuality: (row.generationQuality as GenerationQuality | null) ?? null,
    activeGenerationJobId: row.activeGenerationJobId ?? null,
    validationValid: row.validationValid,
    validationErrors: (row.validationErrors as string[]) ?? [],
    validationCheckedAt: row.validationCheckedAt ?? null,
    publishedSlug: row.publishedSlug ?? null,
    publishedTutorialId: row.publishedTutorialId ?? null,
    publishedAt: row.publishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDraftSummary(row: DraftSummaryRow): DraftSummary {
  return {
    id: row.id,
    status: row.status,
    syncState: row.syncState,
    generationState: row.generationState,
    generationErrorMessage: row.generationErrorMessage ?? null,
    validationValid: row.validationValid,
    validationErrors: row.validationErrors ?? [],
    publishedSlug: row.publishedSlug ?? null,
    hasTutorialDraft: Boolean(row.hasTutorialDraft),
    stepCount: Number(row.stepCount),
    title: row.metaTitle || row.teachingTopic || '新草稿',
    baseDescription: row.metaDescription || row.teachingCoreQuestion || null,
    updatedAt: row.updatedAt,
  };
}

export async function createDraft(data: {
  sourceItems: SourceItem[];
  teachingBrief: TeachingBrief;
  inputHash: string;
  userId: string;
}): Promise<DraftRecord> {
  const [row] = await db
    .insert(drafts)
    .values({
      userId: data.userId,
      sourceItems: data.sourceItems as any,
      teachingBrief: data.teachingBrief as any,
      inputHash: data.inputHash,
    })
    .returning();
  return toDraftRecord(row);
}

export async function getDraftById(id: string, userId?: string): Promise<DraftRecord | null> {
  const conditions = userId
    ? and(eq(drafts.id, id), eq(drafts.userId, userId))
    : eq(drafts.id, id);
  const [row] = await db.select().from(drafts).where(conditions);
  return row ? toDraftRecord(row) : null;
}

export async function listDrafts(userId: string): Promise<DraftRecord[]> {
  const rows = await db
    .select()
    .from(drafts)
    .where(eq(drafts.userId, userId))
    .orderBy(desc(drafts.updatedAt));

  return rows.map(toDraftRecord);
}

export async function listDraftSummaries(userId: string): Promise<DraftSummary[]> {
  const rows = await db
    .select({
      id: drafts.id,
      status: drafts.status,
      syncState: drafts.syncState,
      generationState: drafts.generationState,
      generationErrorMessage: drafts.generationErrorMessage,
      validationValid: drafts.validationValid,
      validationErrors: drafts.validationErrors,
      publishedSlug: drafts.publishedSlug,
      updatedAt: drafts.updatedAt,
      hasTutorialDraft: sql<boolean>`${drafts.tutorialDraft} is not null`,
      stepCount: sql<number>`coalesce(jsonb_array_length(${drafts.tutorialDraft} -> 'steps'), 0)`,
      metaTitle: sql<string | null>`${drafts.tutorialDraft} -> 'meta' ->> 'title'`,
      metaDescription: sql<string | null>`${drafts.tutorialDraft} -> 'meta' ->> 'description'`,
      teachingTopic: sql<string | null>`${drafts.teachingBrief} ->> 'topic'`,
      teachingCoreQuestion: sql<string | null>`${drafts.teachingBrief} ->> 'core_question'`,
    })
    .from(drafts)
    .where(eq(drafts.userId, userId))
    .orderBy(desc(drafts.updatedAt));

  return rows.map((row) => toDraftSummary(row as DraftSummaryRow));
}

export async function updateDraft(
  id: string,
  data: {
    teachingBrief?: TeachingBrief;
    inputHash?: string;
    syncState?: 'empty' | 'fresh' | 'stale';
  }
): Promise<DraftRecord | null> {
  const updates: Partial<typeof drafts.$inferInsert> = { updatedAt: new Date() };
  if (data.teachingBrief !== undefined) {
    updates.teachingBrief = data.teachingBrief as unknown as typeof updates.teachingBrief;
  }
  if (data.inputHash !== undefined) {
    updates.inputHash = data.inputHash;
  }
  if (data.syncState !== undefined) {
    updates.syncState = data.syncState as typeof drafts.syncState.enumValues[number];
  }

  const [row] = await db
    .update(drafts)
    .set(updates)
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

export async function updateDraftMeta(
  id: string,
  data: {
    title?: string;
    description?: string;
    introParagraphs?: string[];
  }
): Promise<DraftRecord | null> {
  const draft = await getDraftById(id);
  if (!draft || !draft.tutorialDraft) return null;

  const td = { ...draft.tutorialDraft };
  if (data.title !== undefined) td.meta = { ...td.meta, title: data.title };
  if (data.description !== undefined)
    td.meta = { ...td.meta, description: data.description };
  if (data.introParagraphs !== undefined)
    td.intro = { paragraphs: data.introParagraphs };

  const [row] = await db
    .update(drafts)
    .set({ tutorialDraft: td as any, updatedAt: new Date() })
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

export async function updateDraftTutorial(
  id: string,
  tutorialDraft: TutorialDraft,
  meta: { inputHash: string | null; model: string },
  tx?: TransactionClient
): Promise<DraftRecord | null> {
  const executor = tx || db;
  const [row] = await executor
    .update(drafts)
    .set({
      tutorialDraft: tutorialDraft as any,
      syncState: meta.inputHash ? 'fresh' : 'empty',
      tutorialDraftInputHash: meta.inputHash,
      generationModel: meta.model,
      generationLastAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

export async function writePartialTutorial(
  id: string,
  tutorialDraft: TutorialDraft
): Promise<void> {
  await db
    .update(drafts)
    .set({
      tutorialDraft: tutorialDraft as any,
      syncState: 'stale',
      tutorialDraftInputHash: null,
      validationValid: false,
      validationErrors: [],
      validationCheckedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, id));
}

export async function updateDraftGenerationState(
  id: string,
  state: 'idle' | 'running' | 'succeeded' | 'failed',
  errorMessage?: string,
  tx?: TransactionClient
): Promise<DraftRecord | null> {
  const executor = tx || db;
  const updates: Partial<typeof drafts.$inferInsert> = {
    generationState: state as typeof drafts.generationState.enumValues[number],
    updatedAt: new Date(),
  };
  if (state === 'failed' && errorMessage) {
    updates.generationErrorMessage = errorMessage;
  }
  if (state === 'running' || state === 'succeeded') {
    updates.generationErrorMessage = null;
  }

  const [row] = await executor
    .update(drafts)
    .set(updates)
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

export async function updateDraftValidation(
  id: string,
  valid: boolean,
  errors: string[],
  tx?: TransactionClient
): Promise<DraftRecord | null> {
  const executor = tx || db;
  const [row] = await executor
    .update(drafts)
    .set({
      validationValid: valid,
      validationErrors: errors,
      validationCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

export async function publishDraft(
  id: string,
  slug: string,
  publishedTutorialId: string
): Promise<DraftRecord | null> {
  const [row] = await db
    .update(drafts)
    .set({
      status: 'published',
      publishedSlug: slug,
      publishedTutorialId,
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

export async function updateDraftSteps(
  id: string,
  steps: TutorialStep[]
): Promise<DraftRecord | null> {
  const draft = await getDraftById(id);
  if (!draft || !draft.tutorialDraft) return null;

  const td = { ...draft.tutorialDraft, steps };

  const [row] = await db
    .update(drafts)
    .set({ tutorialDraft: td as any, updatedAt: new Date() })
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

export async function updateDraftGenerationOutline(
  id: string,
  outline: TutorialOutline,
  tx?: TransactionClient
): Promise<DraftRecord | null> {
  const executor = tx || db;
  const [row] = await executor
    .update(drafts)
    .set({
      generationOutline: outline as any,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

export async function updateDraftGenerationQuality(
  id: string,
  quality: GenerationQuality,
  tx?: TransactionClient
): Promise<DraftRecord | null> {
  const executor = tx || db;
  const [row] = await executor
    .update(drafts)
    .set({
      generationQuality: quality as any,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

async function applyDraftActiveGenerationJobIdUpdate(
  id: string,
  activeGenerationJobId: string | null,
  executor: typeof db | TransactionClient
): Promise<DraftRecord | null> {
  if (activeGenerationJobId !== null) {
    const [job] = await executor
      .select({
        id: draftGenerationJobs.id,
        draftId: draftGenerationJobs.draftId,
        status: draftGenerationJobs.status,
      })
      .from(draftGenerationJobs)
      .where(
        and(
          eq(draftGenerationJobs.id, activeGenerationJobId),
          eq(draftGenerationJobs.draftId, id),
          inArray(draftGenerationJobs.status, [...ACTIVE_DRAFT_GENERATION_JOB_STATUSES])
        )
      )
      .limit(1)
      .for('update');

    if (!job || !isActiveDraftGenerationJobStatus(job.status)) {
      throw new Error(
        'Active generation job pointer must target a queued or running job on the same draft'
      );
    }
  }

  const [row] = await executor
    .update(drafts)
    .set({
      activeGenerationJobId,
      updatedAt: new Date(),
    })
    .where(eq(drafts.id, id))
    .returning();

  return row ? toDraftRecord(row) : null;
}

export async function updateDraftActiveGenerationJobId(
  id: string,
  activeGenerationJobId: string | null,
  tx?: TransactionClient
): Promise<DraftRecord | null> {
  if (tx) {
    return applyDraftActiveGenerationJobIdUpdate(id, activeGenerationJobId, tx);
  }

  if (activeGenerationJobId !== null) {
    return db.transaction((transaction) =>
      applyDraftActiveGenerationJobIdUpdate(id, activeGenerationJobId, transaction)
    );
  }

  return applyDraftActiveGenerationJobIdUpdate(id, activeGenerationJobId, db);
}

export async function deleteDraft(id: string): Promise<boolean> {
  const rows = await db
    .delete(drafts)
    .where(eq(drafts.id, id))
    .returning({ id: drafts.id });

  return rows.length > 0;
}

/** Find a draft for the same user with the same inputHash created within the last hour. */
export async function findRecentDraftByInputHash(
  userId: string,
  inputHash: string
): Promise<DraftRecord | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select()
    .from(drafts)
    .where(
      and(
        eq(drafts.userId, userId),
        eq(drafts.inputHash, inputHash),
        gte(drafts.createdAt, oneHourAgo)
      )
    )
    .orderBy(desc(drafts.createdAt))
    .limit(1);

  return row ? toDraftRecord(row) : null;
}
