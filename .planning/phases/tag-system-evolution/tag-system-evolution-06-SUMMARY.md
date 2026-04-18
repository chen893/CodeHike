---
phase: tag-system-evolution
plan: 06
subsystem: database, api, ui
tags: [user-follows, follow-api, my-follows-page, drizzle-orm, ssr]

# Dependency graph
requires:
  - tag-system-evolution-05
provides:
  - "userTagFollows table with userId+tagId composite PK"
  - "follow-repository with followTag, unfollowTag, isFollowingTag, getFollowedTags, getFollowedTutorials"
  - "follow-service with by-slug and by-id orchestration variants"
  - "API route POST/DELETE/GET /api/tags/[tagId]/follow with auth checks"
  - "My Follows page at /following with SSR tutorial feed"
  - "'following' in RESERVED_SLUGS preventing route conflicts"
affects: []

# Tech tracking
tech-stack:
  added: []
patterns: [follow-api-auth-check, single-query-join-in-tutorial-fetch, jsonb-meta-extraction]

key-files:
  created:
    - lib/repositories/follow-repository.ts
    - lib/services/follow-service.ts
    - app/api/tags/[tagId]/follow/route.ts
    - app/following/page.tsx
    - drizzle/0005_medical_the_professor.sql
  modified:
    - lib/db/schema.ts
    - lib/utils/slug.ts

key-decisions:
  - "getFollowedTutorials extracts title/description/stepCount from tutorialDraftSnapshot JSONB (not drafts table) matching search-repository pattern"
  - "API route uses tagId (UUID) in URL path; service provides both by-slug and by-id variants"

patterns-established:
  - "Follow API: auth check via auth() -> session.user.id, userId from session never from request body"
  - "Tutorial list from followed tags: 3-step query (followed tag IDs -> distinct tutorial IDs -> published tutorials) avoiding N+1"

requirements-completed: [D-16]

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase tag-system-evolution Plan 06: User Tag Follows + Follow API + My Follows Page Summary

**User tag follow system with composite PK table, follow/unfollow API endpoint, and /following SSR page showing tutorial feed from followed tags**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-18T19:42:45Z
- **Completed:** 2026-04-18T19:46:18Z
- **Tasks:** 2 commits across 2 tasks
- **Files modified:** 9

## Accomplishments
- userTagFollows table with composite PK (userId, tagId) and cascade deletes on both FKs
- Follow API at /api/tags/[tagId]/follow supporting POST (follow), DELETE (unfollow), GET (check status)
- My Follows page at /following with auth redirect, followed tag badges, and tutorial feed
- getFollowedTutorials uses 3-step query pattern to avoid N+1 (followed tag IDs -> distinct tutorial IDs -> published tutorials)
- 'following' added to RESERVED_SLUGS preventing slug/route collision

## Task Commits

Each task was committed atomically:

1. **Task 1: userTagFollows table + follow repository + follow service + API route + RESERVED_SLUGS update** - `830039f` (feat)
2. **Task 2: My Follows page at /following** - `f04b32a` (feat)

## Files Created/Modified
- `lib/db/schema.ts` - Added userTagFollows table with userId+tagId composite PK, FK to users and tutorialTags with cascade deletes
- `lib/utils/slug.ts` - Added 'following' to RESERVED_SLUGS set
- `lib/repositories/follow-repository.ts` - followTag, unfollowTag, isFollowingTag, getFollowedTags, getFollowedTutorials with JSONB meta extraction
- `lib/services/follow-service.ts` - Orchestration layer with by-slug and by-id variants
- `app/api/tags/[tagId]/follow/route.ts` - POST/DELETE/GET handlers with auth checks
- `app/following/page.tsx` - SSR My Follows page with auth redirect, tag badges, tutorial grid
- `drizzle/0005_medical_the_professor.sql` - Migration for user_tag_follows table
- `drizzle/meta/_journal.json` - Updated journal with entry idx 5
- `drizzle/meta/0005_snapshot.json` - Migration snapshot

## Decisions Made
- getFollowedTutorials extracts title/description/stepCount/readingTime from tutorialDraftSnapshot JSONB at application level (matching tutorial-search-repository.ts pattern), since the drafts table stores these fields inside JSONB, not as top-level columns
- API route uses tagId (UUID) in URL path; service provides both by-slug variants (for tag detail page) and by-id variants (for API route) to avoid unnecessary slug lookups
- Follows client (from Plan 05) already matches the API contract -- POST/DELETE/GET to /api/tags/${tagId}/follow with JSON response { following: boolean }

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getFollowedTutorials referencing non-existent drafts columns**
- **Found during:** Task 1 (follow-repository.ts implementation)
- **Issue:** Plan's code sample selected `drafts.title`, `drafts.description`, `drafts.stepCount`, `drafts.readingTime` which do not exist as top-level columns -- they are inside `tutorialDraftSnapshot` JSONB
- **Fix:** Rewrote to select `publishedTutorials.tutorialDraftSnapshot` and extract meta at application level via `toFollowedTutorial()` helper, matching the established pattern in tutorial-search-repository.ts
- **Files modified:** lib/repositories/follow-repository.ts
- **Verification:** All 209 tests pass
- **Committed in:** 830039f (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Bug fix necessary for correctness. The plan's code sample would have failed at runtime. No scope creep.

## Next Phase Readiness
- Follow system fully wired: follows-client.ts (Plan 05) -> API route (this plan) -> follow-service -> follow-repository -> userTagFollows table
- Tag detail page follow button now fully functional (previously returned 404)
- /following page shows tutorial feed from followed tags
- Plan 05 stubs (follow API 404, isFollowing always false) are now resolved

## Self-Check: PASSED

All 7 source files verified present. Both commits (830039f, f04b32a) verified in git log. SUMMARY.md created at expected path.

---
*Phase: tag-system-evolution*
*Completed: 2026-04-19*
