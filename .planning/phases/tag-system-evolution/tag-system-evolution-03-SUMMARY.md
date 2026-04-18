---
phase: tag-system-evolution
plan: 03
subsystem: tags, ai, db-schema
tags: [drizzle-orm, zod, ai-sdk, controlled-vocabulary, candidate-queue, tag-generator]

# Dependency graph
requires:
  - tag-system-evolution-02
provides:
  - "tagCandidates table for unknown tag queue (D-08)"
  - "tag-candidate-repository with create, listPending, approve, reject operations"
  - "getVocabularyGroupedByType and isVocabularyTag repository functions (D-09)"
  - "Vocabulary-constrained AI tag generation with hard constraint prompt (D-07)"
  - "getVocabularyFallback replacing deleted LANGUAGE_FALLBACK_MAP (D-10)"
  - "seed-vocabulary script with hardcoded category/level vocabularies"
  - "tag-api.ts Zod schemas for tag API validation"
affects: [tag-system-evolution-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [vocabulary-constrained AI generation, candidate queue for unknown tags, hard constraint enforcement]

key-files:
  created:
    - lib/repositories/tag-candidate-repository.ts
    - lib/schemas/tag-api.ts
    - scripts/seed-vocabulary.ts
    - drizzle/0003_remarkable_madripoor.sql
  modified:
    - lib/db/schema.ts
    - lib/repositories/tag-repository.ts
    - lib/ai/tag-generator.ts
    - lib/services/tag-service.ts
    - drizzle/meta/0003_snapshot.json
    - drizzle/meta/_journal.json

key-decisions:
  - "LANGUAGE_FALLBACK_MAP completely deleted; replaced with minimal getVocabularyFallback using simple lang->tag name map"
  - "generateTags return type changed from string[] to { tags: string[], candidates: string[] } for vocabulary separation"
  - "Non-vocabulary AI output tags validated via isVocabularyTag and routed to candidate queue"

requirements-completed: [D-07, D-08, D-09, D-10]

# Metrics
duration: 3min
completed: 2026-04-19
---

# Phase tag-system-evolution Plan 03: Vocabulary Seeding + AI Hard Constraint + Candidate Queue Summary

**Controlled vocabulary system with hard-constrained AI tag generation, candidate queue for unknown tags, and deleted LANGUAGE_FALLBACK_MAP**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-18T19:23:40Z
- **Completed:** 2026-04-18T19:27:03Z
- **Tasks:** 2 commits across 2 tasks
- **Files modified:** 10 (created: 4, modified: 6)

## Accomplishments
- tagCandidates table created for unknown tag queue with status tracking (D-08)
- tag-candidate-repository provides full CRUD: create, listPending, approve, reject
- Vocabulary query functions added: getVocabularyGroupedByType and isVocabularyTag (D-09)
- seed-vocabulary.ts script with hardcoded category (10 terms) and level (3 terms) vocabularies
- LANGUAGE_FALLBACK_MAP completely deleted from tag-generator.ts (D-10)
- AI tag generation enforces hard vocabulary constraint: "MUST select ONLY from vocabulary" (D-07)
- tag-service validates each AI output tag against isVocabularyTag; non-matching go to candidate queue
- Drizzle migration generated for tagCandidates table
- All 209 tests pass (0 failures)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tag_candidates table + vocabulary repository + seed script** - `ead09b3` (feat)
2. **Task 2: Enforce hard constraint on AI tag generation + delete LANGUAGE_FALLBACK_MAP** - `e83947f` (feat)

## Files Created/Modified
- `lib/db/schema.ts` - Added tagCandidates table for unknown tag queue
- `lib/repositories/tag-candidate-repository.ts` - Candidate queue CRUD: createCandidate, listPendingCandidates, approveCandidate, rejectCandidate
- `lib/repositories/tag-repository.ts` - Added getVocabularyGroupedByType and isVocabularyTag functions
- `lib/ai/tag-generator.ts` - Deleted LANGUAGE_FALLBACK_MAP and getFallbackTags; added vocabulary-constrained generation with candidates output
- `lib/services/tag-service.ts` - Added vocabulary fetch, isVocabularyTag validation, and candidate queue routing
- `lib/schemas/tag-api.ts` - Zod schemas for tagType filter, tag merge, and follow requests
- `scripts/seed-vocabulary.ts` - One-time vocabulary seeding from hardcoded category/level + high-frequency tags
- `drizzle/0003_remarkable_madripoor.sql` - Migration: CREATE TYPE + CREATE TABLE tag_candidates + ALTER TABLE
- `drizzle/meta/0003_snapshot.json` - Updated migration snapshot
- `drizzle/meta/_journal.json` - Updated migration journal

## Decisions Made
- LANGUAGE_FALLBACK_MAP completely deleted rather than deprecated; getVocabularyFallback uses a minimal lang->tag name map (not a full fallback map)
- generateTags return type changed from `string[]` to `{ tags: string[], candidates: string[] }` to cleanly separate vocabulary-matched tags from new suggestions
- Non-vocabulary AI tags are silently routed to candidate queue without logging warnings -- this is expected behavior, not an error condition

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## Next Phase Readiness
- Controlled vocabulary infrastructure fully in place
- AI tag generation constrained to vocabulary with candidate queue escape valve
- Ready for tag-system-evolution-04 (Explore tab UI + multi-dimension filtering)
- Vocabulary seeding script ready to run when DB is migrated (requires DATABASE_URL)

## Self-Check: PASSED

All 10 source files verified present. Both commits verified in git log (ead09b3, e83947f). LANGUAGE_FALLBACK_MAP constant deleted (only comment references remain). generateTags signature includes vocabulary parameter. tag-service imports candidateRepo.

---
*Phase: tag-system-evolution*
*Completed: 2026-04-19*
