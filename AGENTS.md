# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeDocs — AI 驱动的 scrollytelling 源码教学教程生成与渲染应用。用户输入源码 + 教学意图，系统生成可编辑、可预览、可发布的逐步构建式教程。

## Dev Commands

```bash
npm run dev     # next dev --webpack
npm run build   # next build --webpack
npm test        # node:test smoke checks for layering + core helpers
npm run review:generation -- --draft-id <id> --variant <name> [--mode existing|generate]   # 生成质量 review / CSV 记录
npm start       # next start (production)
```

无 lint 配置。已有最小 `node:test` 回归集，覆盖结构边界和几个核心纯函数。

数据库需要 `DATABASE_URL` 环境变量（PostgreSQL），AI 生成需要所选 provider 的 API Key；默认模型是 `minimax/MiniMax-M2.7`，需要 `MINIMAX_API_KEY`。

## Architecture

### 核心渲染链路（已跑通，不重写）

```text
TutorialDraft (DSL JSON)
  → lib/tutorial/assembler.js   # patch 应用 + diff 计算 + CodeHike 高亮 + focus/marks/change 注入 → TutorialStep[]
  → lib/tutorial/payload.js     # 包装为 TutorialPayload
  → components/tutorial/tutorial-scrolly-demo.jsx  # 客户端 scrollytelling 渲染（含 StepRail 导航 + MobileCodeFrame）
```

### 两条消费路径

1. **静态直出** — `app/[slug]/page.jsx`：服务端先查 DB published，回退到 registry → `buildTutorialSteps()` → 直接渲染
2. **远程加载** — `app/[slug]/request/page.jsx`：客户端 fetch `/api/tutorials/[slug]` → payload → 渲染

### 草稿编辑流程

```text
用户输入源码 + TeachingBrief
  → app/new/page.tsx → 创建 DraftRecord（支持多文件源码输入）
  → app/drafts/[id]/page.tsx → 编辑工作区（AppShell 布局）
  → AI 生成（v2 多阶段：outline → step-fill → validate）
  → 编辑 steps / meta：
      - 文案（eyebrow/title/lead/paragraphs）
      - 代码变更（patches find/replace + 文件选择）
      - 高亮区域（focus）+ 行标记（marks）
      - 实时代码预览 + 结构变更检测
  → 预览 → 发布
```

### 多阶段生成链路（v3.1 核心）

```text
lib/ai/outline-prompt.ts       # 阶段一 prompt：教学大纲生成
lib/ai/step-fill-prompt.ts     # 阶段二 prompt：单步内容填充
lib/ai/multi-phase-generator.ts # SSE 流编排：outline → step-fill (with retry) → validate
lib/services/generate-tutorial-draft.ts # v1/v2 入口分发 + 异步持久化
lib/repositories/draft-generation-job-repository.ts # generation job 持久化读写，draft.activeGenerationJobId 指向当前任务
lib/services/compute-generation-quality.ts # 质量指标计算
```

### 分层结构

| 层 | 目录 | 职责 |
|----|------|------|
| 路由 | `app/` | Next.js App Router 页面和 API route handlers |
| 组件 | `components/` | 客户端交互组件（编辑器、表单、渲染器、AppShell） |
| 服务 | `lib/services/` | 业务逻辑（创建、生成、发布、质量计算、搜索、标签、用户档案），被 API 路由和页面调用 |
| 数据 | `lib/repositories/` | Drizzle ORM 数据访问，返回类型化 domain 对象 |
| Schema | `lib/schemas/` | Zod schema（AI 输出约束 + API 校验），`index.ts` 为 barrel |
| 类型 | `lib/types/` | app-facing DTO、客户端响应类型、共享 domain type |
| DB | `lib/db/` | Drizzle schema 定义 + 连接池 |
| AI | `lib/ai/` | prompt 模板 + AI 调用封装（v1 单次生成 + v2 多阶段生成 + AI 标签生成） |
| 渲染 | `lib/tutorial/` | patch 应用、payload 构建、registry、草稿 patch 工具（纯服务端） |
| 监控 | `lib/monitoring/` | 事件类型定义、埋点 helpers、指标收集（analytics, metrics, event-types） |
| 工具 | `lib/utils/` | 校验、序列化、hash、slug、请求版本化 |

### 编辑器组件

| 组件 | 用途 |
|------|------|
| `components/code-mirror-editor.tsx` | CodeMirror 6 代码编辑器封装（多语言支持、只读模式） |
| `components/markdown-editor.tsx` | Markdown 编辑器（工具栏 + 编辑/预览切换，含 XSS 安全过滤） |
| `components/app-shell.tsx` | 应用外壳（桌面端侧边栏 + 移动端抽屉导航） |

### Feature 目录

| 目录 | 用途 |
|------|------|
| `components/drafts/` | 草稿列表、创建、编辑、发布相关 client hooks / feature clients / 子视图 |
| `components/create-draft/` | GitHub 仓库导入（公开仓库免登录、OAuth 提升配额、懒加载文件树、导入 Tab 视图） |
| `components/step-editor/` | 步骤编辑器子组件（diff 视图、patch 编辑、focus/marks 面板、代码预览、行选择交互） |
| `components/tutorial/` | 教程阅读、远程加载、生成进度协议解析、渲染器子模块、标签编辑 |
| `components/explore/` | 探索页面客户端交互（搜索输入、标签筛选、排序切换） |
| `components/profile/` | 用户档案编辑、用户名设置、profile feature client |
| `components/ui/` | 共享 UI primitive |

### 渲染器增强组件（`components/tutorial/*`）

| 组件/Handler | 用途 |
|------|------|
| `StepRail` | 侧边步骤导航（点击跳转 + hover tooltip 显示变化量） |
| `MobileCodeFrame` | 移动端每步内嵌代码块（文字-代码交替布局） |
| `changeIndicator` | CodeHike handler：新增行 `+` / 修改行 `~` 视觉标注 |
| `tokenTransitions` | CodeHike handler：token 级过渡动画 |
| `animateLineDiff` | 行级增删动画（幽灵行淡出 + 新增行淡入） |

### 数据源

- `content/sample-tutorial.js` — 示例教程 DSL 数据（registry 回退）
- `lib/tutorial/registry.js` — 静态 slug 注册表

### v3.7 发现与标签系统

```text
用户浏览路径：
  /explore          → 搜索 + 标签筛选 + 排序 + 分页
  /tags             → 所有标签 + 教程计数
  /u/[username]     → 公开用户档案 + 已发布教程列表

数据流：
  app/explore/page.tsx       → lib/services/explore-service.ts  → lib/repositories/tutorial-search-repository.ts
  app/tags/page.tsx          → lib/services/explore-service.ts  → lib/repositories/tag-repository.ts
  app/u/[username]/page.tsx  → lib/services/user-profile-service.ts → lib/repositories/user-repository.ts

标签生命周期：
  教程发布 → lib/services/publish-draft.ts (fire-and-forget)
           → lib/services/tag-service.ts
           → lib/ai/tag-generator.ts (AI 生成，语言回退)
           → lib/repositories/tag-repository.ts (getOrCreateTag + setTagsForTutorial 事务)

搜索实现：
  PostgreSQL full-text search（simple config）
  ts_vector 索引 tutorialDraftSnapshot->meta->title + slug
  ⚠️ Drizzle sql 模板不支持 JSONB -> 操作符与插值列引用混用，需使用原始 SQL 列名

用户档案：
  users 表增加 username (unique, nullable)、bio (text)
  首次设置 username 后不可更改（username 路由返回 409）
  username 自动加入 RESERVED_SLUGS 防止路由冲突
```

### 关键约束

- 所有 patch 应用、高亮、focus/marks/change 注入都在**服务端**完成
- 客户端只消费渲染好的 payload，不反推 patch、不重建教学结构
- 静态页和远程页共享同一个 `TutorialScrollyDemo` 渲染器
- AI 输出用 `Output.object({ schema })` 结构化，Zod schema 同时约束 AI 输出 + API 校验
- `app/[slug]/page.jsx` 通过 `lib/services/tutorial-queries.ts` 中的 `cache()` 包装函数避免重复 DB 查询和高亮计算
- 混用 JS（`.js`/`.jsx`，渲染链路）和 TS（`.ts`/`.tsx`，新增功能），不要强行统一
- 多阶段生成通过 SSE 流向客户端推送进度，前端 `GenerationProgress` 组件解析 v2 协议
- retrieval outline 仍使用源码工具；step-fill 默认走无工具的 scoped prompt（当前代码目标文件 + 原始源码参考），仅当 `VIBEDOCS_STEP_FILL_TOOLS=1` 时重新启用 step-fill tools
- generation 运行态的持久化真相源为 `draft_generation_jobs` + `drafts.activeGenerationJobId`；新增生成状态读写优先经过 repository / service，不要再扩展进程内 `Map` 作为唯一状态源
- 生成质量评估（`GenerationQuality`）不阻塞发布，仅作数据监控
- 生成质量迭代工作流走 `npm run review:generation` + `docs/workflow/generation-quality-loop.md`，所有 prompt / 流程实验都要落 CSV 和 JSON report
- step-fill 重试耗尽后不再继续往后生成；失败占位文本属于无效教程内容，必须被 validation 拦截
- 多文件输入允许在生成快照中为后续 `targetFiles` 预植入内部 placeholder stub，但最终 `tutorialDraft.baseCode` 只能 materialize 真正被 patch 过的这些文件，不能把未使用占位文件泄露到最终教程
- DB schema 中 `generationOutline`、`generationQuality` 为可选 jsonb，向后兼容 v3.0 草稿
- `app/*` 入口主要依赖 `components/*` 和 `lib/services/*`；页面可额外依赖 `lib/utils/client-data.ts`（序列化）和 `lib/draft-status.ts`（状态 badge）；route handler 可额外依赖 `lib/api/route-errors.ts`（错误处理）；不要在页面或 route handler 中直接调用 `lib/repositories/*`、`lib/db/*`、`lib/tutorial/*`
- client 侧 `fetch` 统一进入 feature client / hook / controller，不要散落在视图组件中
- GitHub 导入默认支持**公开仓库免登录**；若用户已通过 GitHub OAuth 登录，则复用 access token 提升 rate limit，不要再把公开仓库导入强制绑到登录态
- GitHub 导入的大仓库文件树必须支持 `truncated` 懒加载；不要假设 `git/trees?recursive=1` 一次就能返回完整仓库结构
- GitHub 导入的部分成功场景必须保留成功文件结果返回给 client，不要把单文件失败升级成整批失败
- 探索/搜索查询中用户表必须使用 `leftJoin(users)`，因为 `drafts.userId` 可能为 NULL（未关联用户的教程）
- AI 标签生成（`lib/ai/tag-generator.ts`）为 fire-and-forget，发布失败不阻塞主流程
- 监控埋点（`lib/monitoring/analytics.ts`）为 fire-and-forget，不得阻塞页面渲染

### 后续新建代码建议

#### 新页面 / 新 API

- 新 page、layout、route handler 默认只做编排和协议转换；如果需要查库、组装 payload、调用 AI、拼接 tutorial pipeline，先新增 `lib/services/*`，再由 `app/*` 调用。
- `app/*` 返回给 client component 的数据，优先先过 `lib/utils/client-data.ts` 这类 DTO 序列化层，不要在页面里继续写 `JSON.parse(JSON.stringify(...))`。
- 新增动态数据页面时，先判断是否需要 `await connection()` 或其他动态渲染边界，避免误进 prerender。

#### 新客户端交互

- 任何新的客户端请求，默认先建 feature client：例如 `components/drafts/*-client.ts`、`components/tutorial/*-client.ts`。URL、`fetch`、响应解析、错误消息归一化都放这里。
- 组件状态机、重试、竞态保护、轮询、SSE 解析放在 `use-*.ts` / `use-*-controller.ts`；视图组件只接收状态和回调，不直接 `fetch()`。
- 如果一个客户端文件同时包含“协议解析 + 大量 JSX + 多个 mutation”，默认继续拆成 `client + hook/controller + view/subviews`，不要再堆回单个 500+ 行容器。

#### 新组件 / 新目录

- 草稿相关 UI 优先放 `components/drafts/`，教程阅读和渲染相关优先放 `components/tutorial/`，只有跨 feature 复用的纯展示组件才放 `components/ui/` 或根级共享组件。
- 不要再新增新的根级 feature 大文件，优先新增 feature 子目录下的小模块；根级 `components/*.tsx` 更适合作为兼容导出或少量共享入口。
- 新 tutorial 渲染链路相关逻辑统一放 `lib/tutorial/*`，不要再新增新的 `lib/tutorial-*.js` 根级文件。兼容 shim 只在迁移阶段需要，新增功能不要依赖它们。

#### 新类型 / 新 schema / 新 helper

- API 请求校验、AI 输出约束放 `lib/schemas/*`；client-facing DTO、轻量响应类型放 `lib/types/*`。
- 纯 tutorial 领域 helper 放 `lib/tutorial/*`；纯通用 helper 放 `lib/utils/*`；如果 helper 只服务某个 feature，优先就近放在 feature 目录，而不是继续堆到 `lib/utils/*` 根下。
- 新 client 响应如果会被多个组件消费，先补类型定义，再写调用方，避免继续依赖隐式 `response.json()` 结构。

#### 新监控 / 新埋点

- 新事件类型先在 `lib/monitoring/event-types.ts` 的 `ALLOWED_EVENT_TYPES` 中注册，再写 convenience helper。
- 埋点调用统一走 `lib/monitoring/analytics.ts` 中的 helper，保持 fire-and-forget 模式。
- 不要在 Server Component 渲染关键路径中 `await` 埋点结果。

#### 新搜索 / 新筛选

- PostgreSQL 全文搜索使用 `simple` 配置（不分词、不词干化），适合中英混合场景。
- 涉及 JSONB 字段查询时，Drizzle `sql` 模板不支持 `->` / `->>` 操作符与 `${columnRef}` 插值混用，需使用原始 SQL 列名（如 `"published_tutorials"."tutorial_draft_snapshot"`）。
- 需要过滤 JSONB 内嵌字段的场景（如 lang），优先在 SQL 层实现；当前应用层过滤可接受但 total 计数不准确，数据量增长后应迁移至 SQL。
- 任何关联 `users` 表的教程查询，使用 `leftJoin` 而非 `innerJoin`，确保未关联用户的教程不被过滤。

#### 新测试 / 新文档

- 触及分层边界、请求竞态、patch 链、纯函数算法时，要同步补 `tests/*.test.js`；优先补结构约束测试和纯函数测试，不要求一开始就引入完整测试框架。
- 新增顶层目录、修改默认分层模式、引入新的 feature folder 时，要同步更新 `AGENTS.md` 和 `docs/vibedocs-technical-handbook.md`。
- **每次 commit 前必须同步更新三份文档：** `AGENTS.md`（目录/分层/规则变更）、`docs/vibedocs-technical-handbook.md`（组件清单/API 端点/服务层/UI 规格/实施阶段）、`docs/tutorial-data-format.md`（DSL 格式/编辑器交互行为）。聚焦 diff 直接影响的条目，不需要逐行比对全文。
- 实施中如果出现新的结构性问题、竞态问题、框架约束坑，继续记录到 `docs/v3-implementation-issues.md`。

## Docs Index

| 文件 | 内容 |
|------|------|
| `docs/vibedocs-technical-handbook.md` | **主文档** — 产品、架构、数据、API、UI、AI 生成的技术手册 |
| `docs/tutorial-data-format.md` | 教程 DSL 权威规范 — JSON 结构、Patch 机制、代码组装算法、校验规则 |
| `docs/v3-implementation-issues.md` | 实施问题记录 — 技术决策和解决方案（活跃维护） |
| `docs/20260416-fullflow-reliability-implementation-plan.md` | 全流程可靠性实施方案 — 新建、生成、编辑、预览、发布的失败恢复与一致性改造计划 |
| `docs/20260416-fullflow-reliability-task-list.md` | 全流程可靠性任务清单 — 按 P0/P1/P2 拆分的可执行任务、依赖和验收标准 |
| `docs/workflow/generation-quality-loop.md` | 生成质量迭代工作流 — 标准评分、CSV 沉淀、keep/revert 决策和停机条件 |
| `docs/ui-review-workflow.md` | UI 审查流程 — 截图规范、模型审查、修复验证（已迁移至 `docs/workflow/`） |
| `docs/mini-redux.js` | Redux 核心源码实现（简化版），测试用样本源码 |
| `docs/archive/` | 已归档的 PRD、技术设计、实施计划、版本任务分解等历史文档 |

**修改代码前先阅读 `vibedocs-technical-handbook.md`。** 数据结构细节对照 `tutorial-data-format.md`。
**实施过程中如遇到问题，必须将问题现象、根因分析和解决方案补充记录到 `docs/v3-implementation-issues.md`。**

## AGENTS.md

仓库根目录有 `AGENTS.md`，包含产品定位、权威数据模型定义、P0 范围边界、预览层交互硬约束、实现优先级。做产品决策前必读。

## Tech Stack

| 技术 | 用途 |
|------|------|
| Next.js 16 (App Router) | 路由、Server Components、Route Handlers |
| React 19 | UI |
| PostgreSQL + Drizzle ORM | 持久化 DraftRecord / PublishedTutorial |
| Vercel AI SDK v6 (`ai`) | `generateText` + `Output.object` + Zod 结构化生成 |
| DeepSeek / OpenAI / MiniMax / Zhipu | 多 provider LLM 支持（MiniMax、Zhipu 走 OpenAI-compatible provider） |
| Zod 4 | schema 定义（AI 输出约束 + API 校验 + DB 写入校验） |
| CodeHike | scrollytelling 代码高亮 + focus/marks/change handler |
| CodeMirror 6 | 步骤编辑器中的代码编辑 |

## External Docs

**始终通过 Context7 MCP 工具获取最新版本文档。** 使用流程：先 `resolve-library-id` → 再 `query-docs`。

- **Vercel AI SDK (ai)** — 目标 **v6**，API 与 v4/v5 有 Breaking Changes，严禁凭记忆使用旧 API
- **Next.js** — App Router API（route handlers、server components、generateStaticParams）
- **Code Hike** — scrollytelling 代码高亮库，官方文档 https://codehike.org/docs
- **Drizzle ORM** — schema 定义、query API、PostgreSQL 迁移
- **CodeMirror 6** — 代码编辑器，`@codemirror/*` 系列包
