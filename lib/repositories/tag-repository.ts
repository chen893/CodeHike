import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { tutorialTags, tutorialTagRelations, publishedTutorials } from '../db/schema';
import type { TutorialTag } from '../types/api';
import { pinyin } from 'pinyin-pro';

type TutorialTagRow = typeof tutorialTags.$inferSelect;

function toTutorialTag(row: TutorialTagRow): TutorialTag {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
  };
}

function generateSlug(name: string): string {
  const lower = name.toLowerCase().trim();
  if (!lower) return 'tag';

  // Split into alternating segments of CJK and non-CJK characters
  const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  const segments: { text: string; isCJK: boolean }[] = [];
  let current = '';
  let isCurrentCJK = CJK_REGEX.test(lower[0]);

  for (const char of lower) {
    const isCJK = CJK_REGEX.test(char);
    if (isCJK === isCurrentCJK) {
      current += char;
    } else {
      if (current) segments.push({ text: current, isCJK: isCurrentCJK });
      current = char;
      isCurrentCJK = isCJK;
    }
  }
  if (current) segments.push({ text: current, isCJK: isCurrentCJK });

  const parts = segments.map((seg) => {
    if (seg.isCJK) {
      return pinyin(seg.text, { toneType: 'none', type: 'array' }).join('-');
    }
    // Non-CJK: keep as-is, replace spaces with hyphens
    return seg.text.replace(/\s+/g, '-');
  });

  const joined = parts
    .join('-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return joined || 'tag';
}

export async function createTag(name: string): Promise<TutorialTag> {
  const slug = generateSlug(name);
  const [row] = await db
    .insert(tutorialTags)
    .values({ name, slug })
    .returning();
  return toTutorialTag(row);
}

export async function getOrCreateTag(name: string): Promise<TutorialTag> {
  const [byName] = await db
    .select()
    .from(tutorialTags)
    .where(eq(tutorialTags.name, name));
  if (byName) {
    return toTutorialTag(byName);
  }

  // Check by slug in case of collision (e.g., "React" vs "react")
  const slug = generateSlug(name);
  if (slug) {
    const [bySlug] = await db
      .select()
      .from(tutorialTags)
      .where(eq(tutorialTags.slug, slug));
    if (bySlug) {
      return toTutorialTag(bySlug);
    }
  }

  try {
    return await createTag(name);
  } catch (err: any) {
    // Handle unique constraint violation from race condition
    if (err?.code === '23505') {
      const [row] = await db
        .select()
        .from(tutorialTags)
        .where(eq(tutorialTags.name, name));
      if (row) return toTutorialTag(row);
    }
    throw err;
  }
}

export async function getTagBySlug(slug: string): Promise<TutorialTag | null> {
  const [row] = await db
    .select()
    .from(tutorialTags)
    .where(eq(tutorialTags.slug, slug));
  return row ? toTutorialTag(row) : null;
}

export async function listAllTags(): Promise<(TutorialTag & { tutorialCount: number })[]> {
  const rows = await db
    .select({
      id: tutorialTags.id,
      name: tutorialTags.name,
      slug: tutorialTags.slug,
      createdAt: tutorialTags.createdAt,
      tutorialCount: sql<number>`count(${tutorialTagRelations.tutorialId})::int`,
    })
    .from(tutorialTags)
    .leftJoin(tutorialTagRelations, eq(tutorialTags.id, tutorialTagRelations.tagId))
    .groupBy(tutorialTags.id, tutorialTags.name, tutorialTags.slug, tutorialTags.createdAt)
    .orderBy(desc(sql`count(${tutorialTagRelations.tutorialId})`));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    tutorialCount: row.tutorialCount,
  }));
}

export async function setTagsForTutorial(
  tutorialId: string,
  tagIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(tutorialTagRelations)
      .where(eq(tutorialTagRelations.tutorialId, tutorialId));

    if (tagIds.length > 0) {
      await tx.insert(tutorialTagRelations).values(
        tagIds.map((tagId) => ({
          tutorialId,
          tagId,
        })),
      );
    }
  });
}

export async function getTagsForTutorial(tutorialId: string): Promise<TutorialTag[]> {
  const rows = await db
    .select({
      id: tutorialTags.id,
      name: tutorialTags.name,
      slug: tutorialTags.slug,
      createdAt: tutorialTags.createdAt,
    })
    .from(tutorialTagRelations)
    .innerJoin(tutorialTags, eq(tutorialTagRelations.tagId, tutorialTags.id))
    .where(eq(tutorialTagRelations.tutorialId, tutorialId));
  return rows.map(toTutorialTag);
}

export async function getTutorialsForTag(tagSlug: string): Promise<string[]> {
  const rows = await db
    .select({ tutorialId: tutorialTagRelations.tutorialId })
    .from(tutorialTagRelations)
    .innerJoin(tutorialTags, eq(tutorialTagRelations.tagId, tutorialTags.id))
    .where(eq(tutorialTags.slug, tagSlug));
  return rows.map((r) => r.tutorialId);
}
