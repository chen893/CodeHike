---
phase: tag-system-evolution
plan: 06
name: User Tag Follows + Follow API + My Follows Page
type: execute
wave: 5
depends_on:
  - tag-system-evolution-05
files_modified:
  - lib/db/schema.ts
  - lib/repositories/follow-repository.ts
  - lib/services/follow-service.ts
  - app/api/tags/[tagId]/follow/route.ts
  - app/following/page.tsx
  - components/tags/follows-client.ts
  - lib/utils/slug.ts
autonomous: true
requirements:
  - D-16

must_haves:
  truths:
    - "Logged-in users can follow/unfollow tags via API"
    - "'My Follows' page shows tutorial feed from followed tags"
    - "Follow status persists across sessions"
    - "Unauthenticated users redirected from /following"
    - "'following' is in RESERVED_SLUGS preventing route conflicts"
  artifacts:
    - path: "lib/db/schema.ts"
      provides: "userTagFollows table"
      contains: "userTagFollows"
    - path: "lib/repositories/follow-repository.ts"
      provides: "followTag, unfollowTag, getFollowedTags, isFollowingTag, getFollowedTutorials"
    - path: "lib/services/follow-service.ts"
      provides: "Orchestration: followTagBySlug, unfollowTagBySlug, getFollowedTutorials"
    - path: "app/api/tags/[tagId]/follow/route.ts"
      provides: "POST (follow), DELETE (unfollow), GET (check status)"
    - path: "app/following/page.tsx"
      provides: "My Follows page with tutorial feed"
    - path: "lib/utils/slug.ts"
      provides: "'following' added to RESERVED_SLUGS"
      contains: "following"
  key_links:
    - from: "app/api/tags/[tagId]/follow/route.ts"
      to: "lib/services/follow-service.ts"
      via: "POST -> followTagBySlug, DELETE -> unfollowTagBySlug"
      pattern: "followTagBySlug|unfollowTagBySlug"
    - from: "app/following/page.tsx"
      to: "lib/repositories/follow-repository.ts"
      via: "getFollowedTutorials(userId) single-query JOIN"
      pattern: "getFollowedTutorials"
    - from: "components/tags/follows-client.ts"
      to: "app/api/tags/[tagId]/follow/route.ts"
      via: "fetch POST/DELETE/GET"
      pattern: "api/tags.*follow"
---

<objective>
Implement user tag follow system: follow/unfollow API, follow status persistence, and the "My Follows" page showing tutorials from followed tags.

Purpose: User follows transform tags from passive classification to active engagement. The "My Follows" page gives users a reason to return by surfacing tutorials from tags they care about.

Output: Working follow API, persisted follow state, and /following page with tutorial feed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/tag-system-evolution/tag-system-evolution-CONTEXT.md
@.planning/phases/tag-system-evolution/tag-system-evolution-RESEARCH.md
@.planning/phases/tag-system-evolution/tag-system-evolution-05-SUMMARY.md
@lib/db/schema.ts
@lib/repositories/tag-repository.ts
@lib/services/explore-service.ts
@components/tags/follows-client.ts
@lib/services/user-profile-service.ts
@app/tags/page.tsx
@lib/utils/slug.ts
@lib/monitoring/analytics.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: userTagFollows table + follow repository + follow service + API route + RESERVED_SLUGS update</name>
  <files>lib/db/schema.ts, lib/repositories/follow-repository.ts, lib/services/follow-service.ts, app/api/tags/[tagId]/follow/route.ts, lib/utils/slug.ts</files>
  <read_first>
    - lib/db/schema.ts (full file -- userTagFollows location, users table for FK reference, tutorialTagRelations for composite PK pattern)
    - lib/repositories/tag-repository.ts (getTagBySlug for slug->id lookup pattern)
    - lib/services/user-profile-service.ts (thin orchestration pattern: validate -> repo call)
    - app/api/tutorials/[slug]/tags/route.ts (auth + JSON body pattern for API routes)
    - components/tags/follows-client.ts (already created in Plan 05 -- verify API contract matches)
    - lib/utils/slug.ts (RESERVED_SLUGS set -- add 'following')
  </read_first>
  <action>
**D-16: User tag follows**

1. In `lib/utils/slug.ts`, add `'following'` to the RESERVED_SLUGS set (after the existing `'notifications'` entry):
   ```typescript
   const RESERVED_SLUGS = new Set([
     'new',
     'drafts',
     'api',
     '_next',
     'sample',
     'request',
     'preview',
     'explore',
     'tags',
     'u',
     'admin',
     'dashboard',
     'settings',
     'notifications',
     'following',  // My Follows page route -- prevents slug collision
   ]);
   ```

2. In `lib/db/schema.ts`, add the `userTagFollows` table:
   ```typescript
   export const userTagFollows = pgTable('user_tag_follows', {
     userId: text('user_id')
       .notNull()
       .references(() => users.id, { onDelete: 'cascade' }),
     tagId: uuid('tag_id')
       .notNull()
       .references(() => tutorialTags.id, { onDelete: 'cascade' }),
     createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
   }, (table) => [
     primaryKey({ columns: [table.userId, table.tagId] }),
   ]);
   ```

3. Create `lib/repositories/follow-repository.ts`:
   ```typescript
   import { eq, and, desc, inArray } from 'drizzle-orm';
   import { db } from '../db';
   import { userTagFollows, tutorialTags, tutorialTagRelations, publishedTutorials, drafts, users } from '../db/schema';
   import type { TutorialTag } from '../types/api';

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
     // Use the same select shape as getExploreData for consistency
     const tutorials = await db.select({
       id: publishedTutorials.id,
       slug: publishedTutorials.slug,
       title: drafts.title,
       description: drafts.description,
       publishedAt: publishedTutorials.publishedAt,
       authorId: drafts.authorId,
       authorName: users.name,
       authorUsername: users.username,
       stepCount: drafts.stepCount,
       readingTime: drafts.readingTime,
     })
       .from(publishedTutorials)
       .innerJoin(drafts, eq(publishedTutorials.draftId, drafts.id))
       .leftJoin(users, eq(drafts.authorId, users.id))
       .where(inArray(publishedTutorials.id, tutorialIds))
       .orderBy(desc(publishedTutorials.publishedAt));

     return tutorials;
   }
   ```

   Define a `FollowedTutorial` type (or import the appropriate existing type from `lib/types/api.ts` if it already has a tutorial list item shape). Import `publishedTutorials`, `drafts` from schema. Adjust the select field names to match the actual column names in the schema.

4. Create `lib/services/follow-service.ts`:
   ```typescript
   import * as followRepo from '../repositories/follow-repository';
   import * as tagRepo from '../repositories/tag-repository';
   import type { TutorialTag } from '../types/api';

   export async function followTagBySlug(userId: string, tagSlug: string): Promise<void> {
     const tag = await tagRepo.getTagBySlug(tagSlug);
     if (!tag) throw new Error('Tag not found');
     await followRepo.followTag(userId, tag.id);
   }

   export async function unfollowTagBySlug(userId: string, tagSlug: string): Promise<void> {
     const tag = await tagRepo.getTagBySlug(tagSlug);
     if (!tag) throw new Error('Tag not found');
     await followRepo.unfollowTag(userId, tag.id);
   }

   export async function checkFollowStatus(userId: string, tagSlug: string): Promise<boolean> {
     const tag = await tagRepo.getTagBySlug(tagSlug);
     if (!tag) return false;
     return followRepo.isFollowingTag(userId, tag.id);
   }

   export async function getFollowedTags(userId: string): Promise<TutorialTag[]> {
     return followRepo.getFollowedTags(userId);
   }

   export async function getFollowedTutorials(userId: string) {
     return followRepo.getFollowedTutorials(userId);
   }
   ```
   Note: The API route uses tagId directly (from URL), not slug. Add a variant that takes tagId:
   ```typescript
   export async function followTagById(userId: string, tagId: string): Promise<void> {
     await followRepo.followTag(userId, tagId);
   }

   export async function unfollowTagById(userId: string, tagId: string): Promise<void> {
     await followRepo.unfollowTag(userId, tagId);
   }

   export async function isFollowingById(userId: string, tagId: string): Promise<boolean> {
     return followRepo.isFollowingTag(userId, tagId);
   }
   ```

5. Create `app/api/tags/[tagId]/follow/route.ts`:
   ```typescript
   import { NextResponse } from 'next/server';
   import { auth } from '@/auth';
   import { followTagById, unfollowTagById, isFollowingById } from '@/lib/services/follow-service';

   export async function POST(
     req: Request,
     { params }: { params: Promise<{ tagId: string }> },
   ) {
     try {
       const session = await auth();
       if (!session?.user?.id) {
         return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
       }
       const { tagId } = await params;
       await followTagById(session.user.id, tagId);
       return NextResponse.json({ following: true });
     } catch (err: any) {
       console.error('[api/tags/tagId/follow] POST failed:', err);
       return NextResponse.json(
         { message: err.message || '关注失败', code: 'INTERNAL_ERROR' },
         { status: 500 },
       );
     }
   }

   export async function DELETE(
     req: Request,
     { params }: { params: Promise<{ tagId: string }> },
   ) {
     try {
       const session = await auth();
       if (!session?.user?.id) {
         return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
       }
       const { tagId } = await params;
       await unfollowTagById(session.user.id, tagId);
       return NextResponse.json({ following: false });
     } catch (err: any) {
       console.error('[api/tags/tagId/follow] DELETE failed:', err);
       return NextResponse.json(
         { message: err.message || '取消关注失败', code: 'INTERNAL_ERROR' },
         { status: 500 },
       );
     }
   }

   export async function GET(
     req: Request,
     { params }: { params: Promise<{ tagId: string }> },
   ) {
     try {
       const session = await auth();
       if (!session?.user?.id) {
         return NextResponse.json({ following: false });
       }
       const { tagId } = await params;
       const following = await isFollowingById(session.user.id, tagId);
       return NextResponse.json({ following });
     } catch (err: any) {
       console.error('[api/tags/tagId/follow] GET failed:', err);
       return NextResponse.json({ following: false });
     }
   }
   ```

   Create the directory: `mkdir -p app/api/tags/[tagId]/follow`

6. Generate Drizzle migration for the new `userTagFollows` table.
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>
    - userTagFollows table defined in schema.ts with userId + tagId composite PK
    - follow-repository.ts exports followTag, unfollowTag, isFollowingTag, getFollowedTags, getFollowedTutorials
    - getFollowedTutorials uses a single DB query with JOIN + IN (not N+1)
    - follow-service.ts exports followTagById, unfollowTagById, isFollowingById, getFollowedTags, getFollowedTutorials
    - API route POST /api/tags/[tagId]/follow creates follow (auth required)
    - API route DELETE /api/tags/[tagId]/follow removes follow (auth required)
    - API route GET /api/tags/[tagId]/follow returns { following: boolean }
    - Migration generated for userTagFollows table
    - 'following' added to RESERVED_SLUGS in lib/utils/slug.ts
  </done>
</task>

<task type="auto">
  <name>Task 2: "My Follows" page at /following</name>
  <files>app/following/page.tsx</files>
  <read_first>
    - app/tags/page.tsx (full file -- static SSR page pattern with AppShell)
    - app/u/[username]/page.tsx (full file -- SSR page with tutorial grid pattern)
    - lib/services/follow-service.ts (getFollowedTags, getFollowedTutorials from Task 1)
    - lib/repositories/follow-repository.ts (getFollowedTutorials from Task 1 -- single-query pattern)
  </read_first>
  <action>
**D-16: Independent "My Follows" page**

1. Create directory: `mkdir -p app/following`

2. Create `app/following/page.tsx`:
   ```typescript
   import Link from 'next/link';
   import { redirect } from 'next/navigation';
   import { AppShell } from '@/components/app-shell';
   import { Badge } from '@/components/ui/badge';
   import { Button } from '@/components/ui/button';
   import { Card, CardDescription, CardTitle } from '@/components/ui/card';
   import { getCurrentUser } from '@/auth';
   import { generateOgMetadata } from '@/lib/utils/seo';
   import { getFollowedTags, getFollowedTutorials } from '@/lib/services/follow-service';

   export const metadata = {
     ...generateOgMetadata({
       title: '我的关注 — VibeDocs',
       description: '查看你关注的标签下的最新教程。',
       slug: 'following',
     }),
   };

   export default async function FollowingPage() {
     const user = await getCurrentUser();
     if (!user) redirect('/api/auth/signin');

     const followedTags = await getFollowedTags(user.id);
     const allTutorials = await getFollowedTutorials(user.id);

     return (
       <AppShell activePath="/following" user={user}>
         <div className="container-app space-y-8 py-10">
           {/* Header */}
           <div className="space-y-2">
             <h1 className="text-2xl font-bold text-foreground">我的关注</h1>
             <p className="text-sm text-muted-foreground">
               你关注了 {followedTags.length} 个标签
             </p>
           </div>

           {/* Followed tags */}
           {followedTags.length === 0 ? (
             <div className="rounded-xl border border-dashed border-border p-12 text-center">
               <p className="text-sm text-muted-foreground">你还没有关注任何标签。</p>
               <Button asChild className="mt-4 bg-primary text-primary-foreground">
                 <Link href="/explore">去探索标签</Link>
               </Button>
             </div>
           ) : (
             <>
               <div className="flex flex-wrap gap-1.5">
                 {followedTags.map(tag => (
                   <Link key={tag.id} href={`/tags/${tag.slug}`}>
                     <Badge variant="secondary" className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors">
                       {tag.name}
                     </Badge>
                   </Link>
                 ))}
               </div>

               {/* Tutorial feed -- data comes from single getFollowedTutorials query */}
               {allTutorials.length === 0 ? (
                 <div className="rounded-xl border border-dashed border-border p-12 text-center">
                   <p className="text-sm text-muted-foreground">
                     关注的标签下暂无教程。稍后再来看看！
                   </p>
                 </div>
               ) : (
                 <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                   {allTutorials.map(tutorial => (
                     <Link key={tutorial.id} href={`/${tutorial.slug}`} className="group block">
                       <Card className="flex h-full flex-col rounded-lg border-border/60 bg-card p-5 transition-all hover:border-primary/30 hover:-translate-y-1 hover:shadow-lg">
                         {/* Same card layout as explore/page.tsx */}
                         <div className="flex-1 space-y-3">
                           <CardTitle className="text-base font-bold text-foreground group-hover:text-primary line-clamp-2">
                             {tutorial.title}
                           </CardTitle>
                           {tutorial.description && (
                             <CardDescription className="line-clamp-2 text-sm text-muted-foreground">
                               {tutorial.description}
                             </CardDescription>
                           )}
                         </div>
                         <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-3">
                           <div className="flex items-center gap-2 text-xs text-muted-foreground">
                             {tutorial.authorUsername && <span>{tutorial.authorName || tutorial.authorUsername}</span>}
                             <span>{tutorial.stepCount} 步</span>
                             <span>{tutorial.readingTime} 分钟</span>
                           </div>
                           <span className="text-sm text-muted-foreground group-hover:text-primary">→</span>
                         </div>
                       </Card>
                     </Link>
                   ))}
                 </div>
               )}
             </>
           )}
         </div>
       </AppShell>
     );
   }
   ```

   Key difference from original: Instead of N+1 `Promise.all(followedTags.map(tag => getExploreData(...)))`, we call `getFollowedTutorials(user.id)` once -- a single query that JOINs user_tag_follows -> tutorial_tag_relations -> published_tutorials in one shot.
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>
    - /following page requires authentication (redirects to signin if not logged in)
    - Page shows followed tags as clickable badges linking to /tags/[slug]
    - Page shows tutorial feed from all followed tags, sorted by publishedAt desc
    - Tutorial feed uses single getFollowedTutorials query (not N+1 per tag)
    - Empty state when no tags followed: "去探索标签" CTA
    - Empty state when followed tags have no tutorials
    - AppShell with activePath="/following"
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> follow API | Auth required for POST/DELETE; GET works for logged-in users |
| /following page -> auth | Redirects unauthenticated users |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-01 | Elevation of Privilege | Follow API | mitigate | Auth check on POST/DELETE; session.user.id from server-side auth() |
| T-06-02 | Tampering | Follow/unfollow | mitigate | User can only follow/unfollow for their own userId (from session, not from request body) |
| T-06-03 | Information Disclosure | /following page | accept | Shows only the logged-in user's own follows; redirects if not logged in |
</threat_model>

<verification>
- `npm test` passes
- `npm run build` succeeds
- `grep 'following' lib/utils/slug.ts` confirms RESERVED_SLUGS contains 'following'
- Manual: Visit /following while logged out -- redirects to signin
- Manual: Visit /following while logged in -- shows followed tags and tutorials
- Manual: Go to /tags/[slug], click follow, return to /following -- tag appears in followed list
</verification>

<success_criteria>
- Follow API works: POST creates follow, DELETE removes follow, GET returns status
- /following page shows followed tags and tutorial feed
- Tutorial feed uses single DB query (no N+1 per tag)
- Auth required for /following and follow API mutations
- userTagFollows table with composite PK prevents duplicate follows
- 'following' in RESERVED_SLUGS prevents route conflicts
- npm test passes
</success_criteria>

<output>
After completion, create `.planning/phases/tag-system-evolution/tag-system-evolution-06-SUMMARY.md`
</output>
