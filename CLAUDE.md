# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VibeDocs — AI 驱动的 scrollytelling 源码教学教程生成与渲染应用。用户输入源码 + 教学意图，系统生成可编辑、可预览、可发布的逐步构建式教程。

## Dev Commands

```bash
npm run dev     # next dev --webpack
npm run build   # next build --webpack
npm start       # next start (production)
```

无测试、无 lint 配置。

数据库需要 `DATABASE_URL` 环境变量（PostgreSQL），AI 生成需要 `DEEPSEEK_API_KEY`。

## Architecture

### 核心渲染链路（已跑通，不重写）

```text
TutorialDraft (DSL JSON)
  → lib/tutorial-assembler.js   # patch 应用 + diff 计算 + CodeHike 高亮 + focus/marks/change 注入 → TutorialStep[]
  → lib/tutorial-payload.js     # 包装为 TutorialPayload
  → components/tutorial-scrolly-demo.jsx  # 客户端 scrollytelling 渲染（含 StepRail 导航 + MobileCodeFrame）
```

### 两条消费路径

1. **静态直出** — `app/[slug]/page.jsx`：服务端先查 DB published，回退到 registry → `buildTutorialSteps()` → 直接渲染
2. **远程加载** — `app/[slug]/request/page.jsx`：客户端 fetch `/api/tutorials/[slug]` → payload → 渲染

### 草稿编辑流程

```text
用户输入源码 + TeachingBrief
  → app/new/page.tsx → 创建 DraftRecord
  → app/drafts/[id]/page.tsx → 编辑工作区（AppShell 布局）
  → AI 生成（v2 多阶段：outline → step-fill → validate）
  → 编辑 steps / meta（CodeMirror 代码编辑 + Markdown 富文本编辑）→ 预览 → 发布
```

### 多阶段生成链路（v3.1 核心）

```text
lib/ai/outline-prompt.ts       # 阶段一 prompt：教学大纲生成
lib/ai/step-fill-prompt.ts     # 阶段二 prompt：单步内容填充
lib/ai/multi-phase-generator.ts # SSE 流编排：outline → step-fill (with retry) → validate
lib/services/generate-tutorial-draft.ts # v1/v2 入口分发 + 异步持久化
lib/services/compute-generation-quality.ts # 质量指标计算
```

### 分层结构

| 层 | 目录 | 职责 |
|----|------|------|
| 路由 | `app/` | Next.js App Router 页面和 API route handlers |
| 组件 | `components/` | 客户端交互组件（编辑器、表单、渲染器、AppShell） |
| 服务 | `lib/services/` | 业务逻辑（创建、生成、发布、质量计算），被 API 路由调用 |
| 数据 | `lib/repositories/` | Drizzle ORM 数据访问，返回类型化 domain 对象 |
| Schema | `lib/schemas/` | Zod schema（AI 输出约束 + API 校验），`index.ts` 为 barrel |
| DB | `lib/db/` | Drizzle schema 定义 + 连接池 |
| AI | `lib/ai/` | prompt 模板 + AI 调用封装（v1 单次生成 + v2 多阶段生成） |
| 渲染 | `lib/tutorial-assembler.js` | patch 应用 + diff 计算 + 高亮 + change 注解注入（纯服务端） |

### 编辑器组件

| 组件 | 用途 |
|------|------|
| `components/code-mirror-editor.tsx` | CodeMirror 6 代码编辑器封装（多语言支持、只读模式） |
| `components/markdown-editor.tsx` | Markdown 编辑器（工具栏 + 编辑/预览切换，含 XSS 安全过滤） |
| `components/app-shell.tsx` | 应用外壳（桌面端侧边栏 + 移动端抽屉导航） |

### 渲染器增强组件（tutorial-scrolly-demo.jsx 内）

| 组件/Handler | 用途 |
|------|------|
| `StepRail` | 侧边步骤导航（点击跳转 + hover tooltip 显示变化量） |
| `MobileCodeFrame` | 移动端每步内嵌代码块（文字-代码交替布局） |
| `changeIndicator` | CodeHike handler：新增行 `+` / 修改行 `~` 视觉标注 |
| `tokenTransitions` | CodeHike handler：token 级过渡动画 |
| `animateLineDiff` | 行级增删动画（幽灵行淡出 + 新增行淡入） |

### 数据源

- `content/sample-tutorial.js` — 示例教程 DSL 数据（registry 回退）
- `lib/tutorial-registry.js` — 静态 slug 注册表

### 关键约束

- 所有 patch 应用、高亮、focus/marks/change 注入都在**服务端**完成
- 客户端只消费渲染好的 payload，不反推 patch、不重建教学结构
- 静态页和远程页共享同一个 `TutorialScrollyDemo` 渲染器
- AI 输出用 `Output.object({ schema })` 结构化，Zod schema 同时约束 AI 输出 + API 校验
- `app/[slug]/page.jsx` 用 `React.cache()` 避免重复 DB 查询和高亮计算
- 混用 JS（`.js`/`.jsx`，渲染链路）和 TS（`.ts`/`.tsx`，新增功能），不要强行统一
- 多阶段生成通过 SSE 流向客户端推送进度，前端 `GenerationProgress` 组件解析 v2 协议
- 生成质量评估（`GenerationQuality`）不阻塞发布，仅作数据监控
- DB schema 中 `generationOutline`、`generationQuality` 为可选 jsonb，向后兼容 v3.0 草稿

## Docs Index

| 文件 | 内容 |
|------|------|
| `docs/tutorial-data-format.md` | 教程 DSL 完整定义 — JSON 结构、Patch 机制、代码组装算法 |
| `docs/vibe-docs-prd.md` | VibeDocs v3.0 PRD — 产品定义、数据模型、P0 范围 |
| `docs/vibe-docs-technical-design.md` | v3.0 技术方案 — 架构分层、API 设计、AI 生成链路 |
| `docs/v3-implementation-issues.md` | v3.0 实施问题记录 — 技术决策和解决方案 |
| `docs/vibe-docs-v3.1-prd.md` | v3.1 PRD — 多阶段生成、阅读交互增强 |
| `docs/vibe-docs-v3.2-prd.md` | v3.2 PRD — 草稿 CRUD 闭环、步骤管理、多文件输入、Patch 编辑 |
| `docs/mini-redux.js` | Redux 核心源码实现（简化版），测试用文件 |
| `docs/archive/` | 已归档的过时文档（v3.0 实施计划、旧渲染流程） |

**修改代码前务必先阅读相关文档。** 数据结构变更对照 `tutorial-data-format.md`，新增功能对照 `vibe-docs-technical-design.md`。

## AGENTS.md

仓库根目录有 `AGENTS.md`，包含产品定位、权威数据模型定义、P0 范围边界、预览层交互硬约束、实现优先级。做产品决策前必读。

## Tech Stack

| 技术 | 用途 |
|------|------|
| Next.js 16 (App Router) | 路由、Server Components、Route Handlers |
| React 19 | UI |
| PostgreSQL + Drizzle ORM | 持久化 DraftRecord / PublishedTutorial |
| Vercel AI SDK v6 (`ai`) | `generateText` + `Output.object` + Zod 结构化生成 |
| DeepSeek (via `@ai-sdk/openai-compatible`) | LLM provider |
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
