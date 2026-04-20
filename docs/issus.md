# 生成系统容错机制 Review

日期: 2026-04-20

## 发现并修复的问题

### 1. handleRetryFromStep 中途失败丢失失败位置

**文件**: `components/tutorial/use-generation-progress.ts`

**问题**: retry-from-step 在步骤 N 失败时，catch 块不设置 `failedStepIndex` 和 `errorPhase`，导致 `canRetryFromStep=false`，用户只能完整重试，无法再次从失败步骤重试。

**修复**: 在 try 外声明 `currentRetryStep`，每轮循环更新，catch 中设置 `setFailedStepIndex(currentRetryStep)` / `setErrorPhase('step-fill')`。

### 2. handleRetry 固定 500ms 轮询

**文件**: `components/tutorial/use-generation-progress.ts`

**问题**: 等待旧 job 终止时用固定 500ms × 15 次 = 7.5s，可能与服务端清理竞态。

**修复**: 改为指数退避 1s→4s (×1.5)，10 次，总等待约 22s。

### 3. handleRetry 重试时不清空旧进度

**文件**: `components/tutorial/use-generation-progress.ts`

**问题**: 点击重试后，在等待旧 job 终止期间，旧的 outline 和 completedSteps 仍显示在 UI 上，用户看到过时信息。

**修复**: 在 `handleRetry` 开头清空 `setOutline(null)` / `setCompletedSteps([])` / `setStepTitles({})` 等。

### 4. 轮询超时消息不友好

**文件**: `components/tutorial/use-generation-progress.ts`

**问题**: 30 次轮询超时后显示 "保存确认超时，请刷新页面查看状态"，且不保留重试上下文。

**修复**: 改为 "确认生成状态超时，生成可能已完成。请刷新页面查看，或点击重试。"，保留 `canRetry=true`。

### 5. PATCH_VALIDATION_FAILED 死代码

**文件**: `lib/errors/error-types.ts` + `lib/ai/multi-phase-generator.ts` + `lib/services/generate-tutorial-draft.ts`

**问题**: `PATCH_VALIDATION_FAILED` 在 schema 中定义但从未被赋值，所有 `step_fill` 错误都映射到 `STEP_GENERATION_FAILED`，丢失了 patch 校验失败的具体信息。

**修复**: 新增 `PatchValidationError` 类，在 patch 应用失败且自动修复也失败时抛出，`getGenerationJobFailureUpdate` 中检测并映射到 `PATCH_VALIDATION_FAILED`。

### 6. "Generation cancelled" 英文消息

**文件**: `lib/services/generate-tutorial-draft.ts`

**问题**: 取消生成时服务端记录英文 `errorMessage`，UI 直接展示给用户。

**修复**: 改为中文 "生成已取消"。

## 浏览器验证结果

| 场景 | 结果 |
|---|---|
| 正常生成 (MiniMax M2.7, 8 步) | 完成，自动跳转编辑器 |
| 大纲阶段 JSON 解析失败 | 显示 "大纲生成失败" + 重新生成按钮 |
| 步骤填充阶段取消 | "正在取消..." → "生成已取消" + 重新生成按钮 |
| 点击重新生成 | 正确重置状态，从头开始 |
| 页面刷新重连 | 从 DB 恢复 outline/进度，polling 继续跟踪 |
| 重连后等待完成 | 进度实时更新 (0/8 → 4/8 → 8/8)，完成后跳转 |

## 架构概览

```
Client (use-generation-progress.ts)
  ├── SSE Stream (POST /generate)
  │   ├── event: job → jobId
  │   ├── event: phase → outline / step-fill / validate
  │   ├── event: outline → 大纲数据
  │   ├── event: step → 单步完成
  │   ├── event: done → 流结束
  │   └── event: error → 错误信息
  │
  ├── Polling (GET /generation-status)
  │   ├── stream-complete 后确认持久化
  │   ├── reconnecting 恢复进度
  │   └── cancelling 等待取消确认
  │
  ├── handleRetry → 完整重试 (runNonce++)
  └── handleRetryFromStep → 从失败步骤重试 (逐步 regenerate API)

Server (generate-tutorial-draft.ts)
  ├── initiateGeneration → 创建 job + SSE stream
  ├── createMultiPhaseGenerationStream
  │   ├── Phase 1: outline (MAX_RETRIES=3)
  │   ├── Phase 2: step-fill (MAX_STEP_RETRIES=3, auto-fix patches)
  │   └── Phase 3: validate
  └── persistContent → 事务写入 draft + job

Error Code → Recoverability
  ├── retry_from_step: STEP_GENERATION_FAILED, PATCH_VALIDATION_FAILED
  ├── retry_full: OUTLINE_GENERATION_FAILED, DRAFT_VALIDATION_FAILED, PERSIST_FAILED, JOB_CANCELLED, JOB_STALE
  └── none: MODEL_CAPABILITY_MISMATCH, PUBLISH_SLUG_CONFLICT
```
