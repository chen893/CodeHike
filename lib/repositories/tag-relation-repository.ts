/**
 * Tag relation repository — data access for tag-to-tag relationships.
 * Supports co-occurrence frequency and same-tagType supplement (D-14).
 */

import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db';
import { tagRelations, tutorialTags } from '../db/schema';
import type { TutorialTag } from '../types/api';

export interface TagRelationWithMeta extends TutorialTag {
  strength: number;
}

export async function getRelatedTags(
  tagId: string,
  limit: number = 10,
): Promise<TagRelationWithMeta[]> {
  const rows = await db
    .select({
      id: tutorialTags.id,
      name: tutorialTags.name,
      slug: tutorialTags.slug,
      tagType: tutorialTags.tagType,
      createdAt: tutorialTags.createdAt,
      strength: tagRelations.strength,
    })
    .from(tagRelations)
    .innerJoin(tutorialTags, eq(tagRelations.toTagId, tutorialTags.id))
    .where(eq(tagRelations.fromTagId, tagId))
    .orderBy(desc(tagRelations.strength))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagType: row.tagType ?? null,
    createdAt: row.createdAt,
    strength: row.strength ?? 0,
  }));
}

/**
 * Compute co-occurrence relations from tutorial_tag_relations.
 * Uses a self-join to find tag pairs that appear on the same tutorial.
 * Inserts both directions for bidirectional lookup.
 * Returns the total number of relations after computation.
 */
export async function computeCoOccurrence(): Promise<number> {
  // Forward direction (ttr1.tag_id < ttr2.tag_id)
  await db.execute(sql`
    INSERT INTO tag_relations (from_tag_id, to_tag_id, relation_type, strength)
    SELECT
      ttr1.tag_id AS from_tag_id,
      ttr2.tag_id AS to_tag_id,
      'co_occurrence' AS relation_type,
      COUNT(*)::int AS strength
    FROM tutorial_tag_relations ttr1
    JOIN tutorial_tag_relations ttr2
      ON ttr1.tutorial_id = ttr2.tutorial_id
      AND ttr1.tag_id < ttr2.tag_id
    GROUP BY ttr1.tag_id, ttr2.tag_id
    ON CONFLICT (from_tag_id, to_tag_id)
    DO UPDATE SET strength = EXCLUDED.strength, computed_at = NOW()
  `);

  // Reverse direction (for bidirectional lookup)
  await db.execute(sql`
    INSERT INTO tag_relations (from_tag_id, to_tag_id, relation_type, strength)
    SELECT
      ttr2.tag_id AS from_tag_id,
      ttr1.tag_id AS to_tag_id,
      'co_occurrence' AS relation_type,
      COUNT(*)::int AS strength
    FROM tutorial_tag_relations ttr1
    JOIN tutorial_tag_relations ttr2
      ON ttr1.tutorial_id = ttr2.tutorial_id
      AND ttr1.tag_id < ttr2.tag_id
    GROUP BY ttr2.tag_id, ttr1.tag_id
    ON CONFLICT (from_tag_id, to_tag_id)
    DO UPDATE SET strength = EXCLUDED.strength, computed_at = NOW()
  `);

  // Count total relations
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tagRelations);
  return count?.total ?? 0;
}

/**
 * Supplement with same-tagType relations for tags that have no co-occurrence data.
 * Inserts pairs of tags that share the same tagType but never appeared together on a tutorial.
 * Returns the number of same-type supplements added.
 */
export async function computeSameTypeSupplement(): Promise<number> {
  await db.execute(sql`
    INSERT INTO tag_relations (from_tag_id, to_tag_id, relation_type, strength)
    SELECT t1.id, t2.id, 'same_type', 0
    FROM tutorial_tags t1
    JOIN tutorial_tags t2 ON t1.tag_type = t2.tag_type AND t1.id < t2.id
    WHERE t1.tag_type IS NOT NULL
    ON CONFLICT (from_tag_id, to_tag_id) DO NOTHING
  `);

  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(tagRelations)
    .where(eq(tagRelations.relationType, 'same_type'));
  return count?.total ?? 0;
}

/**
 * Delete stale relations older than the given number of days.
 * Returns the number of deleted rows.
 */
export async function deleteStaleRelations(
  olderThanDays: number = 90,
): Promise<number> {
  const result = await db
    .delete(tagRelations)
    .where(
      sql`${tagRelations.computedAt} < NOW() - INTERVAL '${sql.raw(String(olderThanDays))} days'`,
    );
  return result.rowCount ?? 0;
}
