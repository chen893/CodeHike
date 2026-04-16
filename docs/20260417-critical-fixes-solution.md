# Critical Fixes Solution Report

Date: 2026-04-17
Branch: feature/github-repo-import
Status: All fixes applied, verified (`npm test` 171 pass / 1 skipped, `npm run build` pass)

---

## Executive Summary

Code review identified 8 critical issues across DB schema, auth, API routes, and React components. All have been fixed and verified. Additionally, analysis identified 3 lower-priority improvements for future iterations.

---

## Applied Fixes

### Fix 1: FK onDelete 保持 NO ACTION，终态由 repository 显式清指针

**File:** `lib/db/schema.ts:208-216` + `drizzle/0005_fix_fk_on_delete.sql`

**Problem:** `drafts_active_generation_job_same_draft_fk` 是复合外键 `("id", "active_generation_job_id") -> ("draft_id", "id")`。如果在这个复合 FK 上直接使用 `ON DELETE SET NULL`，PostgreSQL 会尝试把所有引用列置空，包括 `drafts.id` 主键，存在删除 job 时违反 `NOT NULL`/主键约束的风险。

**Fix:**
```typescript
// schema.ts — 保持默认 NO ACTION；终态清理由 repository 事务负责
foreignKey({
  name: 'drafts_active_generation_job_same_draft_fk',
  columns: [table.id, table.activeGenerationJobId],
  foreignColumns: [
    draftGenerationJobs.draftId as AnyPgColumn,
    draftGenerationJobs.id as AnyPgColumn,
  ],
}),
```

```sql
-- 0005_fix_fk_on_delete.sql
ALTER TABLE "drafts" DROP CONSTRAINT "drafts_active_generation_job_same_draft_fk";
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_active_generation_job_same_draft_fk"
  FOREIGN KEY ("id", "active_generation_job_id")
  REFERENCES "draft_generation_jobs" ("draft_id", "id")
  ON DELETE NO ACTION;
```

**Risk:** Low — active pointer 清理在 `updateDraftGenerationJob()` 的终态事务中完成；独立删除 job 不是当前业务路径。

---

### Fix 2: Auth token sync error handling

**File:** `auth.ts:15-55`

**Problem:** `syncOAuthAccountTokens` performed DB updates without try/catch. A database outage would crash the entire auth flow (login/callback).

**Fix:** Wrapped function body in try/catch with structured logging:
```typescript
async function syncOAuthAccountTokens(params: { ... }) {
  try {
    // ... existing DB operations ...
  } catch (error) {
    console.error('[auth][oauth] Failed to sync account tokens', {
      provider: params.provider,
      providerAccountId: params.providerAccountId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Non-critical: don't throw, auth flow continues
  }
}
```

**Risk:** None — graceful degradation. Token sync is non-critical (tokens are refreshed on next use).

---

### Fix 3: Cancel endpoint ownership check

**File:** `app/api/drafts/[id]/cancel/route.ts:20-27`

**Problem:** Cancel endpoint verified authentication but not draft ownership. Any authenticated user could cancel any other user's generation.

**Fix:** Added ownership check in the service layer via `requestGenerationCancelForUser(id, userId)`:
```typescript
const cancelled = await requestGenerationCancelForUser(id, session.user.id);
if (cancelled === null) {
  return NextResponse.json(
    { message: '草稿不存在或无权操作', code: 'FORBIDDEN' },
    { status: 403 }
  );
}
```

**Risk:** None — route handler only calls service; ownership filtering stays out of `app/*` repository boundaries.

---

### Fix 4: modelId input validation

**File:** `app/api/drafts/[id]/generate/route.ts:31-36`

**Problem:** Generate endpoint accepted arbitrary strings as modelId without validation. Malicious or malformed values could cause unexpected downstream behavior.

**Fix:** Added format/length validation:
```typescript
if (modelId && (modelId.length > 64 || !/^[a-zA-Z0-9\/\-_.]+$/.test(modelId))) {
  return NextResponse.json(
    { message: '无效的模型 ID', code: 'INVALID_MODEL' },
    { status: 400 }
  );
}
```

**Risk:** Low — only rejects clearly invalid formats. Valid model IDs (e.g., `deepseek-chat`, `gpt-4o`, `deepseek/deepseek-reasoner`) all pass.

---

### Fix 5: Portal SSR hydration safety

**File:** `components/drafts/draft-workspace-sidebar.tsx`

**Problem:** `PublishDialog` component declared `useState(false)` + `useEffect` for `mounted` but never used the state to gate rendering. Dead code risk and potential SSR issues.

**Fix:** Removed unused `mounted`/`setMounted` state. The dialog now uses `createPortal` directly to `document.body`, which is already gated by the parent's `publishDialogOpen` prop.

**Risk:** None — the portal only renders when `publishDialogOpen` is true (controlled by parent).

---

### Fix 6: Async event handler memory leak

**File:** `components/create-draft/file-tree-browser.tsx:131-164`

**Problem:** `handleExpand` in `TreeNode` is async. If the component unmounts during the async directory expansion, `setExpanded` and other state updates would fire on an unmounted component.

**Fix:** Added `isMountedRef` pattern:
```typescript
const isMountedRef = useRef(true);
useEffect(() => {
  return () => { isMountedRef.current = false; };
}, []);

// In handleExpand, after await:
if (!isMountedRef.current) return;
```

**Risk:** None — standard React pattern for async handlers.

---

### Fix 7: Retry race condition → polling

**File:** `components/tutorial/use-generation-progress.ts`

**Problem:** `handleRetry` used a fixed 1-second timeout which might not be enough for server-side job state to settle, causing "generation already in progress" errors.

**Fix:** Replaced fixed timeout with polling loop:
```typescript
const pollInterval = 500;
// Poll until job reaches terminal state or max attempts
```

**Risk:** Low — polling is more reliable than fixed timeout. The interval is short enough (500ms) to feel responsive.

---

### Fix 8: SSE data type safety

**File:** `components/tutorial/use-generation-progress.ts`

**Problem:** SSE event handlers used `data: any` type, bypassing TypeScript safety.

**Fix:** Added `SSEEventData` interface:
```typescript
interface SSEEventData {
  jobId?: string;
  phase?: string;
  totalSteps?: number;
  stepIndex?: number;
  title?: string;
  message?: string;
}
```

**Risk:** None — purely type-level improvement.

---

### Fix 9: Repository `as any` cleanup

**File:** `lib/repositories/draft-generation-job-repository.ts`

**Problem:** Multiple `as any` casts for jsonb fields (failureDetail, outlineSnapshot, stepTitlesSnapshot) bypassed TypeScript safety in both insert and update operations.

**Fix:** Replaced with proper type narrowing and explicit casts matching the schema's `.$type<T>()` definitions. Zero `as any` remaining.

**Risk:** None — types now match schema declarations.

---

## Deferred Improvements (Future Iteration)

### GitHub API anonymous access — rate limiting

**Files:** `app/api/github/repo-tree/route.ts`, `app/api/github/file-content/route.ts`, `app/api/github/repo-tree/subdirectory/route.ts`

**Assessment:** Anonymous access to public repos is **intentional** (test asserts no UNAUTHORIZED check). This is a valid UX pattern. However, lacks guardrails against abuse.

**Recommendation:** Add IP-based rate limiting for anonymous requests (10 req/min). Authenticated users get higher quota. Implement via `@upstash/ratelimit` or similar.

**Effort:** S (2-4 hours)

### Stale job recovery → cron job

**File:** `lib/services/generate-tutorial-draft.ts:232-235`

**Assessment:** `recoverStaleGenerationJobs()` runs on every generation initiation, scanning ALL active jobs across the system. Fine at current scale but will degrade with growth.

**Recommendation:** Move to a Vercel Cron (`*/5 * * * *`) endpoint protected by `CRON_SECRET`. Remove from hot path.

**Effort:** S (1-2 hours)

### modelId whitelist

**File:** `app/api/drafts/[id]/generate/route.ts`

**Assessment:** Current fix validates format only. A proper whitelist (e.g., `SUPPORTED_MODELS` constant) would prevent passing valid-looking but unconfigured models.

**Recommendation:** Create `lib/constants/models.ts` with `SUPPORTED_MODELS` array synced with `lib/ai/model-capabilities.ts`'s `STATIC_CAPABILITIES`.

**Effort:** S (1-2 hours)

---

## Verification Results

```
Build:       npm run build passed
Tests:       npm test passed (171 passed, 1 skipped)
```

All fixes are backwards-compatible. No breaking changes to API contracts or data formats.
