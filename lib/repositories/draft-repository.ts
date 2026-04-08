import { eq } from 'drizzle-orm';
import { db } from '../db';
import { drafts, type draftStatusEnum, type syncStateEnum, type generationStateEnum } from '../db/schema';
import type { DraftRecord } from '../types/api';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import type { TutorialDraft, TutorialStep } from '../schemas/tutorial-draft';

type DraftRow = typeof drafts.$inferSelect;

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

export async function createDraft(data: {
  sourceItems: SourceItem[];
  teachingBrief: TeachingBrief;
  inputHash: string;
}): Promise<DraftRecord> {
  const [row] = await db
    .insert(drafts)
    .values({
      sourceItems: data.sourceItems as any,
      teachingBrief: data.teachingBrief as any,
      inputHash: data.inputHash,
    })
    .returning();
  return toDraftRecord(row);
}

export async function getDraftById(id: string): Promise<DraftRecord | null> {
  const [row] = await db.select().from(drafts).where(eq(drafts.id, id));
  return row ? toDraftRecord(row) : null;
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
  meta: { inputHash: string | null; model: string }
): Promise<DraftRecord | null> {
  const [row] = await db
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

export async function updateDraftGenerationState(
  id: string,
  state: 'idle' | 'running' | 'succeeded' | 'failed',
  errorMessage?: string
): Promise<DraftRecord | null> {
  const updates: Partial<typeof drafts.$inferInsert> = {
    generationState: state as typeof drafts.generationState.enumValues[number],
    updatedAt: new Date(),
  };
  if (state === 'failed' && errorMessage) {
    updates.generationErrorMessage = errorMessage;
  }
  if (state === 'succeeded') {
    updates.generationErrorMessage = null;
  }

  const [row] = await db
    .update(drafts)
    .set(updates)
    .where(eq(drafts.id, id))
    .returning();
  return row ? toDraftRecord(row) : null;
}

export async function updateDraftValidation(
  id: string,
  valid: boolean,
  errors: string[]
): Promise<DraftRecord | null> {
  const [row] = await db
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
