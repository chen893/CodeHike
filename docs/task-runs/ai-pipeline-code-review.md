# AI/Generation Pipeline Code Review
**Date:** 2026-04-17
**Reviewer:** Senior Code Reviewer
**Scope:** Modified AI files + new utility modules

---

## Summary

Reviewed the retrieval-based generation pipeline implementation that enables handling large repositories (>30 files or >60% of model context). The changes split the generation flow into legacy (full source injection) and retrieval (tool-based exploration) paths.

**Overall Assessment:** The code is well-structured and thoughtful, but has several critical issues that must be addressed before merge.

---

## Critical Issues (Must Fix)

### 1. **Token Budget Leak - Missing Module Import**
**File:** `lib/ai/source-tools.ts:14`
**Issue:** `preprocessSource` is imported but `source-preprocessor.ts` is not in the provided files.
**Impact:** Runtime error - `ReferenceError: preprocessSource is not defined`
**Fix:** Verify `lib/ai/source-preprocessor.ts` exists and exports the function. If missing, implement it.

---

### 2. **Unbounded Loop in searchInFiles Tool**
**File:** `lib/ai/source-tools.ts:109-136`
**Issue:** The `searchInFiles` tool iterates over all `sourceItems` without pagination limits on input size. With 500+ files, this could cause excessive token consumption or timeout.
```typescript
execute: async ({ keyword }: { keyword: string }) => {
  const results: { path: string; matches: string[] }[] = [];
  for (const item of sourceItems) {  // No check on sourceItems.length
    const lines = item.content.split('\n');  // Expensive for large files
    const matches = lines
      .filter((line) => line.includes(keyword))
      .map((line) => line.trim())
      .slice(0, 5);
```
**Fix:** Add early termination after processing N files or checking token budget:
```typescript
if (budget && !budget.canAfford(line)) break;
```

---

### 3. **Missing Null Check in deriveStepSourceScope**
**File:** `lib/ai/outline-source-scope.ts:86-98`
**Issue:** No validation that `step.targetFiles` and `step.contextFiles` are arrays before using filter/map.
```typescript
export function deriveStepSourceScope(
  step: { targetFiles?: string[]; contextFiles?: string[] },
  // ...
): {
  targetFiles: string[];
  contextFiles: string[];
} {
  const target = (step.targetFiles ?? []).filter((p) => p in previousFiles);
```
**Impact:** If AI generates malformed outline with non-array targetFiles, this will crash.
**Fix:** Add runtime validation:
```typescript
const targetFiles = Array.isArray(step.targetFiles) ? step.targetFiles : [];
const contextFiles = Array.isArray(step.contextFiles) ? step.contextFiles : [];
```

---

### 4. **JSON Parsing Fallback May Accept Malformed Output**
**File:** `lib/ai/multi-phase-generator.ts:42-65`
**Issue:** `parseJsonFromText` extracts from outermost braces which can grab partial/malformed JSON.
```typescript
const braceStart = text.indexOf('{');
const braceEnd = text.lastIndexOf('}');
if (braceStart !== -1 && braceEnd > braceStart) {
  rawCandidates.push(text.slice(braceStart, braceEnd + 1));
}
```
**Impact:** Could extract `{"id": "step-1"` missing closing brace, or JSON from middle of explanation text.
**Fix:** Validate extracted JSON before returning:
```typescript
try {
  const parsed = JSON.parse(candidate);
  if (typeof parsed === 'object' && parsed !== null) {
    return schema.parse(parsed);
  }
} catch { ... }
```

---

### 5. **Missing Error Handling in isCancelRequested DB Query**
**File:** `lib/ai/multi-phase-generator.ts:197-206`
**Issue:** DB failures are silently caught and ignored, masking database issues.
```typescript
if (checkDbCancel) {
  try {
    return await checkDbCancel();
  } catch {
    // DB query failed — don't block generation, rely on in-memory only
    return false;
  }
}
```
**Impact:** Database connection problems will be silently swallowed, making debugging hard.
**Fix:** Log the error at minimum:
```typescript
} catch (err) {
  console.warn('[multi-phase] DB cancel check failed, using in-memory only:', err);
  return false;
}
```

---

## Important Issues (Should Fix)

### 6. **Inefficient String Splitting for Line Counting**
**Files:** Multiple locations
**Issue:** `content.split('\n').length` is called repeatedly in `token-budget.ts:74` and `source-tools.ts`.
**Fix:** Cache line counts or use a more efficient method if called frequently.

---

### 7. **Magic Numbers Without Constants**
**File:** `lib/ai/multi-phase-generator.ts`
**Issue:** Thresholds like `0.6` and `30` are hardcoded.
```typescript
totalSourceTokens > getMaxInputTokens(modelId ?? '') * 0.6
sourceItems.length > 30
```
**Fix:** Extract to named constants with documentation.

---

### 8. **Type Assertion Without Validation**
**File:** `lib/ai/multi-phase-generator.ts:409`
**Issue:** Direct object spread without type guard.
```typescript
step = { ...parsedStep, chapterId: outline.steps[i]?.chapterId ?? parsedStep.chapterId ?? DEFAULT_CHAPTER_ID };
```
**Fix:** Add runtime validation that parsedStep has expected shape.

---

### 9. **Snapshot Map May Grow Unbounded**
**File:** `lib/ai/multi-phase-generator.ts:374`
**Issue:** `snapshots` Map stores full file contents for each step.
```typescript
const snapshots: Map<number, Record<string, string>> = new Map();
```
**Impact:** With 50 steps × 10 files × 500 lines = significant memory.
**Fix:** Consider clearing older snapshots or storing only deltas.

---

### 10. **Missing Validation in buildCurrentSnapshotSummary**
**File:** `lib/ai/step-fill-prompt.ts:186-194`
**Issue:** No validation that `currentFiles` is a Record before using Object.entries.
**Fix:** Add guard clause for non-object input.

---

## Minor Issues (Nice to Fix)

### 11. **Inconsistent Error Messages**
**File:** Multiple
**Issue:** Some errors include detailed context, others are minimal.
**Fix:** Standardize error format with `{code, message, details}` structure.

---

### 12. **Duplicate Code Between Legacy and Retrieval Paths**
**Files:** `outline-prompt.ts`, `step-fill-prompt.ts`
**Issue:** Core prompt building logic is duplicated between legacy and retrieval variants.
**Fix:** Extract shared fragments to reduce duplication (partially done with `buildStepFillSystemPromptCore`).

---

### 13. **Missing JSDoc Comments**
**File:** `lib/ai/token-budget.ts`
**Issue:** Complex token estimation heuristic lacks detailed documentation.
**Fix:** Add examples showing expected token counts for common code patterns.

---

### 14. **Hardcoded Tool Count Limits**
**File:** `lib/ai/source-tools.ts:128, 264`
**Issue:** Magic numbers `30` and `20` for search result limits.
```typescript
if (results.length >= 30) break;
```
**Fix:** Extract to configuration constants.

---

### 15. **Probe Cache Never Cleared**
**File:** `lib/ai/model-capabilities.ts:80`
**Issue:** In-memory probe cache grows without bound across sessions.
**Fix:** Consider TTL-based expiration or LRU eviction.

---

## Security Notes

### Prompt Injection Considerations
- **User input to AI:** `teachingBrief` fields are directly interpolated into prompts. While this is server-side only, consider if any user-provided content could influence generation behavior unexpectedly.
- **Tool input validation:** The tools use Zod schemas, which is good. However, `path` parameters could attempt directory traversal (`../etc/passwd`). Since file lookups use a Map of pre-loaded items, this is currently safe.

---

## Performance Notes

1. **Positive:** Snapshot caching optimization (O(N²) → O(N)) is well-implemented.
2. **Positive:** Token budget checking prevents prompt overflow.
3. **Concern:** `buildDirectorySummary` processes all files on every outline generation. Consider caching for repeated generations.

---

## Type Safety Notes

1. **Good:** Extensive use of Zod schemas for runtime validation.
2. **Issue:** Several `as` casts in outline scope validation could fail silently.
3. **Issue:** `DEFAULT_CHAPTER_ID` is used without import visibility check in some modules.

---

## Recommendations

1. **Add integration tests** for the retrieval path with realistic large repos.
2. **Implement health checks** for the DB cancel query to fail fast if database is unavailable.
3. **Add metrics** for token budget usage to inform future tuning.
4. **Document the probe cache behavior** - developers should know it's process-scoped.

---

## Conclusion

The retrieval-based generation is a significant and well-architected improvement. However, the missing `source-preprocessor` import (Issue #1) is a **blocker** for merge. Issues #2-#4 involve potential runtime crashes or incorrect behavior under edge cases and should also be addressed.

**Recommendation:** Request changes for critical issues, then approve after fixes are verified.
