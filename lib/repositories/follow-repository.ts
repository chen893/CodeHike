import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { userTagFollows, tutorialTags, tutorialTagRelations, publishedTutorials, drafts, users } from '../db/schema';
import type { TutorialTag } from '../types/api';

export interface FollowedTutorial {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  publishedAt: Date;
  authorId: string | null;
  authorName: string | null;
  authorUsername: string | null;
  authorImage: string | null;
  stepCount: number;
  readingTime: number;
}

/** Extract FollowedTutorial from raw row with tutorialDraftSnapshot JSONB. */
function toFollowedTutorial(row: {
  id: string;
  slug: string;
  tutorialDraftSnapshot: unknown;
  publishedAt: Date;
  authorId: string | null;
  authorName: string | null;
  authorUsername: string | null;
  authorImage: string | null;
}): FollowedTutorial {
  const draft = row.tutorialDraftSnapshot as Record<string, unknown>;
  const meta = (draft && typeof draft === 'object' && 'meta' in draft)
    ? (draft.meta as Record<string, unknown>)
    : {};
  const steps = (draft && typeof draft === 'object' && 'steps' in draft && Array.isArray(draft.steps))
    ? draft.steps
    : [];
  const stepCount = steps.length;
  const readingTime = Math.ceil(stepCount * 1.5) || 1;

  return {
    id: row.id,
    slug: row.slug,
    title: (meta.title as string) || '',
    description: (meta.description as string) || null,
    publishedAt: row.publishedAt,
    authorId: row.authorId,
    authorName: row.authorName,
    authorUsername: row.authorUsername,
    authorImage: row.authorImage,
    stepCount,
    readingTime,
  };
}

export async function followTag(userId: string, tagId: string): Promise<void> {
  await db.insert(userTagFollows).values({ userId, tagId })
    .onConflictDoNothing(); // already following
}

export async function unfollowTag(userId: string, tagId: string): Promise<void> {
  await db.delete(userTagFollows)
    .where(and(eq(userTagFollows.userId, userId), eq(userTagFollows.tagId, tagId)));
}

export async function isFollowingTag(userId: string, tagId: string): Promise<boolean> {
  const [row] = await db.select({ id: userTagFollows.tagId })
    .from(userTagFollows)
    .where(and(eq(userTagFollows.userId, userId), eq(userTagFollows.tagId, tagId)));
  return !!row;
}

export async function getFollowedTags(userId: string): Promise<TutorialTag[]> {
  const rows = await db.select({
    id: tutorialTags.id,
    name: tutorialTags.name,
    slug: tutorialTags.slug,
    tagType: tutorialTags.tagType,
    createdAt: tutorialTags.createdAt,
  })
    .from(userTagFollows)
    .innerJoin(tutorialTags, eq(userTagFollows.tagId, tutorialTags.id))
    .where(eq(userTagFollows.userId, userId))
    .orderBy(desc(userTagFollows.createdAt));
  return rows;
}

/**
 * Fetch all tutorials for a user's followed tags in a single query.
 * Uses JOIN + IN clause to avoid N+1 pattern.
 * Returns tutorials sorted by publishedAt desc, deduplicated.
 */
export async function getFollowedTutorials(userId: string): Promise<FollowedTutorial[]> {
  // Step 1: Get followed tag IDs
  const followedRows = await db.select({ tagId: userTagFollows.tagId })
    .from(userTagFollows)
    .where(eq(userTagFollows.userId, userId));

  if (followedRows.length === 0) return [];

  const tagIds = followedRows.map(r => r.tagId);

  // Step 2: Get distinct tutorial IDs associated with those tags
  const tutorialIdRows = await db.selectDistinct({ tutorialId: tutorialTagRelations.tutorialId })
    .from(tutorialTagRelations)
    .where(inArray(tutorialTagRelations.tagId, tagIds));

  if (tutorialIdRows.length === 0) return [];

  const tutorialIds = tutorialIdRows.map(r => r.tutorialId);

  // Step 3: Fetch published tutorials by those IDs
  // Title/description/stepCount are inside tutorialDraftSnapshot JSONB, extracted at app level
  // leftJoin users as per AGENTS.md convention (drafts.userId may be NULL)
  const rows = await db.select({
    id: publishedTutorials.id,
    slug: publishedTutorials.slug,
    tutorialDraftSnapshot: publishedTutorials.tutorialDraftSnapshot,
    publishedAt: publishedTutorials.publishedAt,
    authorId: drafts.userId,
    authorName: users.name,
    authorUsername: users.username,
    authorImage: users.image,
  })
    .from(publishedTutorials)
    .innerJoin(drafts, eq(publishedTutorials.draftRecordId, drafts.id))
    .leftJoin(users, eq(drafts.userId, users.id))
    .where(inArray(publishedTutorials.id, tutorialIds))
    .orderBy(desc(publishedTutorials.publishedAt));

  return rows.map(toFollowedTutorial);
}
