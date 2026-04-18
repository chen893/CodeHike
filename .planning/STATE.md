# STATE.md

## Current Position
- **Phase:** tag-system-evolution
- **Current Plan:** 05
- **Status:** in-progress

## Progress
- [x] Plan 01: Bug Fixes + Cleanup + Analytics (COMPLETE)
- [x] Plan 02: Schema Migration + tagType Enum + Backfill + Type Updates (COMPLETE)
- [x] Plan 03: Vocabulary Seeding + AI Hard Constraint + Candidate Queue (COMPLETE)
- [x] Plan 04: Explore Tab UI + Multi-Dimension Filtering (COMPLETE)

## Decisions
- Fixed malformed drizzle 0003_snapshot.json to enable migration generation
- tagType column is nullable for backward compatibility (D-04)
- Backfill script uses batch size of 20 for AI classification
- LANGUAGE_FALLBACK_MAP completely deleted; replaced with minimal getVocabularyFallback (D-10)
- generateTags returns { tags, candidates } to separate vocabulary-matched from new suggestions
- Non-vocabulary AI tags silently routed to candidate queue -- expected behavior
- IN() condition intersection for multi-dimension tag filtering in list queries
- Backward-compat ?tag=xxx maps to technology dimension without tagType DB constraint
- Tutorial card tag links use ?technology= instead of ?tag= for forward compatibility

## Last Session
- **Timestamp:** 2026-04-18T19:32:41Z
- **Stopped At:** Completed tag-system-evolution-04-PLAN.md
- **Resume File:** tag-system-evolution-05-PLAN.md
