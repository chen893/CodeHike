import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { publishedTutorials, drafts, users, events, tutorialTags, tutorialTagRelations } from '../db/schema';
import type { ExploreTutorial, TutorialTag, TagTypeType } from '../types/api';

type TutorialTagRow = typeof tutorialTags.$inferSelect;

function toTutorialTag(row: TutorialTagRow): TutorialTag {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    tagType: row.tagType ?? null,
    createdAt: row.createdAt,
  };
}

interface ExploreRow {
  id: string;
  slug: string;
  tutorialDraftSnapshot: unknown;
  publishedAt: Date;
  viewCount: number;
  authorName: string | null;
  authorUsername: string | null;
  authorImage: string | null;
  tags: TutorialTag[];
}

function toExploreTutorial(row: ExploreRow): ExploreTutorial {
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
    lang: (meta.lang as string) || '',
    stepCount,
    readingTime,
    publishedAt: row.publishedAt,
    tags: row.tags,
    viewCount: row.viewCount,
    authorName: row.authorName,
    authorUsername: row.authorUsername,
    authorImage: row.authorImage,
  };
}

async function attachTags(tutorialIds: string[]): Promise<Map<string, TutorialTag[]>> {
  const tagMap = new Map<string, TutorialTag[]>();
  if (tutorialIds.length === 0) return tagMap;

  const tagRows = await db
    .select({
      tutorialId: tutorialTagRelations.tutorialId,
      tagId: tutorialTags.id,
      tagName: tutorialTags.name,
      tagSlug: tutorialTags.slug,
      tagCreatedAt: tutorialTags.createdAt,
      tagType: tutorialTags.tagType,
    })
    .from(tutorialTagRelations)
    .innerJoin(tutorialTags, eq(tutorialTagRelations.tagId, tutorialTags.id))
    .where(inArray(tutorialTagRelations.tutorialId, tutorialIds));

  for (const row of tagRows) {
    const existing = tagMap.get(row.tutorialId) || [];
    existing.push({
      id: row.tagId,
      name: row.tagName,
      slug: row.tagSlug,
      tagType: row.tagType ?? null,
      createdAt: row.tagCreatedAt,
    });
    tagMap.set(row.tutorialId, existing);
  }
  return tagMap;
}

export async function searchPublishedTutorials(
  query: string,
  limit: number = 20,
  options?: { tagSlug?: string; lang?: string; tagFilters?: { tagSlug: string; tagType: string }[] },
): Promise<ExploreTutorial[]> {
  // When multi-dimension tag filters are provided, build JOINs for each dimension
  if (options?.tagFilters && options.tagFilters.length > 0) {
    const tagJoinClauses: string[] = [];
    let paramIndex = 0;

    for (const filter of options.tagFilters) {
      paramIndex++;
      tagJoinClauses.push(`
        INNER JOIN tutorial_tag_relations ttr_f${paramIndex} ON ttr_f${paramIndex}.tutorial_id = pt.id
        INNER JOIN tutorial_tags tt_f${paramIndex} ON tt_f${paramIndex}.id = ttr_f${paramIndex}.tag_id
          AND tt_f${paramIndex}.slug = ${filter.tagSlug}
          AND tt_f${paramIndex}.tag_type = '${filter.tagType}'
      `);
    }

    const rawRows = await db.execute(sql`
      SELECT
        pt.id,
        pt.slug,
        pt.tutorial_draft_snapshot,
        pt.published_at as "publishedAt",
        coalesce(vc.cnt, 0)::int as "viewCount",
        u.name as "authorName",
        u.username as "authorUsername",
        u.image as "authorImage"
      FROM published_tutorials pt
      INNER JOIN drafts d ON d.id = pt.draft_record_id
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN (SELECT slug, count(*) as cnt FROM events WHERE event_type = 'tutorial_viewed' GROUP BY slug) vc ON vc.slug = pt.slug
      ${sql.raw(tagJoinClauses.join('\n'))}
      WHERE to_tsvector('simple', coalesce(pt.tutorial_draft_snapshot->'meta'->>'title','') || ' ' || coalesce(pt.slug,'')) @@ plainto_tsquery('simple', ${query})
      ${options.lang ? sql`AND pt.tutorial_draft_snapshot->'meta'->>'lang' = ${options.lang}` : sql``}
      ORDER BY coalesce(vc.cnt, 0) DESC
      LIMIT ${limit}
    `);

    const rows = rawRows.rows as any[];
    const tutorialIds = rows.map((r: any) => r.id);
    const tagMap = await attachTags(tutorialIds);

    return rows.map((row: any) =>
      toExploreTutorial({
        id: row.id,
        slug: row.slug,
        tutorialDraftSnapshot: row.tutorial_draft_snapshot ?? row.tutorialDraftSnapshot,
        publishedAt: row.publishedAt ?? row.published_at,
        viewCount: row.viewCount,
        authorName: row.authorName,
        authorUsername: row.authorUsername,
        authorImage: row.authorImage,
        tags: tagMap.get(row.id) || [],
      }),
    );
  }

  // When single tag filter is needed (backward compat), use raw SQL with dynamic JOINs
  if (options?.tagSlug) {
    const rawRows = await db.execute(sql`
      SELECT
        pt.id,
        pt.slug,
        pt.tutorial_draft_snapshot,
        pt.published_at as "publishedAt",
        coalesce(vc.cnt, 0)::int as "viewCount",
        u.name as "authorName",
        u.username as "authorUsername",
        u.image as "authorImage"
      FROM published_tutorials pt
      INNER JOIN drafts d ON d.id = pt.draft_record_id
      LEFT JOIN users u ON u.id = d.user_id
      LEFT JOIN (SELECT slug, count(*) as cnt FROM events WHERE event_type = 'tutorial_viewed' GROUP BY slug) vc ON vc.slug = pt.slug
      INNER JOIN tutorial_tag_relations ttr_filter ON ttr_filter.tutorial_id = pt.id
      INNER JOIN tutorial_tags tt_filter ON tt_filter.id = ttr_filter.tag_id AND tt_filter.slug = ${options.tagSlug}
      WHERE to_tsvector('simple', coalesce(pt.tutorial_draft_snapshot->'meta'->>'title','') || ' ' || coalesce(pt.slug,'')) @@ plainto_tsquery('simple', ${query})
      ${options.lang ? sql`AND pt.tutorial_draft_snapshot->'meta'->>'lang' = ${options.lang}` : sql``}
      ORDER BY coalesce(vc.cnt, 0) DESC
      LIMIT ${limit}
    `);

    const rows = rawRows.rows as any[];
    const tutorialIds = rows.map((r: any) => r.id);
    const tagMap = await attachTags(tutorialIds);

    return rows.map((row: any) =>
      toExploreTutorial({
        id: row.id,
        slug: row.slug,
        tutorialDraftSnapshot: row.tutorial_draft_snapshot ?? row.tutorialDraftSnapshot,
        publishedAt: row.publishedAt ?? row.published_at,
        viewCount: row.viewCount,
        authorName: row.authorName,
        authorUsername: row.authorUsername,
        authorImage: row.authorImage,
        tags: tagMap.get(row.id) || [],
      }),
    );
  }

  // No tag filter: use standard Drizzle query with optional lang condition
  const langWhere = options?.lang
    ? sql` AND "published_tutorials"."tutorial_draft_snapshot"->'meta'->>'lang' = ${options.lang}`
    : sql``;

  const rows = await db
    .select({
      id: publishedTutorials.id,
      slug: publishedTutorials.slug,
      tutorialDraftSnapshot: publishedTutorials.tutorialDraftSnapshot,
      publishedAt: publishedTutorials.publishedAt,
      viewCount: sql<number>`coalesce(vc.cnt, 0)::int`,
      authorName: users.name,
      authorUsername: users.username,
      authorImage: users.image,
    })
    .from(publishedTutorials)
    .innerJoin(drafts, eq(publishedTutorials.draftRecordId, drafts.id))
    .leftJoin(users, eq(drafts.userId, users.id))
    .leftJoin(
      sql`(SELECT slug, count(*) as cnt FROM events WHERE event_type = 'tutorial_viewed' GROUP BY slug) vc`,
      sql`vc.slug = ${publishedTutorials.slug}`,
    )
    .where(
      sql`to_tsvector('simple', coalesce("published_tutorials"."tutorial_draft_snapshot"->'meta'->>'title','') || ' ' || coalesce("published_tutorials"."slug",'')) @@ plainto_tsquery('simple', ${query})${langWhere}`,
    )
    .orderBy(desc(sql`coalesce(vc.cnt, 0)`))
    .limit(limit);

  const tutorialIds = rows.map((r) => r.id);
  const tagMap = await attachTags(tutorialIds);

  return rows.map((row) =>
    toExploreTutorial({
      id: row.id,
      slug: row.slug,
      tutorialDraftSnapshot: row.tutorialDraftSnapshot,
      publishedAt: row.publishedAt,
      viewCount: row.viewCount,
      authorName: row.authorName,
      authorUsername: row.authorUsername,
      authorImage: row.authorImage,
      tags: tagMap.get(row.id) || [],
    }),
  );
}

export async function listPublishedForExplore(options: {
  page?: number;
  pageSize?: number;
  sort?: 'newest' | 'popular';
  tagSlug?: string;
  tagFilters?: { tagSlug: string; tagType: string }[];
  lang?: string;
}): Promise<{ tutorials: ExploreTutorial[]; total: number }> {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 20;
  const sort = options.sort ?? 'newest';
  const offset = (page - 1) * pageSize;

  // Build filter conditions
  const conditions = [];

  // Multi-dimension tag filtering (D-12): intersect tutorial IDs per dimension
  if (options.tagFilters && options.tagFilters.length > 0) {
    for (const filter of options.tagFilters) {
      const tag = await db
        .select({ id: tutorialTags.id })
        .from(tutorialTags)
        .where(and(
          eq(tutorialTags.slug, filter.tagSlug),
          eq(tutorialTags.tagType, filter.tagType as TagTypeType),
        ))
        .limit(1);
      if (tag.length > 0) {
        const tutorialIdsWithTag = await db
          .select({ tutorialId: tutorialTagRelations.tutorialId })
          .from(tutorialTagRelations)
          .where(eq(tutorialTagRelations.tagId, tag[0].id));
        const ids = tutorialIdsWithTag.map((r) => r.tutorialId);
        if (ids.length > 0) {
          conditions.push(inArray(publishedTutorials.id, ids));
        } else {
          return { tutorials: [], total: 0 };
        }
      } else {
        return { tutorials: [], total: 0 };
      }
    }
  } else if (options.tagSlug) {
    // Backward compat: single tag param (no tagType constraint)
    const tag = await db
      .select({ id: tutorialTags.id })
      .from(tutorialTags)
      .where(eq(tutorialTags.slug, options.tagSlug))
      .limit(1);
    if (tag.length > 0) {
      const tutorialIdsWithTag = await db
        .select({ tutorialId: tutorialTagRelations.tutorialId })
        .from(tutorialTagRelations)
        .where(eq(tutorialTagRelations.tagId, tag[0].id));
      const ids = tutorialIdsWithTag.map((r) => r.tutorialId);
      if (ids.length > 0) {
        conditions.push(inArray(publishedTutorials.id, ids));
      } else {
        return { tutorials: [], total: 0 };
      }
    } else {
      return { tutorials: [], total: 0 };
    }
  }

  // Note: lang filtering is deferred to application-level filtering
  // since it requires JSON field access on tutorialDraftSnapshot

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const orderByClause =
    sort === 'popular'
      ? desc(sql`coalesce(vc.cnt, 0)`)
      : desc(publishedTutorials.publishedAt);

  // Count total
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(publishedTutorials)
    .where(whereClause);
  const total = countResult[0]?.count ?? 0;

  // Fetch page
  const rows = await db
    .select({
      id: publishedTutorials.id,
      slug: publishedTutorials.slug,
      tutorialDraftSnapshot: publishedTutorials.tutorialDraftSnapshot,
      publishedAt: publishedTutorials.publishedAt,
      viewCount: sql<number>`coalesce(vc.cnt, 0)::int`,
      authorName: users.name,
      authorUsername: users.username,
      authorImage: users.image,
    })
    .from(publishedTutorials)
    .innerJoin(drafts, eq(publishedTutorials.draftRecordId, drafts.id))
    .leftJoin(users, eq(drafts.userId, users.id))
    .leftJoin(
      sql`(SELECT slug, count(*) as cnt FROM events WHERE event_type = 'tutorial_viewed' GROUP BY slug) vc`,
      sql`vc.slug = ${publishedTutorials.slug}`,
    )
    .where(whereClause)
    .orderBy(orderByClause)
    .limit(pageSize)
    .offset(offset);

  const tutorialIds = rows.map((r) => r.id);
  const tagMap = await attachTags(tutorialIds);

  let tutorials = rows.map((row) =>
    toExploreTutorial({
      id: row.id,
      slug: row.slug,
      tutorialDraftSnapshot: row.tutorialDraftSnapshot,
      publishedAt: row.publishedAt,
      viewCount: row.viewCount,
      authorName: row.authorName,
      authorUsername: row.authorUsername,
      authorImage: row.authorImage,
      tags: tagMap.get(row.id) || [],
    }),
  );

  // Apply lang filter at application level
  if (options.lang) {
    tutorials = tutorials.filter((t) => t.lang === options.lang);
  }

  // When lang filter is applied, total is inaccurate (from pre-filter count).
  // For current scale this is acceptable; for larger datasets, push lang filter to SQL.
  return { tutorials, total: options.lang ? tutorials.length : total };
}
