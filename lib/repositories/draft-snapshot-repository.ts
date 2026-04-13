import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { draftSnapshots } from '../db/schema';
import type { TutorialDraft } from '../schemas/tutorial-draft';

export interface DraftSnapshot {
  id: string;
  draftId: string;
  label: string | null;
  tutorialDraftSnapshot: TutorialDraft;
  stepCount: number;
  createdAt: Date;
}

type SnapshotRow = typeof draftSnapshots.$inferSelect;

function toSnapshot(row: SnapshotRow): DraftSnapshot {
  return {
    id: row.id,
    draftId: row.draftId,
    label: row.label,
    tutorialDraftSnapshot: row.tutorialDraftSnapshot as TutorialDraft,
    stepCount: row.stepCount,
    createdAt: row.createdAt,
  };
}

export async function listSnapshots(draftId: string): Promise<DraftSnapshot[]> {
  const rows = await db
    .select()
    .from(draftSnapshots)
    .where(eq(draftSnapshots.draftId, draftId))
    .orderBy(desc(draftSnapshots.createdAt));

  return rows.map(toSnapshot);
}

export async function createSnapshot(data: {
  draftId: string;
  label: string | null;
  tutorialDraft: TutorialDraft;
  stepCount: number;
}): Promise<DraftSnapshot> {
  const [row] = await db
    .insert(draftSnapshots)
    .values({
      draftId: data.draftId,
      label: data.label,
      tutorialDraftSnapshot: data.tutorialDraft as any,
      stepCount: data.stepCount,
    })
    .returning();
  return toSnapshot(row);
}

export async function getSnapshotById(
  snapshotId: string
): Promise<DraftSnapshot | null> {
  const [row] = await db
    .select()
    .from(draftSnapshots)
    .where(eq(draftSnapshots.id, snapshotId));
  return row ? toSnapshot(row) : null;
}

export async function deleteSnapshot(snapshotId: string): Promise<boolean> {
  const rows = await db
    .delete(draftSnapshots)
    .where(eq(draftSnapshots.id, snapshotId))
    .returning({ id: draftSnapshots.id });

  return rows.length > 0;
}
