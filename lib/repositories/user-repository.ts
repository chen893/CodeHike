import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { users, drafts, publishedTutorials } from '../db/schema';
import type { UserPublicProfile, PublishedTutorial } from '../types/api';
import type { TutorialDraft } from '../schemas/tutorial-draft';

type UserRow = typeof users.$inferSelect;
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

export async function getUserByUsername(
  username: string,
): Promise<UserPublicProfile | null> {
  // Find user by username, then count published tutorials via drafts
  const [userRow] = await db
    .select()
    .from(users)
    .where(eq(users.username, username));

  if (!userRow) return null;

  // Count published tutorials via a single COUNT query
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(drafts)
    .innerJoin(publishedTutorials, eq(drafts.id, publishedTutorials.draftRecordId))
    .where(eq(drafts.userId, userRow.id));
  const tutorialCount = countRow?.count ?? 0;

  return {
    id: userRow.id,
    username: userRow.username ?? '',
    name: userRow.name,
    image: userRow.image,
    bio: userRow.bio ?? null,
    tutorialCount,
  };
}

export async function getUserById(
  id: string,
): Promise<(UserRow & { username: string | null; bio: string | null }) | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, id));
  return row ?? null;
}

export async function setUsername(
  userId: string,
  username: string,
): Promise<void> {
  await db
    .update(users)
    .set({ username })
    .where(eq(users.id, userId));
}

export async function updateProfile(
  userId: string,
  data: { name?: string; bio?: string },
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.bio !== undefined) updateData.bio = data.bio;

  await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId));
}

export async function getPublishedTutorialsByUser(
  userId: string,
): Promise<PublishedTutorial[]> {
  const rows = await db
    .select({
      id: publishedTutorials.id,
      draftRecordId: publishedTutorials.draftRecordId,
      slug: publishedTutorials.slug,
      tutorialDraftSnapshot: publishedTutorials.tutorialDraftSnapshot,
      createdAt: publishedTutorials.createdAt,
      publishedAt: publishedTutorials.publishedAt,
    })
    .from(publishedTutorials)
    .innerJoin(drafts, eq(publishedTutorials.draftRecordId, drafts.id))
    .where(eq(drafts.userId, userId))
    .orderBy(desc(publishedTutorials.publishedAt));

  return rows.map(toPublishedTutorial);
}
