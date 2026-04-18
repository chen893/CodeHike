---
phase: tag-system-evolution
plan: 05
name: Tag Detail Page + Tag Relations Table
type: execute
wave: 4
depends_on:
  - tag-system-evolution-03
  - tag-system-evolution-04
files_modified:
  - lib/db/schema.ts
  - lib/repositories/tag-relation-repository.ts
  - lib/services/tag-service.ts
  - app/tags/[slug]/page.tsx
  - components/tags/tag-detail-client.tsx
  - components/tags/follows-client.ts
  - scripts/compute-tag-relations.ts
autonomous: false
requirements:
  - D-14
  - D-15

must_haves:
  truths:
    - "Tag detail page /tags/[slug] loads with tag info, tutorial list, related tags"
    - "Follow button on tag detail page works (client-side optimistic update)"
    - "Tag relations computed from co-occurrence frequency"
    - "Related tags displayed on tag detail page"
  artifacts:
    - path: "app/tags/[slug]/page.tsx"
      provides: "Tag detail server component with SSR"
    - path: "components/tags/tag-detail-client.tsx"
      provides: "Client component for follow button + related tags"
    - path: "components/tags/follows-client.ts"
      provides: "Feature client for follow/unfollow API calls"
    - path: "lib/repositories/tag-relation-repository.ts"
      provides: "Tag relation CRUD + co-occurrence batch computation"
    - path: "lib/db/schema.ts"
      provides: "tagRelations table"
    - path: "scripts/compute-tag-relations.ts"
      provides: "Batch co-occurrence calculation script"
  key_links:
    - from: "app/tags/[slug]/page.tsx"
      to: "lib/services/tag-service.ts"
      via: "getTagDetail(slug) fetches tag + tutorials + related tags"
      pattern: "getTagDetail"
    - from: "components/tags/tag-detail-client.tsx"
      to: "components/tags/follows-client.ts"
      via: "followTag(tagId) / unfollowTag(tagId) API calls"
      pattern: "followTag|unfollowTag"
    - from: "scripts/compute-tag-relations.ts"
      to: "lib/repositories/tag-relation-repository.ts"
      via: "computeCoOccurrence() batch upsert"
      pattern: "computeCoOccurrence"
---

<objective>
Create the tag detail page (/tags/[slug]) with tutorial list, related tags, and follow button, plus the tag relations infrastructure (table + computation script).

Purpose: The tag detail page is the hub for tag discovery and user engagement. It provides a landing page for each tag where users can explore related content and follow tags. Tag relations enable "related tags" recommendations.

Output: A working tag detail page, tag_relations table, co-occurrence computation script, and follow API client.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/tag-system-evolution/tag-system-evolution-CONTEXT.md
@.planning/phases/tag-system-evolution/tag-system-evolution-RESEARCH.md
@.planning/phases/tag-system-evolution/tag-system-evolution-04-SUMMARY.md
@lib/db/schema.ts
@lib/repositories/tag-repository.ts
@lib/services/tag-service.ts
@lib/services/explore-service.ts
@app/u/[username]/page.tsx
@components/tutorial/tags-client.ts
@lib/monitoring/analytics.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Tag relations table + repository + co-occurrence script</name>
  <files>lib/db/schema.ts, lib/repositories/tag-relation-repository.ts, scripts/compute-tag-relations.ts</files>
  <read_first>
    - lib/db/schema.ts (full file -- tutorialTags, tutorialTagRelations table patterns)
    - lib/repositories/tag-repository.ts (full file -- query patterns, toTutorialTag mapper)
    - RESEARCH.md section "Co-occurrence Calculation SQL" for the batch SQL
  </read_first>
  <action>
**D-14: Tag relations via co-occurrence + tagType supplement**

1. In `lib/db/schema.ts`, add the `tagRelations` table:
   ```typescript
   export const tagRelations = pgTable('tag_relations', {
     id: uuid('id').primaryKey().defaultRandom(),
     fromTagId: uuid('from_tag_id')
       .notNull()
       .references(() => tutorialTags.id, { onDelete: 'cascade' }),
     toTagId: uuid('to_tag_id')
       .notNull()
       .references(() => tutorialTags.id, { onDelete: 'cascade' }),
     relationType: varchar('relation_type', { length: 32 }).default('co_occurrence'),
     strength: integer('strength').default(0),
     computedAt: timestamp('computed_at', { withTimezone: true }).defaultNow(),
   }, (table) => [
     uniqueIndex('tag_relations_unique_pair').on(table.fromTagId, table.toTagId),
   ]);
   ```

2. Create `lib/repositories/tag-relation-repository.ts`:
   ```typescript
   import { eq, desc, sql } from 'drizzle-orm';
   import { db } from '../db';
   import { tagRelations, tutorialTags } from '../db/schema';
   import type { TutorialTag } from '../types/api';

   export async function getRelatedTags(tagId: string, limit: number = 10): Promise<(TutorialTag & { strength: number })[]> {
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

     return rows.map(row => ({
       id: row.id,
       name: row.name,
       slug: row.slug,
       tagType: row.tagType ?? null,
       createdAt: row.createdAt,
       strength: row.strength ?? 0,
     }));
   }

   export async function computeCoOccurrence(): Promise<number> {
     // Use raw SQL for the co-occurrence self-join calculation
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

     // Also compute reverse direction (for bidirectional lookup)
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

   export async function deleteStaleRelations(olderThanDays: number = 90): Promise<number> {
     const result = await db
       .delete(tagRelations)
       .where(sql`${tagRelations.computedAt} < NOW() - INTERVAL '${sql.raw(String(olderThanDays))} days'`);
     return result.rowCount ?? 0;
   }
   ```

3. Create `scripts/compute-tag-relations.ts`:
   - Import `computeCoOccurrence` from `lib/repositories/tag-relation-repository`
   - Also add tagType-supplement logic per D-14:
     ```typescript
     // After co-occurrence, supplement with same-tagType relations for tags with no co-occurrence
     await db.execute(sql`
       INSERT INTO tag_relations (from_tag_id, to_tag_id, relation_type, strength)
       SELECT t1.id, t2.id, 'same_type', 0
       FROM tutorial_tags t1
       JOIN tutorial_tags t2 ON t1.tag_type = t2.tag_type AND t1.id < t2.id
       WHERE t1.tag_type IS NOT NULL
       ON CONFLICT (from_tag_id, to_tag_id) DO NOTHING
     `);
     ```
   - Run via `npx tsx scripts/compute-tag-relations.ts`
   - Log: "Computed X co-occurrence relations, Y same-type supplements"

4. Generate Drizzle migration for the new `tagRelations` table.
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>
    - tagRelations table in schema.ts with fromTagId, toTagId, relationType, strength, computedAt
    - uniqueIndex on (fromTagId, toTagId) prevents duplicate pairs
    - getRelatedTags(tagId, limit) returns tags ordered by strength
    - computeCoOccurrence() batch-inserts co-occurrence data using self-join SQL
    - scripts/compute-tag-relations.ts exists and compiles
    - Migration generated for tagRelations table
  </done>
</task>

<task type="auto">
  <name>Task 2: Tag detail page + follow client + tag detail client component</name>
  <files>app/tags/[slug]/page.tsx, components/tags/tag-detail-client.tsx, components/tags/follows-client.ts, lib/services/tag-service.ts</files>
  <read_first>
    - app/u/[username]/page.tsx (full file -- SSR page pattern with generateMetadata, notFound, AppShell)
    - components/tutorial/tags-client.ts (full file -- feature client pattern: readApiErrorMessage, readJsonResponse, withBasePath)
    - lib/services/tag-service.ts (full file -- current orchestration)
    - lib/repositories/tag-repository.ts (getTagBySlug, getTagsForTutorial patterns)
    - lib/monitoring/analytics.ts (trackTagViewed pattern)
  </read_first>
  <action>
**D-15: Tag detail page /tags/[slug] with tutorials + related tags + follow button**

**NOTE:** The follow button in this plan calls `/api/tags/${tagId}/follow` (POST/DELETE/GET), but the follow API endpoint is not built until Plan 06 (Wave 5). Until Plan 06 executes, clicking the follow button will produce a 404 error. This is an intentional phased design -- the client component ships in this plan so the UI is complete, and the API route ships next wave.

1. Create `components/tags/follows-client.ts` following the pattern from `components/tutorial/tags-client.ts`:
   ```typescript
   'use client';

   import { withBasePath } from '@/lib/base-path.js';

   async function readApiErrorMessage(response: Response, fallback: string) {
     try {
       const payload = (await response.json()) as Partial<{ message: string }>;
       return typeof payload.message === 'string' ? payload.message : fallback;
     } catch {
       return fallback;
     }
   }

   export async function followTag(tagId: string): Promise<void> {
     const response = await fetch(withBasePath(`/api/tags/${tagId}/follow`), {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
     });
     if (!response.ok) {
       throw new Error(await readApiErrorMessage(response, '关注标签失败'));
     }
   }

   export async function unfollowTag(tagId: string): Promise<void> {
     const response = await fetch(withBasePath(`/api/tags/${tagId}/follow`), {
       method: 'DELETE',
       headers: { 'Content-Type': 'application/json' },
     });
     if (!response.ok) {
       throw new Error(await readApiErrorMessage(response, '取消关注失败'));
     }
   }

   export async function checkFollowStatus(tagId: string): Promise<boolean> {
     const response = await fetch(withBasePath(`/api/tags/${tagId}/follow`));
     if (!response.ok) return false;
     const data = (await response.json()) as { following: boolean };
     return data.following;
   }
   ```

2. Create `components/tags/tag-detail-client.tsx`:
   ```typescript
   'use client';

   import { useState, useCallback } from 'react';
   import { Button } from '@/components/ui/button';
   import { Badge } from '@/components/ui/badge';
   import { followTag, unfollowTag } from './follows-client';
   import type { TutorialTag } from '@/lib/types/api';

   interface TagDetailClientProps {
     tag: TutorialTag;
     isFollowing: boolean;
     relatedTags: (TutorialTag & { strength: number })[];
   }

   export function TagDetailClient({ tag, isFollowing: initialFollowing, relatedTags }: TagDetailClientProps) {
     const [isFollowing, setIsFollowing] = useState(initialFollowing);
     const [loading, setLoading] = useState(false);

     const handleFollowToggle = useCallback(async () => {
       setLoading(true);
       try {
         if (isFollowing) {
           await unfollowTag(tag.id);
         } else {
           await followTag(tag.id);
         }
         setIsFollowing(!isFollowing);
       } catch (err) {
         console.error('Follow toggle failed:', err);
       } finally {
         setLoading(false);
       }
     }, [isFollowing, tag.id]);

     return (
       <div className="space-y-6">
         {/* Follow button */}
         <Button
           onClick={handleFollowToggle}
           disabled={loading}
           variant={isFollowing ? 'outline' : 'default'}
           className={isFollowing ? '' : 'bg-primary text-primary-foreground'}
         >
           {isFollowing ? '已关注' : '+ 关注'}
         </Button>

         {/* Related tags */}
         {relatedTags.length > 0 && (
           <div className="space-y-3">
             <h3 className="text-sm font-medium text-muted-foreground">相关标签</h3>
             <div className="flex flex-wrap gap-1.5">
               {relatedTags.map(related => (
                 <Badge key={related.id} variant="secondary" className="cursor-pointer hover:bg-primary/10 hover:text-primary">
                   {related.name}
                 </Badge>
               ))}
             </div>
           </div>
         )}
       </div>
     );
   }
   ```

3. Add `getTagDetail` function to `lib/services/tag-service.ts`:
   ```typescript
   import * as tagRelationRepo from '../repositories/tag-relation-repository';

   export async function getTagDetail(slug: string) {
     const tag = await tagRepo.getTagBySlug(slug);
     if (!tag) return null;

     const relatedTags = await tagRelationRepo.getRelatedTags(tag.id, 10);

     return { tag, relatedTags };
   }
   ```
   Note: Tutorial list for the tag is fetched via `explore-service.ts` with tag filter, not duplicated here.

4. Create `app/tags/[slug]/page.tsx` following the pattern from `app/u/[username]/page.tsx`:
   - `generateMetadata` with tag name
   - Default function with params destructure, `notFound()` guard
   - `getCurrentUser()` for follow state
   - Fetch tag detail via `getTagDetail(slug)`
   - Fetch tutorials via `getExploreData({ tag: slug })` (using backward compat for simplicity, since we need all tutorials with this tag regardless of tagType)
   - Fire-and-forget `trackTagViewed(slug, 'tag_page', user?.id)`
   - `AppShell` wrapper with `activePath="/tags"`
   - Render: tag header (name + tagType badge + follow button), related tags, tutorial grid (reuse the same Card layout from explore/page.tsx)
   - Pass serializable data to `TagDetailClient` for the follow button + related tags
   - Tutorial grid rendered server-side (no need for client component for the grid)

   Create directory first: `mkdir -p app/tags/[slug]`
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>
    - app/tags/[slug]/page.tsx renders tag detail with SSR
    - generateMetadata returns tag name in title
    - notFound() returned when tag slug doesn't exist
    - trackTagViewed fires on page load
    - TagDetailClient renders follow button with optimistic update
    - follows-client.ts exports followTag, unfollowTag, checkFollowStatus
    - getTagDetail service function returns tag + related tags
    - Related tags displayed as badges
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> /tags/[slug] page | Untrusted slug param |
| client -> follow API | Auth required for follow/unfollow |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-05-01 | Information Disclosure | Tag detail page | accept | Tag info is public; no PII exposed |
| T-05-02 | Elevation of Privilege | Follow API | mitigate | Auth check on follow/unfollow endpoints (Wave 4 implementation) |
| T-05-03 | Tampering | Co-occurrence script | accept | Manual batch execution; reads only public data |
</threat_model>

<verification>
- `npm test` passes
- `npm run build` succeeds
- Manual: Visit /tags/react (or any existing tag slug), verify page loads with tutorials
- Manual: Verify related tags section appears
- Manual: Click follow button -- will 404 until Plan 06 ships the follow API (intentional phased design)
</verification>

<success_criteria>
- Tag detail page /tags/[slug] renders with tag info and tutorial list
- Related tags displayed from tag_relations data
- Follow button renders (API calls will 404 until Plan 06 ships the follow API endpoint)
- Co-occurrence script compiles and is ready for execution
- npm test passes
</success_criteria>

<output>
After completion, create `.planning/phases/tag-system-evolution/tag-system-evolution-05-SUMMARY.md`
</output>
