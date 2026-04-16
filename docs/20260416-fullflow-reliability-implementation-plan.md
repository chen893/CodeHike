# VibeDocs 全流程可靠性与失败恢复实施方案

> 日期：2026-04-16
> 范围：从“新建草稿”到“生成完整教程”再到“编辑 / 预览 / 发布 / 阅读”的全链路可靠性、重试、重连、回滚与状态一致性治理。

---

## 1. 背景与目标

当前系统已经具备可用的教程生成和编辑能力，但失败恢复能力分散在多个局部实现里：

- GitHub 导入有较完整的 fallback / partial success / batch retry
- 生成链路有 SSE reconnect、单步 retry、取消
- 编辑链路主要依赖手动重试和局部 patch 修复
- 快照恢复和增量重生成已有后端雏形，但尚未形成统一恢复体系

这导致同一个用户在不同阶段遇到失败时，看到的是不同的错误语义、不同的恢复入口，以及不同程度的状态漂移风险。

本方案的目标不是重写生成链路，而是把现有能力整理成一套可持续演进的“可靠性基础设施”：

1. 失败状态可分类、可定位、可恢复
2. 重试语义统一，避免“同一问题不同页面不同按钮”
3. 任务状态从进程内内存迁移到持久化模型，支持多实例和重连
4. 结构编辑、预览、发布都纳入同一套一致性规则
5. 所有关键恢复动作具备最小可用 UI 和测试覆盖

---

## 2. 当前全流程与恢复现状

### 2.1 流程分段

1. 新建草稿
2. GitHub 导入源码
3. 启动 AI 生成
4. 生成中断线 / 取消 / 重试 / 重连
5. 工作区编辑与结构调整
6. 预览 payload 构建与远程加载
7. 发布
8. 发布后阅读

### 2.2 当前已存在的恢复能力

#### A. 新建 / GitHub 导入

- GitHub public repo 支持匿名访问，登录态 token 仅作为增强能力
- `repo-tree` / `file-content` 已支持 403 / 429 区分
- `file-content` 支持 `207 Partial Failure`
- client 端批量导入支持拆批、超限缩批、成功文件保留
- 大仓库支持 truncated 子树 lazy load

#### B. 生成

- 服务端 step-fill 内置 `MAX_STEP_RETRIES = 3`
- step patch 不匹配时会尝试 auto-fix
- 客户端进入生成页时会先 `fetchDraft()`，支持“刷新后重连”
- SSE 结束后会轮询 DB 状态确认是否持久化成功
- 支持 cancel API，但仅在步骤边界生效
- 支持从失败步骤开始重生后续步骤

#### C. 编辑 / 预览

- 单步结构编辑已改为“只校验到当前步”
- 工作区支持“从第一个失效步骤开始修复后续尾部”
- 远程预览和远程阅读使用 request version 防止旧响应覆盖新响应
- snapshot restore 在服务端会自动备份当前状态

### 2.3 当前明显缺口

- 生成任务状态依赖内存 `activeGenerations`
- retry / regenerate / reconnect / repair 语义分散
- `modelId` 没有贯穿所有恢复路径
- snapshot 和 incremental regenerate 尚未形成用户可见的标准恢复流
- 创建草稿、发布 slug、预览 payload 构建仍有幂等与竞态缺口

---

## 3. 当前存在的问题清单

以下问题是本轮调研确认的“当前态问题”，不是未来可能性。

### 3.1 P0 问题

#### 问题 P0-1：生成任务状态存在进程内内存，无法跨实例恢复

现象：

- cancel 依赖 `activeGenerations` 命中当前进程
- `generationState=running` 与实际活跃任务可能失真
- 进程重启后可能遗留僵尸 `running`
- 多实例部署时 reconnect / cancel / delete 命中不同实例会失效

影响：

- 用户看到“仍在生成”，实际已经停掉
- 删除草稿、再次生成、取消生成可能被卡死
- 故障排查只能靠日志和人工修表

#### 问题 P0-2：失败语义是 message 驱动，不是枚举驱动

现象：

- 前端很多地方靠 `message.includes(...)` 或 `classifyGenerationError()` 猜失败类型
- outline 失败、step 失败、persist 失败、validation 失败、cancelled 不是统一协议

影响：

- UI 恢复入口不稳定
- 同一个失败在不同页面提示不一致
- 后续接更多模型或 job runner 时容易继续分叉

#### 问题 P0-3：创建草稿没有幂等保护

现象：

- 提交后网络超时或用户连点，可能重复创建 draft
- 当前 controller 没有 submit lock + idempotency key

影响：

- 用户误以为“没有成功”，重复提交后得到多个重复草稿
- 列表污染，后续生成成本增加

#### 问题 P0-4：发布 slug 检查存在竞态

现象：

- 先 `isSlugTaken()` 再 `insert`
- 同时发布同一 slug 时，依赖 DB unique constraint 最后兜底

影响：

- 错误映射不稳定
- 可能返回泛化 500，而不是确定性的 409

### 3.2 P1 问题

#### 问题 P1-1：step 级恢复没有稳定继承生成上下文

现象：

- 从失败步骤修复、工作区 regenerate、尾部 repair 未稳定透传 `modelId`
- 某些恢复入口会退回默认模型

影响：

- 同一草稿在恢复链路中模型漂移
- 结果质量和速度不可预测

#### 问题 P1-2：恢复入口过多，但没有统一编排器

当前存在：

- 生成页全量重试
- 生成页从失败步骤开始修复
- 工作区单步 regenerate
- 工作区失效尾部 repair
- snapshot restore
- incremental regenerate API

影响：

- 用户和开发者都很难判断“现在该点哪个按钮”
- 前端出现多处相似 for-loop 调 `regenerate` 的逻辑

#### 问题 P1-3：snapshot / incremental regenerate 能力没有闭环

现象：

- snapshot API 已存在，但工作区缺少主恢复入口
- incremental regenerate API 目前基本是占位实现

影响：

- 系统已经有基础设施，但用户主要还靠手动修复

#### 问题 P1-4：预览 / payload 构建的降级不完整

现象：

- draft 无效或组装失败时，远程预览容易直接进入通用错误
- 没有把“草稿尚未就绪 / 当前 patch 链失效 / payload 构建失败”分开暴露

影响：

- 用户感知为白屏或模糊错误
- 无法直接引导回到正确恢复动作

### 3.3 P2 问题

#### 问题 P2-1：编辑保存、预览拉取普遍缺少统一 retry policy

现象：

- 多数 mutation 失败后直接 `alert`
- reload 基本全靠用户手动触发

影响：

- 短暂网络抖动直接暴露给用户

#### 问题 P2-2：故障监控缺少“恢复链路”事件维度

现象：

- 当前有 generationQuality、analytics、events 能力
- 但没有系统记录 retry 次数、reconnect 次数、stale job 回收次数、snapshot restore 成功率

影响：

- 无法判断失败恢复设计是否真的改善了用户体验

---

## 4. 目标状态

### 4.1 用户视角

当任一步失败时，系统应只暴露有限且稳定的恢复动作：

1. 继续等待
2. 重新连接
3. 重试当前任务
4. 从失败步骤开始修复
5. 回滚到最近快照
6. 放弃当前任务并重新开始

### 4.2 系统视角

1. 所有长任务必须有持久化任务记录
2. 所有失败必须带结构化错误码
3. 所有恢复动作必须记录来源、上下文、目标步骤和模型
4. 所有“局部修复”都必须更新 validation 与 syncState
5. 所有 UI 不再通过 message 文本猜恢复策略

---

## 5. 总体设计

### 5.1 新增持久化任务模型

建议新增 `draft_generation_jobs` 表。

建议字段：

- `id` uuid
- `draftId` uuid
- `userId` text
- `status` enum: `queued | running | succeeded | failed | cancelled | abandoned`
- `phase` enum: `outline | step_fill | validate | persist`
- `startedAt` timestamp
- `finishedAt` timestamp
- `heartbeatAt` timestamp
- `leaseUntil` timestamp
- `currentStepIndex` integer
- `totalSteps` integer
- `retryCount` integer
- `modelId` varchar
- `errorCode` varchar
- `errorMessage` text
- `failureDetail` jsonb
- `outlineSnapshot` jsonb nullable
- `stepTitlesSnapshot` jsonb nullable
- `createdAt` timestamp
- `updatedAt` timestamp

作用：

- 替代进程内 `activeGenerations` 成为恢复真相源
- reconnect、cancel、超时回收都依赖 job 而不是内存
- 支持多实例和未来异步 worker

### 5.2 统一错误协议

新增 generation error code 枚举：

- `OUTLINE_GENERATION_FAILED`
- `STEP_GENERATION_FAILED`
- `PATCH_VALIDATION_FAILED`
- `DRAFT_VALIDATION_FAILED`
- `PERSIST_FAILED`
- `JOB_CANCELLED`
- `JOB_STALE`
- `MODEL_CAPABILITY_MISMATCH`
- `SOURCE_IMPORT_RATE_LIMITED`
- `PREVIEW_BUILD_FAILED`
- `PUBLISH_SLUG_CONFLICT`

接口返回结构统一为：

```json
{
  "code": "STEP_GENERATION_FAILED",
  "message": "步骤 4 生成失败",
  "recoverability": "retry_from_step",
  "job": {
    "id": "...",
    "phase": "step_fill",
    "currentStepIndex": 3
  }
}
```

### 5.3 统一恢复编排器

建议新增服务层：

- `lib/services/draft-recovery.ts`

负责输出恢复建议：

- `retry_full_generation`
- `resume_running_job`
- `repair_from_step`
- `rollback_to_snapshot`
- `rebuild_preview`
- `restart_with_new_job`

前端所有恢复按钮都从该服务生成的状态机映射，不再各自决定。

---

## 6. 分阶段实施方案

## 阶段 A：任务持久化与生成恢复统一

### 目标

- 消除内存任务状态
- 让 reconnect / cancel / stale recovery 可跨实例工作

### 改造点

#### 数据层

- 新增 `draft_generation_jobs` schema + repository
- 为 `drafts` 增加 `activeGenerationJobId` nullable

#### 服务层

- `generate-tutorial-draft.ts`
  - `initiateGeneration()` 改为创建 job
  - 每个 phase / step 边界更新 job heartbeat
  - persist 完成后更新 job status
- `requestGenerationCancel()` 改为写 DB cancel flag
- 增加 `recoverStaleGenerationJobs()`，在读取草稿或启动新生成前触发轻量回收

#### API

- `POST /api/drafts/[id]/generate`
  - 返回 `{ jobId }` 或流式 headers 带 job id
- `POST /api/drafts/[id]/cancel`
  - 改为针对 active job 发 cancel signal
- 新增 `GET /api/drafts/[id]/generation-status`
  - 返回当前 job 状态、phase、step、errorCode、recoverability

#### 前端

- `use-generation-progress.ts`
  - 不再把“是否 running”寄托给 draft 主记录字段
  - 进入页面先查 generation-status
  - reconnect 直接恢复到 job 视图

### 验收标准

- 浏览器刷新后能恢复进度
- 不同实例处理 generate / cancel 仍然正确
- 进程重启后 stale job 最终进入 failed 或 abandoned

## 阶段 B：统一恢复入口

### 目标

- 把现有零散恢复动作收敛成统一 UX

### 改造点

#### 服务层

- 新增 `draft-recovery.ts`
- 根据 draft + job + validation + snapshots 输出恢复建议

#### 前端

- 创建页、生成页、工作区、预览页共用 `RecoveryActions`
- 只暴露有限几个动作：
  - 重连
  - 全量重试
  - 从失败步骤修复
  - 回滚到最近快照
  - 放弃当前任务

### 验收标准

- 生成失败页和工作区失败提示使用同一错误码与动作集
- 用户不需要理解内部 patch 链和 phase 才能恢复

## 阶段 C：局部修复链路产品化

### 目标

- 让 step repair、tail repair、incremental regenerate 真正可用

### 改造点

#### 服务层

- 把“从失败步骤开始逐步 regenerate”下沉到单一服务：
  - `repairDraftFromStep(draftId, startStepIndex, modelId, instruction)`
- `incremental-regenerate.ts`
  - 从占位实现改为真实批量修复
  - 先算 `affectedIndices`
  - 再按最小起点顺序重建后续步骤

#### 前端

- 工作区删除步骤、重排章节、编辑结构后：
  - 自动标记 `firstInvalidStep`
  - 直接提供“修复后续步骤”
- 对大型结构调整，先提示创建快照再执行

### 验收标准

- 删除中间步骤后，能一键修复尾部
- 调整 outline 后，能只重建受影响步骤

## 阶段 D：快照恢复纳入主流程

### 目标

- 把 snapshot 从隐藏能力变成标准恢复方式

### 改造点

- 结构性操作前自动建快照：
  - 删除步骤
  - 大规模重排
  - 恢复失败尾部前
  - 发布前
- 工作区新增快照面板：
  - 最近快照
  - 自动备份标识
  - 一键恢复

### 验收标准

- 用户可以在工作区直接回滚
- restore 后 validation、syncState、preview 均同步刷新

## 阶段 E：幂等、竞态与一致性收口

### 目标

- 解决重复创建、重复发布、模糊预览错误

### 改造点

#### 创建草稿

- `POST /api/drafts` 支持 `Idempotency-Key`
- client submit 锁定
- 若相同 key 已创建成功，直接返回原 draft id

#### 发布

- 移除“先查再写”模式
- 直接 insert published row，依赖唯一约束
- 统一把 unique violation 映射为 409

#### 预览

- payload / assembler 构建失败时返回结构化错误：
  - `NO_TUTORIAL_CONTENT`
  - `INVALID_PATCH_CHAIN`
  - `PREVIEW_BUILD_FAILED`
- UI 根据错误码直接跳转到恢复动作

### 验收标准

- 重复提交创建不会产生重复草稿
- 并发发布同 slug 返回稳定 409
- 预览错误可定位到生成问题还是结构问题

---

## 7. 影响文件清单

### 7.1 必改

- `lib/services/generate-tutorial-draft.ts`
- `lib/ai/multi-phase-generator.ts`
- `components/tutorial/use-generation-progress.ts`
- `components/drafts/use-draft-workspace-controller.ts`
- `components/drafts/draft-client.ts`
- `lib/services/publish-draft.ts`
- `lib/services/draft-queries.ts`
- `app/api/drafts/[id]/generate/route.ts`
- `app/api/drafts/[id]/cancel/route.ts`
- `app/api/drafts/[id]/publish/route.ts`

### 7.2 新增

- `lib/repositories/draft-generation-job-repository.ts`
- `lib/services/draft-recovery.ts`
- `lib/types/generation-job.ts`
- `lib/schemas/generation-job.ts`
- `components/tutorial/recovery-actions.tsx`
- `app/api/drafts/[id]/generation-status/route.ts`

### 7.3 建议补强

- `lib/services/incremental-regenerate.ts`
- `lib/services/draft-snapshots.ts`
- `app/api/drafts/[id]/incremental-regenerate/route.ts`
- `components/remote-preview-page.tsx`
- `components/tutorial/use-remote-resource.ts`
- `components/create-draft-form.tsx`

---

## 8. 测试计划

### 8.1 单元测试

- generation job 状态迁移
- stale job 判定
- recovery action 选择逻辑
- publish slug conflict 映射
- idempotency key 命中逻辑

### 8.2 集成测试

- 生成中刷新页面后重连
- step 失败后从失败步骤修复
- 删除中间步骤后 repair tail
- preview build 失败后展示正确恢复动作
- 并发发布同 slug

### 8.3 回归测试

- 现有 GitHub partial success 导入不能退化
- 现有 generation progress UI 仍能显示 outline / steps / validation
- registry fallback tutorial 不受影响

---

## 9. 埋点与观测

建议新增事件：

- `generation_job_started`
- `generation_job_reconnected`
- `generation_job_cancelled`
- `generation_job_stale_recovered`
- `generation_retry_full`
- `generation_retry_from_step`
- `snapshot_auto_created`
- `snapshot_restored`
- `preview_build_failed`
- `publish_slug_conflict`

建议新增指标：

- job stale ratio
- retry-from-step success rate
- snapshot restore success rate
- preview failure rate
- duplicate draft creation avoided count

---

## 10. 实施优先级

### P0

- 持久化 generation job
- 统一 generation error code
- stale-running 回收
- 创建草稿幂等
- 发布冲突原子化

### P1

- recovery orchestrator
- step/tail/incremental repair 收敛
- snapshot UI 接入
- preview 错误结构化

### P2

- 编辑 / 预览统一 retry policy
- 更细的恢复事件埋点
- 更完整的后台 job 清理工具

---

## 11. 建议实施顺序

1. 先做阶段 A 和阶段 E 中的发布原子化
2. 然后做阶段 B，把 UI 恢复动作收口
3. 再做阶段 C 和 D，把已有能力产品化
4. 最后补监控、埋点、运营回溯能力

原因：

- 不先解决 job 持久化，所有 reconnect / cancel / retry 都不稳
- 不先收掉幂等与竞态，越往上叠恢复入口越容易放大状态混乱

---

## 12. 非目标

本方案不包含：

- 重写 tutorial assembler
- 替换 CodeHike 渲染器
- 引入全新的队列中间件
- 改变 TutorialDraft DSL 结构
- 改动 explore / tags / profile 业务

这些不在本轮可靠性治理主路径内。
