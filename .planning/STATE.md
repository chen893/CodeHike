# STATE.md

## Current Position
- **Phase:** tag-system-evolution
- **Current Plan:** 07
- **Status:** in-progress

## Progress
- [x] Plan 01: Bug Fixes + Cleanup + Analytics (COMPLETE)
- [x] Plan 02: Schema Migration + tagType Enum + Backfill + Type Updates (COMPLETE)
- [x] Plan 03: Vocabulary Seeding + AI Hard Constraint + Candidate Queue (COMPLETE)
- [x] Plan 04: Explore Tab UI + Multi-Dimension Filtering (COMPLETE)
- [x] Plan 05: Tag Detail Page + Tag Relations Table (COMPLETE)
- [x] Plan 06: User Tag Follows + Follow API + My Follows Page (COMPLETE)

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
- Follow button ships as client component; API endpoint follows in Plan 06 (phased design)
- Related tags link to /tags/[slug] detail pages for deeper tag exploration
- Migration chain renumbered (0000-0004) to fix collision between duplicate 0003 entries
- getFollowedTutorials extracts title/description/stepCount from tutorialDraftSnapshot JSONB matching search-repo pattern
- Follow API uses tagId (UUID) in URL; service provides both by-slug and by-id variants
- /following page route with RESERVED_SLUGS protection against slug collision

## Last Session
- **Timestamp:** 2026-04-18T19:46:18Z
- **Stopped At:** Completed tag-system-evolution-06-PLAN.md
- **Resume File:** tag-system-evolution-07-PLAN.md
