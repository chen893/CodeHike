---
phase: agent-loop
plan: 01
subsystem: ai-generation
tags: [agent-loop, sse, validation, repair, prompt-engineering]

# Dependency graph
requires:
  - phase: tag-system-evolution
    provides: "stable codebase with multi-phase-generator.ts, patch-auto-fix.ts, draft-code.js"
provides:
  - "agent-generator.ts with per-step validation loop and directed repair"
  - "buildRepairPrompt injecting actual code state into repair prompts"
  - "V2Status extended with repairing, replanning, compressing states"
  - "USE_AGENT_LOOP feature flag for gradual rollout"
affects: [agent-loop-02, agent-loop-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-step-immediate-validation, propose-then-apply, directed-repair-with-actual-code, feature-flag-toggle]

key-files:
  created:
    - lib/ai/agent-generator.ts
  modified:
    - lib/ai/step-fill-prompt.ts
    - lib/services/generate-tutorial-draft.ts
    - components/tutorial/generation-progress-types.ts
    - components/tutorial/use-generation-progress.ts

key-decisions:
  - "Outline phase copied verbatim from multi-phase-generator for cache-safe stable prefix (Principle 6)"
  - "Repair prompt replaces normal step-fill prompt entirely on subsequent attempts (attempt > 0)"
  - "UNRECOVERABLE steps marked as degraded in Plan 01; full replan logic deferred to Plan 03"
  - "USE_AGENT_LOOP env var defaults to off, preserving legacy pipeline as default"
  - "Agent generator re-exports all multi-phase-generator types for backward compatibility"

patterns-established:
  - "validateStepPatches: applyContentPatches -> tryAutoFixPatches -> PASS/REPAIRABLE/UNRECOVERABLE triage"
  - "Agent loop inner repair: attempt 0 uses normal prompt, attempts 1-2 use buildRepairPrompt with actual code"
  - "StepOutcome tracking: every step records result, repairCount, patchStrategy, locChange"

requirements-completed: [AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05]

# Metrics
duration: 6min
completed: 2026-04-22
---

# Phase agent-loop Plan 01: Immediate Validation + Directed Repair Summary

**Agent loop orchestrator with per-step PASS/REPAIRABLE/UNRECOVERABLE validation, directed repair prompts injecting actual code state, and backward-compatible SSE events for repair/replan/step-repaired/compress**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-21T17:01:08Z
- **Completed:** 2026-04-21T17:07:06Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created agent-generator.ts (885 lines) with full outline-stepFill-validate pipeline and per-step immediate validation
- Every step-fill is validated with PASS/REPAIRABLE/UNRECOVERABLE triage, auto-fix attempted before marking repairable
- REPAIRABLE steps receive buildRepairPrompt with actual code state injected (not AI's expected code)
- Frontend handles new SSE events (repair, replan, step-repaired, compress) with new V2Status states
- Legacy multi-phase-generator.ts completely untouched, toggled via USE_AGENT_LOOP env var

## Task Commits

Each task was committed atomically:

1. **Task 1: Create agent-generator.ts with validation loop and repair prompt** - `e6f39de` (feat)
2. **Task 2: Integrate agent mode into service layer + frontend SSE handling** - `c73577b` (feat)

## Files Created/Modified
- `lib/ai/agent-generator.ts` - Agent loop core orchestrator: createAgentGenerationStream, validateStepPatches, StepValidationResult, AgentLoopState
- `lib/ai/step-fill-prompt.ts` - Added buildRepairPrompt function with actual code state injection
- `lib/services/generate-tutorial-draft.ts` - Added USE_AGENT_LOOP feature flag and createAgentGenerationStream import
- `components/tutorial/generation-progress-types.ts` - Extended V2Status with repairing, replanning, compressing
- `components/tutorial/use-generation-progress.ts` - Added SSE event handlers for repair, replan, step-repaired, compress

## Decisions Made
- Outline phase copied verbatim from multi-phase-generator to preserve cache-safe stable prefix per architecture Principle 6
- Repair prompt replaces normal step-fill prompt entirely for attempts > 0 (not appended)
- UNRECOVERABLE steps marked as degraded with empty patches in Plan 01; full replan with reviseOutline deferred to Plan 03
- USE_AGENT_LOOP env var defaults off, ensuring zero-risk rollout with legacy as fallback
- Added TutorialStep import to step-fill-prompt.ts for buildRepairPrompt type safety

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed null-to-string type error in onStepRetry call**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `lastError` typed as `string | null` but `onStepRetry` requires `errorMessage: string`
- **Fix:** Extracted `stepErrorMessage` as guaranteed string before passing to hook
- **Files modified:** lib/ai/agent-generator.ts
- **Verification:** npx tsc --noEmit passes
- **Committed in:** e6f39de (Task 1 commit)

**2. [Rule 1 - Bug] Fixed undefined-to-string type error in step-repaired handler**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `data.step!.title` has type `string | undefined` from SSEEventData, incompatible with StepTitles
- **Fix:** Extracted title into const with truthiness guard before spreading into state setter
- **Files modified:** components/tutorial/use-generation-progress.ts
- **Verification:** npx tsc --noEmit passes
- **Committed in:** c73577b (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs - type safety issues caught by TypeScript compiler)
**Impact on plan:** Both auto-fixes were type correctness issues. No scope creep.

## Issues Encountered
- Pre-existing test failure in codebase-structure.test.js (unrelated import pattern check for tutorials/[slug]/tags/route.ts) -- out of scope, deferred

## User Setup Required
None - no external service configuration required. USE_AGENT_LOOP defaults to off.

## Next Phase Readiness
- Agent generator core ready for Plan 02 (Context Distillation + Memory System)
- validateStepPatches can be extended with compression hooks
- AgentLoopState structure ready for token usage tracking and session memory
- SSE event infrastructure ready for compress events (Plan 02)
- Replan SSE events emitted but full replan logic (reviseOutline) deferred to Plan 03

---
*Phase: agent-loop*
*Completed: 2026-04-22*

## Self-Check: PASSED

All created files exist, all commit hashes verified in git log.
