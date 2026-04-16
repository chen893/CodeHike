# VibeDocs 全流程可靠性任务清单

> 基于 `docs/20260416-fullflow-reliability-implementation-plan.md` 拆出的可执行任务列表。
> 使用方式：按 `P0 -> P1 -> P2` 顺序推进；每个任务都要求同时完成实现、回归测试、文档同步。

---

## 1. 执行原则

1. 先收口“任务状态真相源”，再做恢复入口和 UI。
2. 先解决幂等、竞态、状态漂移，再叠更多恢复能力。
3. 所有新增失败分支都必须返回结构化 `code`，不能继续靠 `message` 猜测。
4. 所有恢复动作都必须补测试和埋点，否则后续无法判断是否有效。

---

## 2. 推荐顺序

### P0

- [x] T001 持久化 generation job 数据模型
- [x] T002 生成服务改造为 job 驱动
- [x] T003 `generation-status` 查询接口
- [x] T004 cancel / stale recovery 收口
- [x] T005 统一 generation error code
- [x] T006 创建草稿幂等化
- [x] T007 发布 slug 冲突原子化
- [x] T008 P0 测试与埋点

### P1

- [ ] T101 恢复编排器 `draft-recovery`
- [ ] T102 生成页恢复 UI 收口
- [ ] T103 工作区 repair / regenerate 收口
- [ ] T104 incremental regenerate 落实为真实能力
- [ ] T105 snapshot 恢复接入工作区
- [ ] T106 预览错误结构化和恢复入口
- [ ] T107 P1 测试与埋点

### P2

- [ ] T201 编辑保存 / 预览加载统一 retry policy
- [ ] T202 可靠性后台观测指标
- [ ] T203 运维工具与数据修复脚本

---

## 3. P0 任务

## T001 持久化 generation job 数据模型

**目标**

- 把进程内 `activeGenerations` 替换为数据库中的 job 记录。

**主要改动**

- 新增 `draft_generation_jobs` 表
- 新增 `lib/schemas/generation-job.ts`
- 新增 `lib/types/generation-job.ts`
- 新增 `lib/repositories/draft-generation-job-repository.ts`
- 为 `drafts` 增加 `activeGenerationJobId`

**影响文件**

- `lib/db/schema.ts`
- `lib/repositories/*`
- `lib/types/*`
- `lib/schemas/*`

**完成定义**

- 能创建 job
- 能更新 job phase / step / retry / heartbeat / error
- draft 可以引用当前 active job

**依赖**

- 无

## T002 生成服务改造为 job 驱动

**目标**

- `generate-tutorial-draft.ts` 不再依赖模块级内存 `Map` 作为唯一真相源。

**主要改动**

- 生成开始时创建 job
- outline / step-fill / validate / persist 各阶段写 job 状态
- step 边界写 heartbeat
- 完成 / 失败 / 取消统一写回 job 和 draft

**影响文件**

- `lib/services/generate-tutorial-draft.ts`
- `lib/ai/multi-phase-generator.ts`

**完成定义**

- 任何生成请求都能查到唯一 job
- draft 页面刷新后能根据 job 恢复状态
- 生成异常时 job 最终不会永久卡在 `running`

**依赖**

- T001

## T003 `generation-status` 查询接口

**目标**

- 让客户端以 job 为中心重连，而不是靠 `draft.generationState` 猜。

**主要改动**

- 新增 `GET /api/drafts/[id]/generation-status`
- 返回 job 状态、phase、stepIndex、totalSteps、errorCode、recoverability、modelId

**影响文件**

- `app/api/drafts/[id]/generation-status/route.ts`
- `components/drafts/draft-client.ts`

**完成定义**

- 前端能单独查询当前 job
- job 不存在、已完成、已失败、已取消的返回语义稳定

**依赖**

- T001
- T002

## T004 cancel / stale recovery 收口

**目标**

- 支持跨实例 cancel，并能回收僵尸 `running` job。

**主要改动**

- cancel API 改为更新 job cancel signal
- 读取草稿 / 启动新生成前触发 stale 检查
- 超过 lease 且 heartbeat 过期的 job 自动回收

**影响文件**

- `app/api/drafts/[id]/cancel/route.ts`
- `lib/services/generate-tutorial-draft.ts`
- `lib/repositories/draft-generation-job-repository.ts`

**完成定义**

- cancel 不依赖命中原进程
- stale job 会转成 `failed` 或 `abandoned`
- draft 不会因进程重启永久显示 `running`

**依赖**

- T001
- T002

## T005 统一 generation error code

**目标**

- 用结构化错误码替代文本猜测。

**主要改动**

- 定义错误码枚举和 recoverability 枚举
- 生成、预览、发布等关键接口统一输出 `{ code, message, recoverability }`
- 前端错误分类改为 code 驱动

**影响文件**

- `lib/errors/*`
- `components/tutorial/use-generation-progress.ts`
- `components/drafts/use-draft-workspace-controller.ts`
- `app/api/drafts/[id]/generate/route.ts`

**完成定义**

- outline 失败、step 失败、persist 失败、cancelled 都能稳定区分
- 前端不再靠 `message.includes()` 选择恢复动作

**依赖**

- T002
- T003

## T006 创建草稿幂等化

**目标**

- 防止网络抖动和连点制造重复草稿。

**主要改动**

- client 端提交锁
- `POST /api/drafts` 支持 `Idempotency-Key`
- 服务层支持同 key 返回同一 draft

**影响文件**

- `components/drafts/use-create-draft-form-controller.ts`
- `components/create-draft-form.tsx`
- `components/drafts/draft-client.ts`
- `app/api/drafts/route.ts`
- `lib/services/create-draft.ts`

**完成定义**

- 相同请求重复发出不会产生多个 draft
- 用户重复点击后只看到同一个结果

**依赖**

- 无

## T007 发布 slug 冲突原子化

**目标**

- 发布冲突稳定返回 `409`，不再依赖先读后写。

**主要改动**

- 移除发布前 `isSlugTaken()` 作为最终依据
- 依赖 DB 唯一约束
- 捕获 unique violation 并映射为结构化 `PUBLISH_SLUG_CONFLICT`

**影响文件**

- `lib/services/publish-draft.ts`
- `app/api/drafts/[id]/publish/route.ts`
- `lib/repositories/published-tutorial-repository.ts`

**完成定义**

- 并发发布同 slug 时只有一个成功
- 失败请求稳定返回 `409`

**依赖**

- 无

## T008 P0 测试与埋点

**目标**

- 给 P0 基础设施补最小可靠回归。

**测试清单**

- generation job 状态迁移
- stale job 回收
- cancel 后状态变更
- 创建草稿幂等
- 发布 slug 冲突

**埋点清单**

- `generation_job_started`
- `generation_job_cancelled`
- `generation_job_stale_recovered`
- `publish_slug_conflict`
- `draft_create_idempotency_hit`

**完成定义**

- 关键状态机和竞态场景有自动化覆盖
- 失败恢复主链路有观测数据

**依赖**

- T001 ~ T007

---

## 4. P1 任务

## T101 恢复编排器 `draft-recovery`

**目标**

- 输出统一恢复建议，而不是让每个 controller 各自判断。

**主要改动**

- 新增 `lib/services/draft-recovery.ts`
- 输入：draft、job、validation、snapshots
- 输出：推荐动作列表和默认动作

**恢复动作范围**

- `resume_running_job`
- `retry_full_generation`
- `repair_from_step`
- `rollback_to_snapshot`
- `rebuild_preview`
- `restart_with_new_job`

**完成定义**

- 生成页、工作区、预览页都能共享同一个恢复判断结果

**依赖**

- T003
- T005

## T102 生成页恢复 UI 收口

**目标**

- 生成页只展示统一恢复动作，不再自己维护多套失败分支。

**主要改动**

- `use-generation-progress.ts` 切到 job + recovery 模式
- 新增或提取 `RecoveryActions` 组件
- reconnect、retry、retry-from-step 统一走 recovery 结果

**影响文件**

- `components/tutorial/use-generation-progress.ts`
- `components/tutorial/generation-progress-view.tsx`
- `components/tutorial/recovery-actions.tsx`

**完成定义**

- 生成页遇到失败时按钮稳定、可解释、可重复进入

**依赖**

- T101

## T103 工作区 repair / regenerate 收口

**目标**

- 把单步 regenerate、失败尾部 repair 收敛到统一服务入口。

**主要改动**

- 新增服务端 `repairDraftFromStep(...)`
- 工作区不再在前端 for-loop 调多个 `regenerateDraftStepRequest`
- 保留单步 regenerate，但内部走同一能力层

**影响文件**

- `lib/services/regenerate-draft-step.ts`
- `components/drafts/use-draft-workspace-controller.ts`
- `app/api/drafts/[id]/steps/[stepId]/regenerate/route.ts`

**完成定义**

- 从失败步骤修复只需一个后端入口
- 恢复链路稳定继承 `modelId`

**依赖**

- T005
- T101

## T104 incremental regenerate 落实为真实能力

**目标**

- 把现有占位的 incremental regenerate 变成可用能力。

**主要改动**

- `computeAffectedSteps()` 保留
- `regenerateAffectedSteps()` 从“仅返回计数”改为真实执行修复
- 受影响步后续全部顺序重建

**影响文件**

- `lib/services/incremental-regenerate.ts`
- `app/api/drafts/[id]/incremental-regenerate/route.ts`

**完成定义**

- 大纲变化后能够只修复受影响步骤
- 修复完成后 validation 与 syncState 正确更新

**依赖**

- T103

## T105 snapshot 恢复接入工作区

**目标**

- 让 snapshot 从隐藏 API 变成标准恢复手段。

**主要改动**

- 结构性操作前自动建快照
- 工作区增加 snapshot 面板
- restore 后自动 reload draft

**影响文件**

- `lib/services/draft-snapshots.ts`
- `app/api/drafts/[id]/snapshots/*`
- `components/drafts/*`

**完成定义**

- 用户可在工作区查看、创建、恢复快照
- restore 前自动备份可见

**依赖**

- T101

## T106 预览错误结构化和恢复入口

**目标**

- 把预览白屏 / 通用错误改成可操作的恢复提示。

**主要改动**

- payload 构建错误码结构化
- 区分：
  - `NO_TUTORIAL_CONTENT`
  - `INVALID_PATCH_CHAIN`
  - `PREVIEW_BUILD_FAILED`
- 预览页接入 recovery actions

**影响文件**

- `lib/services/draft-queries.ts`
- `app/api/drafts/[id]/payload/route.ts`
- `components/remote-preview-page.tsx`
- `components/tutorial/use-remote-resource.ts`

**完成定义**

- 预览失败时用户能直接知道该去重试生成、修复步骤还是回滚快照

**依赖**

- T005
- T101

## T107 P1 测试与埋点

**测试清单**

- 生成失败页恢复动作选择
- 从失败步骤修复
- 删除中间步骤后 repair tail
- snapshot restore
- incremental regenerate
- preview build 失败恢复

**埋点清单**

- `generation_retry_full`
- `generation_retry_from_step`
- `snapshot_auto_created`
- `snapshot_restored`
- `preview_build_failed`

**依赖**

- T101 ~ T106

---

## 5. P2 任务

## T201 编辑保存 / 预览加载统一 retry policy

**目标**

- 让短暂网络抖动尽量不直接暴露给用户。

**主要改动**

- 为低风险读取请求加有限次 backoff retry
- 为可安全重试的 mutation 加标准重试策略
- 错误提示统一化

**影响文件**

- `components/drafts/draft-client.ts`
- `components/tutorial/tutorial-client.ts`
- `components/tutorial/use-remote-resource.ts`

**完成定义**

- 预览 / 读取类请求在短暂失败后可自动恢复
- mutation 不因重复重试产生脏写

**依赖**

- T005

## T202 可靠性后台观测指标

**目标**

- 能看见恢复链路是否真的有效。

**主要改动**

- 新增 reliability dashboard 所需 SQL / service / admin 页面
- 核心指标：
  - stale job ratio
  - retry-from-step success rate
  - snapshot restore success rate
  - preview failure rate

**影响文件**

- `lib/monitoring/*`
- `app/admin/*` 或内部 dashboard

**完成定义**

- 至少能按日查看核心恢复指标

**依赖**

- T008
- T107

## T203 运维工具与数据修复脚本

**目标**

- 降低线上出现脏状态后的人工处理成本。

**主要改动**

- 提供 job 清理脚本
- 提供 draft/job 对账脚本
- 提供卡死 draft 状态修复脚本

**影响文件**

- `scripts/*` 或 `lib/services/admin-*`

**完成定义**

- 常见脏状态有可复用的运维入口

**依赖**

- T001
- T002
- T004

---

## 6. 里程碑验收

## 里程碑 M1：P0 完成

- [x] 生成任务状态不再依赖内存
- [x] 创建草稿重复提交不会重复建 draft
- [x] 发布 slug 冲突稳定返回 `409`
- [x] 至少 5 个 P0 场景有自动化测试

## 里程碑 M2：P1 完成

- [ ] 生成页、工作区、预览页共享恢复语义
- [ ] snapshot 成为标准恢复入口
- [ ] incremental regenerate 可实际使用
- [ ] 至少 5 个恢复场景有自动化测试

## 里程碑 M3：P2 完成

- [ ] 核心恢复指标可观测
- [ ] 常见脏状态有脚本可修复

---

## 7. 暂不纳入本轮

- [ ] 不重写 tutorial assembler
- [ ] 不替换 CodeHike 渲染器
- [ ] 不引入全新异步队列基础设施
- [ ] 不修改 TutorialDraft DSL
- [ ] 不扩展 explore / tags / profile 范围
