---
phase: tag-system-evolution
plan: 07
subsystem: api, services, repositories
tags: [tag-management, admin-api, merge, delete, rename, tagType]

# Dependency graph
requires:
  - tag-system-evolution-05
provides:
  - "mergeTagRelations transaction in tag-repository.ts"
  - "deleteTag, renameTag, updateTagType repository functions"
  - "mergeTags, deleteTag, renameTag, updateTagType service functions"
  - "POST /api/admin/tags/merge endpoint"
  - "DELETE /api/admin/tags/[id] endpoint"
  - "PUT /api/admin/tags/[id] endpoint (rename + type update)"
affects: []

# Tech tracking
tech-stack:
  added: []
patterns: [admin-api-auth-check, transaction-based-merge, service-thin-orchestration]

key-files:
  created:
    - app/api/admin/tags/merge/route.ts
    - app/api/admin/tags/[id]/route.ts
  modified:
    - lib/repositories/tag-repository.ts
    - lib/services/tag-service.ts

key-decisions:
  - "Merge transaction logic lives entirely in tag-repository.ts (db.transaction); service is thin orchestration with only input validation"
  - "renameTag uses local generateSlug from tag-repository.ts (not imported from elsewhere) keeping slug generation co-located"
  - "Admin endpoints use TODO comments for future admin role check; currently auth check only requires logged-in user"

patterns-established:
  - "Admin API pattern: auth check via auth() -> session.user.id, TODO comment for admin role, Chinese error messages"
  - "Merge pattern: loop through source relations, skip duplicates, delete source relations + source tag in single transaction"

requirements-completed: []

# Metrics
duration: 1min
completed: 2026-04-19
---

# Phase tag-system-evolution Plan 07: Tag Management API Summary

**Admin tag management API with merge (transactional), delete (cascade), rename (slug regen), and tagType update endpoints**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-18T19:49:40Z
- **Completed:** 2026-04-18T19:51:17Z
- **Tasks:** 2 commits across 2 tasks
- **Files modified:** 4

## Accomplishments
- mergeTagRelations in tag-repository.ts performs atomic merge: migrates tutorial associations to target tag, skips duplicates, deletes source relations and source tag in a single transaction
- deleteTag, renameTag, updateTagType repository functions added to tag-repository.ts
- Thin service orchestration layer in tag-service.ts (mergeTags, deleteTag, renameTag, updateTagType) with no direct DB access
- POST /api/admin/tags/merge endpoint with auth check and input validation
- DELETE /api/admin/tags/[id] endpoint with auth check (FK cascade handles relations)
- PUT /api/admin/tags/[id] endpoint supporting rename (with slug regeneration) and tagType update
- All endpoints include TODO comments for future admin role restriction

## Task Commits

Each task was committed atomically:

1. **Task 1: Repository merge function + tag management service + merge endpoint** - `c0da326` (feat)
2. **Task 2: Tag CRUD API endpoints (delete, rename, update type)** - `a5de886` (feat)

## Files Created/Modified
- `lib/repositories/tag-repository.ts` - Added mergeTagRelations (transaction), deleteTag, renameTag, updateTagType
- `lib/services/tag-service.ts` - Added mergeTags, deleteTag, renameTag, updateTagType thin orchestration functions
- `app/api/admin/tags/merge/route.ts` - POST merge endpoint with auth + validation
- `app/api/admin/tags/[id]/route.ts` - DELETE and PUT endpoints for tag CRUD operations

## Decisions Made
- Merge transaction logic stays in tag-repository.ts following the project's Service/Repository pattern; service layer only validates inputs (e.g., source !== target) and delegates
- renameTag reuses the local generateSlug function already in tag-repository.ts, keeping slug generation co-located with tag data access
- Admin endpoints documented with TODO comments for admin role check since no role system exists yet; current behavior matches existing PUT /api/tutorials/[slug]/tags pattern (any logged-in user)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All 4 source files verified present. Both commits (c0da326, a5de886) verified in git log. SUMMARY.md created at expected path.

---
*Phase: tag-system-evolution*
*Completed: 2026-04-19*
