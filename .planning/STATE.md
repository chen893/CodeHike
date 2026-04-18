# STATE.md

## Current Position
- **Phase:** tag-system-evolution
- **Current Plan:** 04
- **Status:** in-progress

## Progress
- [x] Plan 01: Bug Fixes + Cleanup + Analytics (COMPLETE)
- [x] Plan 02: Schema Migration + tagType Enum + Backfill + Type Updates (COMPLETE)
- [x] Plan 03: Vocabulary Seeding + AI Hard Constraint + Candidate Queue (COMPLETE)
- [ ] Plan 04: Explore Tab UI + Multi-Dimension Filtering (pending)

## Decisions
- Fixed malformed drizzle 0003_snapshot.json to enable migration generation
- tagType column is nullable for backward compatibility (D-04)
- Backfill script uses batch size of 20 for AI classification
- LANGUAGE_FALLBACK_MAP completely deleted; replaced with minimal getVocabularyFallback (D-10)
- generateTags returns { tags, candidates } to separate vocabulary-matched from new suggestions
- Non-vocabulary AI tags silently routed to candidate queue -- expected behavior

## Last Session
- **Timestamp:** 2026-04-18T19:27:03Z
- **Stopped At:** Completed tag-system-evolution-03-PLAN.md
- **Resume File:** tag-system-evolution-04-PLAN.md
