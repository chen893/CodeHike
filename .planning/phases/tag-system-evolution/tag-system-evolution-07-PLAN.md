---
phase: tag-system-evolution
plan: 07
name: Tag Management API
type: execute
wave: 5
depends_on:
  - tag-system-evolution-05
files_modified:
  - app/api/admin/tags/merge/route.ts
  - app/api/admin/tags/[id]/route.ts
  - lib/services/tag-service.ts
  - lib/repositories/tag-repository.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Admin can merge two tags (source tags tutorials + relations migrated to target)"
    - "Admin can delete a tag (cascade removes tutorial associations)"
    - "Admin can rename a tag (slug regenerated)"
    - "Admin can change a tag's tagType"
  artifacts:
    - path: "app/api/admin/tags/merge/route.ts"
      provides: "POST merge endpoint"
    - path: "app/api/admin/tags/[id]/route.ts"
      provides: "DELETE, PUT (rename/type) endpoints"
    - path: "lib/services/tag-service.ts"
      provides: "mergeTags, deleteTag, renameTag, updateTagType service functions"
    - path: "lib/repositories/tag-repository.ts"
      provides: "mergeTagRelations repository function"
  key_links:
    - from: "app/api/admin/tags/merge/route.ts"
      to: "lib/services/tag-service.ts"
      via: "mergeTags(sourceId, targetId)"
      pattern: "mergeTags"
    - from: "lib/services/tag-service.ts"
      to: "lib/repositories/tag-repository.ts"
      via: "mergeTagRelations(sourceId, targetId)"
      pattern: "mergeTagRelations"
    - from: "app/api/admin/tags/[id]/route.ts"
      to: "lib/services/tag-service.ts"
      via: "deleteTag, renameTag, updateTagType"
      pattern: "deleteTag|renameTag|updateTagType"
---

<objective>
Create tag management API endpoints for admin operations: merge, delete, rename, and update tagType.

Purpose: As the controlled vocabulary takes shape, operators need tools to manage tags -- merge duplicates, delete orphans, rename tags, and adjust tagType assignments. These admin endpoints provide that capability.

Output: Admin API routes under /api/admin/tags/ with merge, delete, rename, and updateType operations.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/tag-system-evolution/tag-system-evolution-CONTEXT.md
@.planning/phases/tag-system-evolution/tag-system-evolution-RESEARCH.md
@.planning/phases/tag-system-evolution/tag-system-evolution-03-SUMMARY.md
@lib/services/tag-service.ts
@lib/repositories/tag-repository.ts
@lib/schemas/tag-api.ts
@app/api/tutorials/[slug]/tags/route.ts
@lib/api/route-errors.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Repository merge function + tag management service + merge endpoint</name>
  <files>lib/repositories/tag-repository.ts, lib/services/tag-service.ts, app/api/admin/tags/merge/route.ts</files>
  <read_first>
    - lib/repositories/tag-repository.ts (full file -- existing query patterns, transaction usage)
    - lib/services/tag-service.ts (full file -- existing service functions)
    - lib/schemas/tag-api.ts (tagMergeRequestSchema from Plan 03)
    - app/api/tutorials/[slug]/tags/route.ts (auth + validation pattern)
    - lib/api/route-errors.ts (getRouteErrorMessage helper)
  </read_first>
  <action>
**Tag management API -- merge, delete, rename, updateType**

**Repository layer (tag-repository.ts):** Add the following new function to keep all db.transaction logic in the repository:

```typescript
/**
 * Merge source tag into target tag atomically.
 * Migrates all tutorial associations to target, then deletes source.
 * Returns void -- caller validates inputs before calling.
 */
export async function mergeTagRelations(sourceTagId: string, targetTagId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Get all tutorial IDs associated with the source tag
    const sourceRelations = await tx
      .select({ tutorialId: tutorialTagRelations.tutorialId })
      .from(tutorialTagRelations)
      .where(eq(tutorialTagRelations.tagId, sourceTagId));

    // For each source tutorial, ensure target tag is associated
    for (const rel of sourceRelations) {
      const [existing] = await tx
        .select()
        .from(tutorialTagRelations)
        .where(and(
          eq(tutorialTagRelations.tutorialId, rel.tutorialId),
          eq(tutorialTagRelations.tagId, targetTagId),
        ));
      if (!existing) {
        await tx.insert(tutorialTagRelations).values({
          tutorialId: rel.tutorialId,
          tagId: targetTagId,
        });
      }
    }

    // Delete all source tag relations
    await tx.delete(tutorialTagRelations)
      .where(eq(tutorialTagRelations.tagId, sourceTagId));

    // Delete the source tag
    await tx.delete(tutorialTags)
      .where(eq(tutorialTags.id, sourceTagId));
  });
}
```

Import `and` from drizzle-orm if not already imported. Import `tutorialTagRelations`, `tutorialTags` from schema if not already imported.

**Service layer (tag-service.ts):** Add thin orchestration functions -- NO db.transaction or direct DB queries here:

```typescript
import * as tagRepo from '../repositories/tag-repository';

export async function mergeTags(sourceTagId: string, targetTagId: string): Promise<void> {
  if (sourceTagId === targetTagId) throw new Error('Cannot merge tag into itself');
  await tagRepo.mergeTagRelations(sourceTagId, targetTagId);
}

export async function deleteTag(tagId: string): Promise<void> {
  // Cascade: tutorialTagRelations deleted by FK ON DELETE CASCADE
  // tagRelations deleted by FK ON DELETE CASCADE
  await tagRepo.deleteTag(tagId);
}

export async function renameTag(tagId: string, newName: string): Promise<TutorialTag> {
  return tagRepo.renameTag(tagId, newName);
}

export async function updateTagType(tagId: string, tagType: 'technology' | 'category' | 'level' | null): Promise<TutorialTag> {
  return tagRepo.updateTagType(tagId, tagType);
}
```

Add corresponding simple repository functions to tag-repository.ts for deleteTag, renameTag, updateTagType:

```typescript
export async function deleteTag(tagId: string): Promise<void> {
  await db.delete(tutorialTags).where(eq(tutorialTags.id, tagId));
}

export async function renameTag(tagId: string, newName: string): Promise<TutorialTag> {
  const newSlug = generateSlug(newName) || 'tag';
  const [row] = await db.update(tutorialTags)
    .set({ name: newName, slug: newSlug })
    .where(eq(tutorialTags.id, tagId))
    .returning();
  if (!row) throw new Error('Tag not found');
  return { id: row.id, name: row.name, slug: row.slug, tagType: row.tagType ?? null, createdAt: row.createdAt };
}

export async function updateTagType(tagId: string, tagType: 'technology' | 'category' | 'level' | null): Promise<TutorialTag> {
  const [row] = await db.update(tutorialTags)
    .set({ tagType })
    .where(eq(tutorialTags.id, tagId))
    .returning();
  if (!row) throw new Error('Tag not found');
  return { id: row.id, name: row.name, slug: row.slug, tagType: row.tagType ?? null, createdAt: row.createdAt };
}
```

Import `generateSlug` from `'../utils/slug'` if not already imported.

**API route:** Create directory: `mkdir -p app/api/admin/tags/merge`

Create `app/api/admin/tags/merge/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { mergeTags } from '@/lib/services/tag-service';
import { getRouteErrorMessage } from '@/lib/api/route-errors';

// TODO: [admin-role] Add admin role check when role system is implemented.
// Currently any logged-in user can access these endpoints.
// These destructive operations (merge, delete) should be restricted to admin role only.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ message: '请求体不是合法的 JSON', code: 'INVALID_JSON' }, { status: 400 });
    }

    const data = body as Record<string, unknown>;
    const sourceTagId = data.sourceTagId;
    const targetTagId = data.targetTagId;

    if (typeof sourceTagId !== 'string' || typeof targetTagId !== 'string') {
      return NextResponse.json(
        { message: 'sourceTagId 和 targetTagId 必须是字符串', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    await mergeTags(sourceTagId, targetTagId);
    return NextResponse.json({ message: '标签合并成功' });
  } catch (err: any) {
    console.error('[api/admin/tags/merge] POST failed:', err);
    return NextResponse.json(
      { message: getRouteErrorMessage(err, '标签合并失败'), code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
```
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>
    - mergeTagRelations in tag-repository.ts handles the full transaction (no db access in service)
    - mergeTags service function delegates to tagRepo.mergeTagRelations
    - deleteTag, renameTag, updateTagType repository functions exist in tag-repository.ts
    - Service functions are thin orchestration -- no direct db calls
    - POST /api/admin/tags/merge endpoint requires auth and validates input
    - TODO comment in merge route notes future admin role requirement
    - generateSlug exported from lib/utils/slug.ts (already exported)
  </done>
</task>

<task type="auto">
  <name>Task 2: Tag CRUD API endpoints (delete, rename, update type)</name>
  <files>app/api/admin/tags/[id]/route.ts</files>
  <read_first>
    - app/api/tutorials/[slug]/tags/route.ts (auth + params pattern)
    - lib/api/route-errors.ts (getRouteErrorMessage)
    - lib/services/tag-service.ts (deleteTag, renameTag, updateTagType from Task 1)
  </read_first>
  <action>
1. Create directory: `mkdir -p app/api/admin/tags/[id]`

2. Create `app/api/admin/tags/[id]/route.ts`:
   ```typescript
   import { NextResponse } from 'next/server';
   import { auth } from '@/auth';
   import { deleteTag, renameTag, updateTagType } from '@/lib/services/tag-service';
   import { getRouteErrorMessage } from '@/lib/api/route-errors';

   // TODO: [admin-role] Add admin role check when role system is implemented.
   // These destructive operations (delete, rename, type change) should be
   // restricted to admin role only. Currently any logged-in user can access.

   export async function DELETE(
     req: Request,
     { params }: { params: Promise<{ id: string }> },
   ) {
     try {
       const session = await auth();
       if (!session?.user?.id) {
         return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
       }

       const { id } = await params;
       await deleteTag(id);
       return NextResponse.json({ message: '标签已删除' });
     } catch (err: any) {
       console.error('[api/admin/tags/id] DELETE failed:', err);
       return NextResponse.json(
         { message: getRouteErrorMessage(err, '删除标签失败'), code: 'INTERNAL_ERROR' },
         { status: 500 },
       );
     }
   }

   export async function PUT(
     req: Request,
     { params }: { params: Promise<{ id: string }> },
   ) {
     try {
       const session = await auth();
       if (!session?.user?.id) {
         return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
       }

       const { id } = await params;

       let body: unknown;
       try { body = await req.json(); } catch {
         return NextResponse.json({ message: '请求体不是合法的 JSON', code: 'INVALID_JSON' }, { status: 400 });
       }

       const data = body as Record<string, unknown>;

       // Support both rename and type update in one request
       if (data.name && typeof data.name === 'string') {
         const tag = await renameTag(id, data.name);
         return NextResponse.json(tag);
       }

       if (data.tagType !== undefined) {
         const validTypes = ['technology', 'category', 'level', null];
         if (data.tagType !== null && !validTypes.includes(data.tagType)) {
           return NextResponse.json(
             { message: 'tagType 必须是 technology/category/level 或 null', code: 'VALIDATION_ERROR' },
             { status: 400 },
           );
         }
         const tag = await updateTagType(id, data.tagType as any);
         return NextResponse.json(tag);
       }

       return NextResponse.json(
         { message: '请提供 name 或 tagType 字段', code: 'VALIDATION_ERROR' },
         { status: 400 },
       );
     } catch (err: any) {
       console.error('[api/admin/tags/id] PUT failed:', err);
       return NextResponse.json(
         { message: getRouteErrorMessage(err, '更新标签失败'), code: 'INTERNAL_ERROR' },
         { status: 500 },
       );
     }
   }
   ```
  </action>
  <verify>
    <automated>npm test</automated>
  </verify>
  <done>
    - DELETE /api/admin/tags/[id] deletes a tag (auth required)
    - PUT /api/admin/tags/[id] with { name } renames tag and regenerates slug
    - PUT /api/admin/tags/[id] with { tagType } updates the tagType enum value
    - PUT /api/admin/tags/[id] validates tagType is one of technology/category/level/null
    - All endpoints require authentication
    - TODO comment in route notes future admin role requirement
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| admin user -> management API | Auth required; currently any logged-in user can manage tags. TODO: admin role check pending role system implementation |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-01 | Elevation of Privilege | Tag management API | mitigate | Auth required. TODO comment marks future admin role restriction. Tag mutations are low-risk (no PII, reversible via merge) but should be admin-only when role system exists |
| T-07-02 | Tampering | Merge source/target IDs | mitigate | UUID validation via Drizzle; server-side existence check before merge |
| T-07-03 | Denial of Service | Merge operation | accept | Transaction-based; bounded by number of tutorial associations per tag |
</threat_model>

<verification>
- `npm test` passes
- `npm run build` succeeds
</verification>

<success_criteria>
- Merge API migrates relations and deletes source tag atomically
- Merge transaction logic lives in tag-repository.ts (service is thin orchestration)
- Delete API removes tag with FK cascade
- Rename API updates name and regenerates slug
- UpdateType API changes tagType enum value
- All admin endpoints require authentication
- TODO comments present for future admin role requirement
- npm test passes
</success_criteria>

<output>
After completion, create `.planning/phases/tag-system-evolution/tag-system-evolution-07-SUMMARY.md`
</output>
