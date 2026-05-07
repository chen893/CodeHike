# V3 Implementation Issues

## 2026-04-30 Agent Loop Turn Budget

### Issue: fixed `MAX_TURNS=30` blocked long outlines before the failed step could run

- Phenomenon:
  A 36-step draft failed at Step 28 with `Step 28 failed after 3 repairs: unknown error`, while the generation job had only persisted 27 steps and the agent debug log had no Step 28 validation event.
- Root cause:
  Agent loop turns were capped at a fixed 30, and the executor checked the next turn with an inclusive threshold. For a 36-step outline, one first-pass attempt per step already needs 36 turns before repair/replan overhead. When the budget was exhausted before a step attempt, `lastError` stayed null, so the outer error formatter fell back to `unknown error` and incorrectly implied three repairs.
- Fix:
  Replaced the fixed cap with a step-scaled budget (`max(40, steps + ceil(steps * 0.35) + maxReplans * 2 + 4)`), changed max-turn abort semantics to trigger only after the budget is exceeded, and set an explicit turn-budget error when a step cannot start. The final step-fill error now distinguishes budget exhaustion from repair exhaustion.

### Issue: failed partial drafts did not expose the saved-progress retry path in the workspace banner

- Phenomenon:
  After a mid-generation failure, the draft workspace failure banner only showed outline review and full outline regeneration actions, even though the backend had a `retry-from-step` recovery path and the partial draft already contained the completed prefix.
- Root cause:
  The in-progress generation overlay could derive `failedStepIndex` from the terminal generation job, but the normal draft workspace only received the serialized draft record. It did not derive a resume step from `tutorialDraft.steps.length` plus the saved `generationOutline`, so the existing `retryFromFailedStep()` controller action was never exposed.
- Fix:
  Added `deriveFailedGenerationStepIndex()` for draft workspace state. It resumes from the first missing outline step when partial progress exists and falls back to parsing persisted Step error messages. The workspace failure banner now shows `从当前进度继续生成` and routes it to the existing `retryDraftFromStepRequest` flow.

### Issue: retry-from-step could generate patches against stale or misrouted multi-file code

- Phenomenon:
  Retrying Step 28 produced `Patch 目标文件 "undefined" 不存在于当前文件集中`, then after file routing was corrected surfaced a real `find` mismatch against a stale TODO implementation.
- Root cause:
  Multi-file tutorials may store `meta.fileName` as a repository label rather than an actual file path. `normalizeBaseCode()` trusted that value as the primary file, so patches without an explicit `file` could be routed to an invalid target. The single-step regeneration prompt also only listed step titles and did not include the exact current code state before the target step, so the model guessed an older TODO-shaped snippet.
- Fix:
  `normalizeBaseCode()` now ignores `meta.fileName` unless it exists in the baseCode file map, and `applyContentPatches()` can infer an omitted patch file when the `find` text uniquely matches one current file. It also treats `"undefined"`, `"null"`, `"auto"`, and `自动` patch file values as omitted. `buildRegenerateStepPrompt()` now includes the exact current code snapshot before the regenerated step and explicitly constrains patch files to real paths from that snapshot.

## 2026-04-30 Structured Output Adapter

### Issue: structured output contract is split between native `Output.object` and manual text parsing

- Phenomenon:
  AI generation currently mixes AI SDK native structured output with manual `generateText()` text parsing. The native path uses `Output.object({ schema })`, while retrieval and several repair/finalization branches still parse JSON from free-form model text. This makes provider/model capability differences leak into planner, executor, multi-phase generation, tag generation, and tutorial regeneration code.
- Root cause:
  The codebase has model capability detection, but it only distinguishes broad structured-output support. It does not model the practical strategy choices needed for openai-compatible providers: native schema output, forced output tool, JSON object mode, tools plus native output in one call, and forced specific tool choice. Because default `MiniMax-M2.7` is configured as `manual`, text parsing became a mainline protocol instead of a last fallback.
- Planned remediation:
  Keep Vercel AI SDK v6, but add a provider-aware structured output adapter. The adapter should choose between `Output.object`, forced output tool calls, JSON object mode, and prompted JSON fallback; centralize Zod validation, retry, telemetry, and error wrapping; and make `parseJsonFromText()` an internal last-resort fallback only. The detailed design is documented in `docs/structured-output-adapter-plan.md`.
- Fix:
  Added `lib/ai/structured-output-adapter.ts` and routed agent runtime, default multi-phase generation, tag generation, step regeneration, and legacy `agent-context.fullReplan()` through it. Business call sites no longer import `parseJsonFromText()` directly; a structure test enforces that only the adapter may use it. `finalize-tool-call-json.ts` was removed because its role is now covered by the adapter's forced output tool and prompted JSON fallback paths.

## 2026-04-29 Agent Runtime Refactor Assessment

### Issue: agent loop checkpoint recovery did not verify committed code state or persist revised outlines

- Phenomenon:
  The agent loop had committed-step resume, but a failed run after revise-tail or compression replan could resume from the old `outlineSnapshot`. Resume also trusted `tutorialDraft.steps.length` without checking whether the partial draft still matched `agentState.lastCommittedSnapshotHash`. In addition, partial draft checkpoint write failures were logged and swallowed, so a run could keep generating after losing its durable recovery boundary.
- Root cause:
  The runtime treated `agentState.checkpointIndex` as the control boundary and `drafts.tutorialDraft` as the code truth, but did not enforce the hash relationship between them. Replan updated the in-memory outline only, while the service lifecycle hook kept using the initial cached outline for partial draft assembly and job snapshots. The debug trace logger also used module-level mutable state, so concurrent debug runs were not clearly attributable to a specific generation job.
- Fix:
  Added resume checkpoint validation in `checkpoint-adapter.ts`: committed partial drafts are hashed before resume, hash mismatches disable resume, and stale checkpoint indexes are realigned to the partial draft truth. Replans now call the outline persistence hook before continuing, update step/turn budgets when the revised outline length changes, and partial checkpoint write failures abort the generation so `markGenerationFailed()` records a terminal state. Agent debug traces now use per-run indexes, unique filenames, and job/draft/model metadata, with structured-output telemetry routed into the trace when debugging is enabled.

### Issue: `agent-generator` has agent-loop behaviors, but its runtime state and tool boundaries are only half-landed

- Phenomenon:
  The current `USE_AGENT_LOOP=1` path already performs per-step validation, directed repair, revise-tail, and context compression. However, the runtime still behaves like a large controller with embedded heuristics instead of a fully stateful agent runtime.
  In particular, `draft_generation_jobs.agentState` exists in DB schema but is not wired through the generation job schema/types/repository/service path, so session memory, distilled context, and checkpoint metadata remain process-local.
- Root cause:
  The first implementation focused on proving the loop behavior inside `lib/ai/agent-generator.ts`, but did not complete the surrounding architecture work:
  state persistence, policy extraction, runtime module boundaries, and explicit tool capability layers were left partial.
- Planned remediation:
  Perform a staged refactor rather than incremental branch growth inside the existing controller:
  1. make `agentState` a real persisted contract;
  2. split planner / executor / recovery-policy / context-manager / checkpoint-store modules;
  3. turn critique, repair, replan, and compression signals into runtime policy inputs instead of log-only helpers.
  The proposed target architecture and rollout plan are documented in `docs/agent-generator-refactor-plan.md`.

### Issue: generation job progress and committed checkpoint semantics were drifting apart

- Phenomenon:
  The service updated `draft_generation_jobs.currentStepIndex` as soon as `onStepCompleted` fired, but the actual partial draft was only persisted later in `onStepFilled`. If the process died between those two hooks, the job row could claim step `N` had committed while `drafts.tutorialDraft` still only contained steps `0..N-1`.
- Root cause:
  Progress reporting and recovery state were sharing the same fields. `currentStepIndex` was being used both as UI progress and as an implied resume boundary, but only the partial draft is the real persisted code truth.
- Fix:
  Introduced a persisted `agentState` contract and moved committed-step checkpoint writes behind successful partial draft persistence. The job row can still expose in-flight `currentStepIndex` for UI progress, but resume now derives its real start boundary from `tutorialDraft.steps.length` and stores the last committed checkpoint separately in `agentState.checkpointIndex`.

### Issue: runtime module extraction drifted unless the service boundary also carried the new semantics

- Phenomenon:
  `planner.ts`, `executor.ts`, and `context-manager.ts` had already been introduced, but `lib/ai/agent-generator.ts` still duplicated parts of the old repair loop, compression wiring, and critique logic. That left two problems: the orchestrator was still too large to reason about, and runtime signals like `replanned` outcomes or compression-driven advisories were not consistently propagated to persisted state and quality metrics.
- Root cause:
  The first extraction pass moved code into helper modules but did not finish the integration layer. The old inline branches remained partially active, so the runtime facade and the service lifecycle hooks were no longer describing exactly the same behavior.
- Fix:
  Finished Phase 2-5 integration by routing outline resolution through `planner.ts`, step execution through `executor.ts`, and context compression through `context-manager.ts`, while keeping `agent-generator.ts` focused on SSE orchestration and final assembly. The service now receives step outcome kinds on `onStepCompleted`, resets `consecutiveRepairFailures` on committed steps, tracks `consecutiveDegradedSteps` for `replanned` outcomes, passes `agentMetrics` into quality computation, and keeps critique / LOC warnings as soft signals only.

### Issue: extracted runtime modules were not yet the live orchestration path

- Phenomenon:
  `lib/ai/agent-runtime/planner.ts`, `executor.ts`, and `context-manager.ts` already existed, but `lib/ai/agent-generator.ts` still inlined outline generation, repair-loop execution, and compression/session-memory state. That left the refactor in a half-landed state where tests could target the extracted modules while production behavior still lived in the large controller.
- Root cause:
  Phase 1 split code into new runtime files before the stream orchestrator was rewired to consume them. Shared runtime types were also still leaking through `agent-generator.ts`, which kept `agent-memory.ts` coupled to the facade layer.
- Fix:
  Phase 2 rewired the live agent loop to delegate outline resolution to `planner.ts`, per-step execution and repair retries to `executor.ts`, and compression/session memory to `context-manager.ts`. `agent-memory.ts` now imports runtime shared types directly, and deterministic runtime tests cover the executor and context-manager contracts while the SSE protocol and final result shape remain unchanged.

## 2026-04-29 Failed Step Recovery

### Issue: retry-from-step fell back to full generation when the failed step had never been persisted

- Phenomenon:
  When generation failed at step N, the progress UI still offered "从第 N 步重试". But partial persistence only wrote completed steps `0..N-1`, so the failed step itself had no `stepId`. The client-side retry loop treated that as "step not found" and silently fell back to full generation from outline.
- Root cause:
  The retry flow was implemented against persisted tutorial steps, while the generation pipeline persisted partial drafts only after successful step completion. Failed-in-flight steps therefore had a job `currentStepIndex` but no draft step record.
- Fix:
  Added a dedicated `POST /api/drafts/[id]/retry-from-step` recovery path. It rebuilds a working draft from the saved outline, seeds any missing tail steps with outline-backed placeholders, then regenerates from the requested `stepIndex` forward and clears the failed generation state on success.
  The failure UI now links into a scoped recovery outline review for `fromStep`, so users can adjust only the failed tail path and then resume from that step instead of restarting the whole fill pass.

### Issue: outline review was blocked after a partial generation failure

- Phenomenon:
  After a step-fill failure, the draft already contained a partial `tutorialDraft`, so `/drafts/[id]/outline` redirected back to the editor and `PUT /api/drafts/[id]/outline` rejected saves with `OUTLINE_ALREADY_FILLED`. Users could not adjust the outline before retrying.
- Root cause:
  Outline review was globally disabled as soon as any tutorial draft existed, without distinguishing a completed draft from a failed mid-generation partial draft that would be discarded on the next fill pass.
- Fix:
  Allowed outline review page access and outline saves when `generationState === 'failed'`. The outline workspace now explicitly warns that continuing generation will discard the partial step chain and restart filling from the saved outline.

## 2026-04-28 Optional Outline Review

### Issue: outline review mode could not reliably start a new generation after a previous succeeded job

- Phenomenon:
  `useGenerationProgress()` would fetch the latest job, see `status === 'succeeded'`, and immediately call `onComplete()`. This made `fill_from_saved_outline` and repeated `outline_review` runs skip the new SSE request entirely.
- Root cause:
  The reconnect logic did not distinguish "resume an existing job" from "start a fresh generation even though an older job already succeeded".
- Fix:
  Added explicit `generationMode` transport and changed the status bootstrap logic so terminal succeeded jobs only short-circuit when `startNewGeneration` is false.

### Issue: structural outline editing after patches exist breaks the patch chain

- Phenomenon:
  After a tutorial already had generated step patches, the workspace still exposed chapter add/delete/move and step move/delete operations. These edits can invalidate downstream patch assumptions while leaving the UI seemingly editable.
- Root cause:
  The product already models generation as an ordered patch chain, but chapter/step structure mutations were only treated as generic draft editing, not as high-risk graph mutations.
- Fix:
  Added a filled-state structure lock derived from `tutorialDraft.steps[].patches`. Structural mutations are now blocked in both UI and API, while prose/meta/patch editing remains allowed. Optional outline review was introduced as the safe place for structural editing before step fill.

### Issue: `?generate=1` could silently re-trigger generation after failure or refresh

- Phenomenon:
  Draft and outline pages used `?generate=1` to auto-start generation, but the query string stayed in the URL for the whole session. If generation failed and the page reloaded, remounted, or was revisited with the same URL, the client would treat the terminal failed job as a signal to start a brand-new generation immediately.
- Root cause:
  `useGenerationProgress()` correctly distinguishes "resume an active job" from "start a new one", but `startNewGeneration` stayed truthy forever as long as the bootstrap query params remained in the address bar.
- Fix:
  Consume `generate` / `generationMode` / `modelId` from the URL as soon as generation boots on the client, using `history.replaceState()`. This keeps the one-shot auto-start behavior while preventing accidental replays on later remounts.

### Issue: response-stream shutdown was logged as a generation error

- Phenomenon:
  Server logs frequently showed `Invalid state: Controller is already closed` even when the underlying generation job continued correctly in the background.
- Root cause:
  The SSE wrapper around the generation stream always called `controller.error(err)` inside the catch branch. When the HTTP response stream had already closed, that secondary call threw and polluted logs with a misleading stream failure.
- Fix:
  Suppress the known closed-controller case and guard `controller.error()` with a nested `try/catch`, so genuine generation errors still surface while expected disconnect cleanup stays quiet.

### Issue: development auth bypass cookie also worked on non-local development hosts

- Phenomenon:
  Any development deployment that reused `NODE_ENV=development` would trust the `vibedocs-dev-user-id` cookie directly. Middleware only checked for a truthy cookie, and `auth()` accepted any cookie value that matched a real user row.
- Root cause:
  The bypass path had no host-scope guard, and it treated the cookie as an implicit identity assertion instead of a local-only developer convenience.
- Fix:
  Centralized bypass validation in `lib/dev-auth.ts`. The bypass now requires a UUID-shaped user id and a loopback host (`localhost`, `127.0.0.1`, `::1`), so it keeps local manual testing but no longer opens shared dev hosts.

### Issue: outline review could race between generation completion navigation and manual outline saves

- Phenomenon:
  The outline review page could redirect back to `/drafts/[id]/outline` immediately after a successful continue-generation redirect, and the outline save endpoint still accepted writes while generation was already running.
- Root cause:
  Both generation completion handlers used an unconditional `finally` navigation, and `updateDraftOutline()` only blocked edits after a full tutorial draft existed.
- Fix:
  Removed the unconditional fallback redirect, added an explicit running-generation conflict guard for outline saves, and returned typed conflict codes so the route layer can distinguish `GENERATION_RUNNING` from `STRUCTURE_LOCKED`.

## 2026-04-29 Recovery Follow-ups

### Issue: validation failures with a full partial draft resumed from the end instead of the failed step

- Phenomenon:
  Agent-loop retry after final validation failure could immediately fail again without regenerating any step. The failed job stored `currentStepIndex` from validation provenance, but the partial draft already contained all generated steps.
- Root cause:
  Committed-step resume used `draft.tutorialDraft.steps.length` as the only resume boundary. For final validation failures, that equals the outline length, so the agent step-fill loop started at `totalSteps` and skipped straight back to validation.
- Fix:
  `deriveAgentResumeState()` now uses the failed job's indexed step for `STEP_GENERATION_FAILED`, `PATCH_VALIDATION_FAILED`, and indexed `DRAFT_VALIDATION_FAILED` when the partial draft extends beyond that step. Checkpoint validation then realigns the persisted agent state to the truncated prefix boundary before generation resumes.

### Issue: scoped retry kept stale failed-tail steps after users edited the outline

- Phenomenon:
  In failed-tail outline review, users could edit step titles/goals after the failed step, but "保存并继续失败路径" still regenerated against the stale partial tutorial steps.
- Root cause:
  `buildRetryRecoveryDraft()` preferred existing tutorial steps at every index. That preserved completed prefix steps correctly, but also kept failed or placeholder tail steps that should have been replaced by the newly saved outline.
- Fix:
  Retry recovery now accepts `retryStartIndex`. Steps before that boundary are preserved; the failed step and every following step are rebuilt as outline-backed placeholders, so regeneration sees the edited tail path.

### Issue: retry-from-step wrote placeholder tail content before successful regeneration

- Phenomenon:
  If retry-from-step failed or timed out early, the draft could be left with a full-length tutorial draft containing empty placeholder tail steps.
- Root cause:
  The retry service persisted the seeded recovery draft before calling the model. That seeded draft intentionally contained placeholder steps so regeneration had stable ids, but those placeholders were an internal working state, not valid user-facing tutorial content.
- Fix:
  The service now keeps the full seeded draft in memory only. It persists after each successful regenerated step, truncating the saved partial draft to the completed prefix through that step.
