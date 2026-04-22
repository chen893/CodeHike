# Agent Loop Architecture: Tutorial Generation Pipeline Redesign

> 状态：Phase 1-3 已实施并验证（2026-04-22）
> 日期：2026-04-21 / 更新：2026-04-22
> 前置：基于 Book (Claude Code 架构设计) 的系统性研究

---

## 1. 问题诊断

当前 `Outline → Step-fill → Validate` 流程存在 5 个结构性缺陷：

| 缺陷 | 根因 | 影响 |
|------|------|------|
| 错误雪球 | patches 累积有状态，早期偏移向后传播 | 后 50% 步骤质量劣化 |
| Validate 太晚 | 仅在全部 step 填完后才验证 | 无法定向修复，整体 fail |
| 无反馈通道 | step-fill 无法 push back 到 outline | 错误的 baseCode 毒害所有后续步骤 |
| Token 浪费 | 每步重注入完整 source code + outline | 15 步教程 ~15 次冗余调用 |
| Patch 脆弱性 | 精确子串匹配 + 唯一性约束 | auto-fix 是事后补救，非架构级解决 |

## 2. 目标架构：Agent Loop

### 2.1 核心理念

Book 的核心论点：**Context Engineering > Prompt Engineering**。

> "In a continuously running system, how do I ensure the model sees the most relevant information at every moment, without being overwhelmed by irrelevant information?"

将 tutorial generation 从 "固定管线" 转为 **上下文管理系统**：Agent 持有 tools，自主决定何时验证、何时修复、何时重新规划。

### 2.2 决策循环

```
┌─────────────────────────────────────────────────┐
│                   Agent Loop                     │
│                                                  │
│  1. planOutline()                                │
│     ↓                                            │
│  2. validateBaseCode() ← 自检起点是否可运行        │
│     ↓ (不通过 → 修复 baseCode)                    │
│  3. for i = 0..N:                                │
│     a. fillStep(i)                               │
│     b. validatePatches(i) ← 每步即时验证           │
│     c. 失败? → repairStep(i, actualCode, error)  │
│     d. 连续修复 ≥ 2? → reviseOutline(from: i)    │
│     e. 通过 → 持久化 + 蒸馏上下文                  │
│  4. validateAll()                                │
│     失败? → 定向 repairStep(failedStep)           │
│  5. 完成                                         │
│                                                  │
│  每轮迭代检查:                                     │
│  - cancelToken (取消)                             │
│  - tokenBudget (上下文溢出 → 触发压缩)             │
│  - maxTurns (硬上限)                              │
└─────────────────────────────────────────────────┘
```

### 2.3 与当前架构的关系

| 现有组件 | Agent Loop 中的角色 |
|---------|-------------------|
| `multi-phase-generator.ts` | 保留为 legacy fallback |
| `agent-generator.ts` (新) | Agent Loop 核心编排 |
| `source-tools.ts` | 复用：Agent 的 read tools |
| `draft-code.ts` | 复用：patch apply + validate |
| `patch-auto-fix.ts` | 复用：作为 validatePatches 的内层 |
| `step-fill-prompt.ts` | 扩展：新增 repair + revise prompt |
| `outline-prompt.ts` | 扩展：新增 baseCode 验证 prompt |
| DB generation_jobs | 扩展：phase 增加 `repair`/`replan` |
| SSE stream | 扩展：新增 `repair`/`replan`/`step-repaired` 事件 |

---

## 3. 六大设计原则（源自 Book）

### 原则 1：即时验证，非延迟验证

> Book: "Validation is not deferred to the end -- it is continuous."

每步 fillStep 后立即 `applyContentPatches` + 验证。验证结果分为三级：

```
PASS         → 继续
REPAIRABLE   → repairStep，注入「实际代码状态 + 失败原因」
UNRECOVERABLE → reviseOutline，从当前步重新规划后续步骤
```

实现：扩展现有 `findFirstInvalidStep` 为 `validateStepPatches(step, currentFiles)`，返回结构化结果而非 boolean。

### 原则 2：压缩即蒸馏，非截断

> Book: "Preserve 'why' not 'what', preserve decision paths not all intermediate steps."

已完成步骤的上下文不应原样传递。蒸馏策略：

| 层级 | 触发条件 | 动作 | 成本 |
|------|---------|------|------|
| Micro-compact | 每步完成后 | 将已完成步骤的代码替换为 `[step N: completed, added router]` 标记 | 无 LLM 调用 |
| Auto-summarize | token 使用 > 65% | LLM 将前 N 步蒸馏为结构化摘要（保留 errors & fixes + remaining steps） | 1 次 LLM 调用 |
| Full-replan | token 使用 > 85% | 从当前 checkpoint 重新生成后续 outline | 1 次 LLM 调用 |

蒸馏后的上下文结构（参照 Book 的 compact prompt 9 段结构）：

```
1. 教学目标与核心问题
2. 已完成步骤摘要（每步 1 行）
3. 当前代码状态（关键字段/函数签名）
4. 验证错误及修复记录（完整保留）
5. 剩余步骤（从 outline 的 teachingGoal）
6. 当前步骤详情（完整注入）
7. 下一步预览
```

### 原则 3：只存储不可推导的信息

> Book: "Only store information that cannot be derived from the current project state."

Agent Loop 的记忆分层：

| 层级 | 作用域 | 存什么 | 不存什么 |
|------|-------|--------|---------|
| Working | 单步 | 当前代码快照、本步 patches | 已完成步骤的完整代码 |
| Session | 单次生成 | 修复记录、成功策略、drift 检测 | 逐步执行日志 |
| Project | 跨次生成 | 该代码库的 patch 脆弱区、常用模式 | 可从代码推导的结构信息 |

Session Memory 的结构化模板：

```markdown
# 生成会话记忆

## 当前状态
- 已完成: N/total 步
- 当前 checkpoint: step index + 代码快照 hash

## 修复记录
- Step 3: find/replace 因缩进不一致失败 → auto-fix 修正
- Step 7: 连续 2 次 repair → 触发 reviseOutline

## 成功策略
- baseCode 从 `router.js` 起始效果最好
- 单文件 patch < 8 行变更时成功率最高

## 脆弱区域
- `utils/helpers.js`: 函数顺序依赖，find/replace 不可靠
```

### 原则 4：记录成功与失败

> Book: "If you only save corrections, you will avoid past mistakes but drift away from approaches the user has already validated."

每步完成后记录：

```ts
interface StepOutcome {
  stepIndex: number;
  result: 'pass' | 'repaired' | 'replanned';
  repairCount: number;
  patchStrategy: 'exact' | 'auto-fixed' | 'full-rewrite';
  locChange: number;
  // 为什么记录这些：跨 session 比较可以识别哪些代码区域始终需要 full-rewrite
}
```

### 原则 5：Propose-then-apply，非直接修改

> Book: "Shared mutable state breaks causal isolation. Sub-agents should propose diffs; the orchestrator applies them."

Agent 不直接修改共享代码状态。流程：

```
Agent.fillStep(i) → 返回 StepProposal { patches, paragraphs, focus, marks }
     ↓
Orchestrator.validatePatches(proposal, currentFiles)
     ↓
Orchestrator.apply(proposal) → 生成新的 immutable snapshot
```

这保证了：修复某步不会隐式影响前面步骤的状态。

### 原则 6：Cache-safe 上下文前缀

> Book: "Keep the system prompt, tool definitions, and outline structure identical across all step-fill calls."

Agent Loop 中所有子调用共享稳定前缀：

```
[稳定前缀 - 可缓存]
  - system prompt（生成规则）
  - tool definitions（readFile, validatePatches 等）
  - outline 结构（meta + steps 的 teachingGoal 列表）

[动态部分 - 不缓存]
  - 当前步骤详情
  - 当前代码快照
  - 修复历史
```

---

## 4. Agent Tools 设计

### 4.1 工具清单

```ts
const agentTools = {
  // 已有 - 复用
  readFile: { desc: '读取源码文件内容' },
  listStructure: { desc: '查看文件结构签名' },
  searchInFiles: { desc: '搜索关键词' },

  // 已有 - 复用
  readCurrentFile: { desc: '读取当前代码快照中的文件' },

  // 新增 - 核心工具
  validatePatches: {
    desc: '验证 patches 能否应用到当前代码，返回 { valid, errors, actualCode }',
    // 内部调用 applyContentPatches + tryAutoFixPatches
  },
  repairStep: {
    desc: '基于实际代码状态和失败原因，重新生成某步的 patches',
    // 注入实际代码而非 AI 预期的代码
  },
  reviseOutline: {
    desc: '从指定步骤开始，重新规划后续步骤的教学目标',
    // 保留已完成步骤，只修改 future steps
  },
  critiqueSteps: {
    desc: '评估已完成步骤的教学连贯性（每 3-5 步调用一次）',
    // 改造自 generation-quality-review.ts
  },
};
```

### 4.2 工具权限分层

| Agent 角色 | 可用工具 | 用途 |
|-----------|---------|------|
| Generator (默认) | fillStep, validatePatches, readFile, repairStep, reviseOutline, critiqueSteps | 主循环 |
| Validator | validatePatches, readFile | 只读验证 |
| Repairer | repairStep, readCurrentFile, readFile | 定向修复 |

---

## 5. SSE 事件扩展（向后兼容）

新增事件，不修改现有事件格式：

```
event: repair         { stepIndex, attempt, errorMessage }
event: replan         { fromStepIndex, reason, revisedStepCount }
event: step-repaired  { stepIndex, step }
event: compress       { type: 'micro'|'summary'|'replan', tokensBefore, tokensAfter }
event: phase          增加 phase: 'repair' | 'replan' | 'compress'
```

前端改动：

```ts
// generation-progress-types.ts 新增 V2Status
'repairing' | 'replanning' | 'compressing'

// use-generation-progress.ts handleV2Event 新增 case
case 'repair':     → setStatus('repairing')
case 'replan':     → setStatus('replanning')
case 'step-repaired': → 更新 steps[state.stepIndex]，setStatus('filling-step')
case 'compress':   → 可选：显示上下文压缩进度
```

---

## 6. 状态管理与持久化

### 6.1 Generation Job Schema 扩展

```sql
-- draft_generation_jobs 表扩展
ALTER TABLE draft_generation_jobs ADD COLUMN agent_state JSONB;
-- agent_state 结构:
-- {
--   "checkpointIndex": number,        -- 最后通过验证的步骤
--   "snapshotHash": string,           -- 代码快照 hash
--   "repairHistory": [{ stepIndex, attempts, strategy, outcome }],
--   "replanCount": number,
--   "tokenUsage": { used, budget, lastCompressAt },
--   "outcomes": StepOutcome[]          -- 每步结果记录
-- }

-- phase enum 扩展
-- 新增: 'repair' | 'replan' | 'compress'
```

### 6.2 Checkpoint 机制

每步通过验证后保存 checkpoint：

```ts
interface GenerationCheckpoint {
  stepIndex: number;
  files: Record<string, string>;      // 当前完整代码快照
  outline: TutorialOutline;           // 可能被 revise 过的 outline
  filledSteps: TutorialStep[];        // 已填充的步骤
  outcomes: StepOutcome[];            // 每步结果
  tokenBudget: { used: number; budget: number };
}
```

恢复策略：从最后一个 checkpoint 重新进入 Agent Loop，而非从头开始。

---

## 7. 压缩策略实现

### 7.1 Micro-compact（每步后自动执行）

```ts
function microCompact(steps: TutorialStep[], currentIndex: number): string {
  // 将已完成步骤的完整代码替换为一行摘要
  return steps.slice(0, currentIndex).map((step, i) =>
    `[step ${i + 1}: ${step.title} — ${step.patches?.length ?? 0} patches, ${sumLocChange(step)} LOC]`
  ).join('\n');
}
```

触发：每步 fillStep 成功后。
成本：0 次 LLM 调用。

### 7.2 Auto-summarize（token > 65% 时触发）

```ts
async function autoSummarize(context: AgentContext): Promise<DistilledContext> {
  const prompt = buildDistillPrompt(context);
  const result = await generateText({ model, prompt, maxOutputTokens: 2000 });
  return parseDistilledContext(result.text);
}
```

蒸馏 prompt 保留的优先级（参照 Book POST_COMPACT 预算分配）：
1. 修复记录和错误（最高优先级 — Book: "user corrections are the most easily lost"）
2. 当前步骤的完整上下文
3. 剩余步骤的教学目标
4. 当前代码的关键结构（函数签名、import 列表）

### 7.3 Cache-safe 设计

所有 step-fill 调用共享相同的 system prompt 和 tool definitions。只有动态部分（当前代码、修复历史）变化。这确保 Vercel AI SDK 的 prompt cache 在连续调用间命中。

---

## 8. 错误处理与停止条件

### 8.1 三层停止条件

| 条件 | 类型 | 值 | 行为 |
|------|------|---|------|
| `maxTurns` | 硬上限 | 30 | 终止生成，返回当前最优结果 |
| `maxRepairsPerStep` | 软上限 | 3 | 单步超过后触发 reviseOutline |
| `maxReplans` | 软上限 | 2 | 超过后接受当前结果 + 标记质量警告 |

### 8.2 错误容忍

> Book: "Even if one read fails, the loop continues."

单步 repair 失败不中断整个循环。策略：
- repairStep 失败 → 尝试 auto-fix → 仍然失败 → 标记该步为 `degraded` → 继续下一步
- 连续 ≥ 2 步 degraded → 触发 reviseOutline
- reviseOutline 失败 → 保留已有结果 + 在 validation 中记录警告

### 8.3 状态机

每步验证结果驱动状态转换：

```
                ┌──────────────────────────┐
                │                          │
                ▼                          │
  PASS ──→ CONTINUE ──→ fillStep(i+1) ────┘
                │
  REPAIRABLE ──→ REPAIRING ──→ repairStep(i) ──→ PASS/DEGRADED
                     │                                │
                     └── FAIL ──→ DEGRADED ───────────┘

  UNRECOVERABLE ──→ REPLANNING ──→ reviseOutline(i) ──→ CONTINUE
                        │
                        └── FAIL ──→ DEGRADED ──→ CONTINUE (with warning)
```

---

## 9. 可观测性

### 9.1 结构化日志

```ts
interface AgentLoopLog {
  stepIndex: number;
  action: 'fill' | 'validate' | 'repair' | 'replan' | 'compress';
  result: 'pass' | 'fail' | 'degraded';
  tokenUsage: { prompt: number; completion: number; cacheHitRate: number };
  duration: number;
  repairAttempts: number;
}
```

### 9.2 质量指标

扩展现有 `computeGenerationQuality`：

```ts
interface GenerationQuality {
  // 现有指标
  stepCount: number;
  patchValidationPassRate: number;
  // 新增
  repairCount: number;           // 总修复次数
  replanCount: number;           // 重规划次数
  firstPassRate: number;         // 首次即通过的步骤比例
  avgRepairAttempts: number;     // 平均修复尝试次数
  degradedStepCount: number;     // 降级步骤数
  compressionCount: number;      // 上下文压缩次数
  cacheHitRate: number;          // prompt cache 命中率
}
```

---

## 10. 实施路线

### Phase 1：即时验证 + 定向修复（最小可行改动）

**改动文件：**
- `lib/ai/agent-generator.ts`（新建，~300 行）
- `lib/ai/step-fill-prompt.ts`（新增 `buildRepairPrompt`）
- `lib/services/generate-tutorial-draft.ts`（新增 agent 模式入口）
- `components/tutorial/generation-progress-types.ts`（新增状态）
- `components/tutorial/use-generation-progress.ts`（处理新事件）

**不改动：**
- 现有 `multi-phase-generator.ts` 保留为 legacy fallback
- SSE 现有事件格式不变
- DB schema 不变（phase 先用字符串值而非 enum 扩展）

**验收标准：**
- [x] 单步 repair 成功率 > 80%（实测 2/2 修复成功）
- [x] 11 步教程端到端生成成功（2026-04-22 验证）
- [x] 不改变前端现有功能

### Phase 2：上下文蒸馏 + 记忆系统

**改动文件：**
- `lib/ai/agent-context.ts`（新建，蒸馏逻辑）
- `lib/ai/agent-memory.ts`（新建，会话记忆）
- `lib/ai/agent-generator.ts`（集成蒸馏触发）
- DB: `draft_generation_jobs` 增加 `agent_state` JSONB 列

**验收标准：**
- [x] 代码已集成（microCompact/autoSummarize/fullReplan），小仓库不触发压缩
- [x] sessionMemory 已集成，记录每步 outcome + repair history
- [ ] 20+ 步教程不再因 token 溢出失败（待大仓库测试）

### Phase 3：Outline 修订 + 自我评审

**改动文件：**
- `lib/ai/outline-prompt.ts`（新增 `buildReviseOutlinePrompt`）
- `lib/ai/agent-generator.ts`（集成 reviseOutline + critiqueSteps）
- `lib/review/generation-quality-review.ts`（改造为 agent tool）

**验收标准：**
- [x] reviseOutline 已集成，consecutiveRepairFailures >= 2 时自动触发
- [x] critiqueSteps 已集成，每 3 步评估教学连贯性（实测 score 83-86）
- [ ] 连续修复自动触发 replan（待复杂源码测试验证）

---

## 11. 功能触发条件（实测验证 2026-04-22）

> 基于 DeepSeek Chat + 3 文件 494 行源码 + 11 步教程的端到端测试结果。

### 11.1 触发层级

| 层级 | 功能 | 触发条件 | 实测状态 |
|------|------|---------|---------|
| L1 核心 | outline + step-fill 循环 | 每次必走 | ✅ 每次触发 |
| L1 核心 | validateStepPatches | 每步有 patches 就验证 | ✅ 每步触发 |
| L1 核心 | microCompact | 每步完成后自动执行（零成本） | ✅ 每步执行 |
| L1 核心 | sessionMemory.recordStepOutcome | 每步完成后记录 | ✅ 每步执行 |
| L2 修复 | buildRepairPrompt | `validateStepPatches` 返回 `repairable`（patch 匹配歧义等） | ✅ step 6/9 各触发 1 次 |
| L2 修复 | Unrecoverable → Degraded | `validateStepPatches` 返回 `unrecoverable`（patch 完全找不到匹配） | 未触发 |
| L2 修复 | MAX_TURNS 熔断 | `turnCount >= 30`（每步每轮 attempt +1） | 未触发（总 turns ≈ 13） |
| L3 重规划 | reviseOutline | **连续 2 步**各自耗尽 3 次 repair 仍失败（`consecutiveRepairFailures >= 2`） | 未触发 |
| L3 重规划 | MAX_REPLANS 上限 | `replanCount >= 2` | 未触发 |
| L4 压缩 | autoSummarize (65%) | `estimatedTokenUsage / tokenBudget >= 0.65`（DeepSeek ≈ 83K tokens） | 未触发 |
| L4 压缩 | fullReplan (85%) | `estimatedTokenUsage / tokenBudget >= 0.85`（DeepSeek ≈ 109K tokens） | 未触发 |
| L5 漂移 | detectDrift | 末尾 `>= 2` 个连续 `replanned` 步骤 | 未触发（仅 warn） |
| L6 Tool | step-fill tools | 需手动开启 `VIBEDOCS_STEP_FILL_TOOLS=1`，默认关闭 | 未启用 |

### 11.2 触发所需的教程规模估算

| 功能 | 需要的步骤数 | 需要的源码规模 | 说明 |
|------|------------|-------------|------|
| Step Repair | 任意 | 有重复代码片段时更易触发 | patch find 匹配到多个位置 |
| reviseOutline | 连续 2 步 repair 全失败 | 复杂/重复代码结构 | 每 step 最多 3 次 repair 机会 |
| autoSummarize | ~20 步 | 任意 | 每步 prompt 增长约 3-5K tokens |
| fullReplan | ~30 步 | 任意 | 累积 token 超过 85% 预算 |
| STEP_FILL_TOOLS | 手动开启 | 大仓库（30+ 文件）时效果更明显 | 当前用 prompt 预注入替代 |

### 11.3 关键常量

```
MAX_TURNS = 30              // 全局最大轮次（硬上限）
MAX_REPAIRS_PER_STEP = 3    // 每步最大修复次数
MAX_REPLANS = 2             // 最大重规划次数
AUTO_SUMMARIZE_THRESHOLD = 0.65  // token 使用率
FULL_REPLAN_THRESHOLD = 0.85     // token 使用率
CONSECUTIVE_FAILURE_TRIGGER = 2  // 连续失败触发 reviseOutline
```

### 11.4 Step-fill 阶段的代码获取方式

当前有两种模式（由 `modelSupportsRetrieval` 和 `STEP_FILL_TOOLS_ENABLED` 决定）：

| 模式 | 代码来源 | 适用场景 |
|------|---------|---------|
| **Prompt 预注入**（默认） | `buildCurrentSnapshotSummary` + `deriveStepSourceScope` 生成静态片段，写入 prompt | 小/中仓库，当前 DeepSeek Chat 使用此模式 |
| **Tool 自主查找**（需开启） | LLM 通过 `readCurrentFile` / `readOriginalFile` / `searchOriginalFiles` 等工具按需读取 | 大仓库（30+ 文件），需设 `VIBEDOCS_STEP_FILL_TOOLS=1` |

### 11.5 Debug Log 格式

`AGENT_LOOP_DEBUG=1` 时写入 `~/.codehike-debug/agent-run-{timestamp}.log`，每行一个 JSON：

```
init:               { modelId, modelSupportsRetrieval, isLargeRepo, sourceFileCount, totalSourceTokens, recommendedSteps }
outline-complete:   { stepCount, title }
step-validation:    { stepIndex, attempt, result: pass|repairable|unrecoverable, autoFixed, error? }
compression:        { type: summary|replan, stepIndex, tokenUsage }
done:               { totalSteps, totalRetries, replanCount, compressionCount, outcomeSummary[] }
```

---

## 12. 关键风险与缓解

| 风险 | 缓解 |
|------|------|
| Agent Loop 调用次数不确定，成本上升 | maxTurns 硬上限 + cache-safe 设计降低每次调用成本 |
| 模型不支持 tool calling（如 deepseek-reasoner） | 降级为 Phase 1 方案（即时验证 + retry with actual code） |
| 蒸馏丢失关键上下文 | 保留修复记录和错误的最高优先级；micro-compact 不丢弃任何决策信息 |
| 前端兼容性 | 新增事件而非修改现有事件；新状态为可选扩展 |
| Mark/Focus 行号超出范围 | clamp 到有效行范围（2026-04-22 修复） |

---

## 附录：Book 核心观点索引

| Book 概念 | 本方案对应 |
|-----------|----------|
| Context Engineering | 整体架构：Agent 是上下文管理系统 |
| REPL Loop Heartbeat | Agent Loop 决策循环 |
| Continuous Validation | 即时验证原则 |
| Compression as Distillation | 三层压缩策略 |
| Forked Agent + Cache Sharing | Cache-safe 上下文前缀 |
| Derivable Info Not Stored | 记忆分层原则 |
| Feedback: Both Failures & Successes | StepOutcome 记录 |
| Propose-then-Apply | Immutable snapshot + 验证后才应用 |
| Post-Sampling Hooks | 每步完成后的记忆提取 |
| Compact Boundary Marker | Checkpoint 机制 |
| Task Status Lifecycle | 状态机：PASS/REPAIRABLE/UNRECOVERABLE/DEGRADED |
| Declarative Agent Config | Tool 权限分层 + 配置驱动 |
