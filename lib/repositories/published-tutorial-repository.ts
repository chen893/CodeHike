import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { publishedTutorials } from '../db/schema';
import type { PublishedTutorial } from '../types/api';
import type { TutorialDraft } from '../schemas/tutorial-draft';

type PublishedTutorialRow = typeof publishedTutorials.$inferSelect;

function toPublishedTutorial(row: PublishedTutorialRow): PublishedTutorial {
  return {
    id: row.id,
    draftRecordId: row.draftRecordId,
    slug: row.slug,
    tutorialDraftSnapshot: row.tutorialDraftSnapshot as TutorialDraft,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt ?? new Date(),
  };
}

export async function createPublishedTutorial(data: {
  draftRecordId: string;
  slug: string;
  tutorialDraftSnapshot: TutorialDraft;
}): Promise<PublishedTutorial> {
  const [row] = await db
    .insert(publishedTutorials)
    .values({
      draftRecordId: data.draftRecordId,
      slug: data.slug,
      tutorialDraftSnapshot: data.tutorialDraftSnapshot as any,
    })
    .returning();
  return toPublishedTutorial(row);
}

export async function getPublishedBySlug(
  slug: string
): Promise<PublishedTutorial | null> {
  const [row] = await db
    .select()
    .from(publishedTutorials)
    .where(eq(publishedTutorials.slug, slug));
  return row ? toPublishedTutorial(row) : null;
}

export async function isSlugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: publishedTutorials.id })
    .from(publishedTutorials)
    .where(eq(publishedTutorials.slug, slug));
  return !!row;
}

export async function listPublished(): Promise<PublishedTutorial[]> {
  const rows = await db
    .select()
    .from(publishedTutorials)
    .orderBy(desc(publishedTutorials.publishedAt));
  return rows.map(toPublishedTutorial);
}
