# VibeDocs v3.0 实现计划

> 本文档是 v3.0 P0 功能的详细实施指南，对照 `vibe-docs-prd.md`（产品需求）和 `vibe-docs-technical-design.md`（技术方案）编写。

## 项目现状

当前仓库是纯 JavaScript 的 Next.js 16 + React 19 项目，已跑通完整渲染链路：

```
TutorialDraft (DSL JSON)
  → lib/tutorial-assembler.js   # patch 应用 + CodeHike 高亮 + focus/marks 注入
  → lib/tutorial-payload.js     # 包装为 TutorialPayload
  → components/tutorial-scrolly-demo.jsx  # 客户端 scrollytelling 渲染
```

v3.0 的任务是在这条渲染底座之上，补齐「源码输入 → AI 生成 → 编辑 → 预览 → 发布」的产品闭环。

### 不重写清单

以下模块在整个 v3.0 实现过程中不做修改：

- `lib/tutorial-assembler.js`
- `lib/tutorial-payload.js`
- `components/tutorial-scrolly-demo.jsx`
- `components/remote-tutorial-page.jsx`
- `content/sample-tutorial.js`
- `lib/tutorial-registry.js`

---

## 技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 新代码语言 | TypeScript（.ts/.tsx） | 类型安全，现有 .js/.jsx 保持原样（`allowJs: true`） |
| ORM | Drizzle | TS-native，JSONB 支持好，无代码生成步骤 |
| 数据库 | PostgreSQL | Serverless 部署兼容性 |
| AI SDK | Vercel AI SDK v6 | `streamText` + `Output.object` 结构化流式输出 |
| Schema | Zod | 同时用于 AI 输出约束 + API 校验 + DB 写入校验 |
| API 层 | Route Handlers | 不引入 tRPC / server actions，共享 TS 类型实现类型安全 |
| 步骤操作 | Append-only | P0 不做删除/排序/中间插入 |

---

## Phase 1：数据库与对象模型

### 1.1 依赖安装

```bash
npm install drizzle-orm pg zod
npm install -D drizzle-kit @types/pg dotenv typescript @types/react @types/react-dom
```

### 1.2 配置文件

**`tsconfig.json`**（新建）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**`drizzle.config.ts`**（新建）

```typescript
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### 1.3 Drizzle Schema

**`lib/db/schema.ts`**（新建）

`drafts` 表：

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | `uuid` PK `defaultRandom()` | 主键 |
| `status` | `varchar(16)` | `'draft' \| 'published'` |
| `source_items` | `jsonb` `.$type<SourceItem[]>()` | 源码输入 |
| `teaching_brief` | `jsonb` `.$type<TeachingBrief>()` | 教学意图 |
| `tutorial_draft` | `jsonb` `.$type<TutorialDraft \| null>()` | AI 生成的教程内容 |
| `sync_state` | `varchar(16)` default `'empty'` | `'empty' \| 'fresh' \| 'stale'` |
| `input_hash` | `varchar(64)` | sourceItems + teachingBrief 的 SHA-256 |
| `tutorial_draft_input_hash` | `varchar(64)` | 生成时的 inputHash 快照 |
| `generation_state` | `varchar(16)` default `'idle'` | `'idle' \| 'running' \| 'succeeded' \| 'failed'` |
| `generation_error_message` | `text` | 失败时的错误信息 |
| `generation_model` | `varchar(64)` | 使用的模型名 |
| `generation_last_at` | `timestamp` | 最后生成时间 |
| `validation_valid` | `boolean` default `false` | 校验是否通过 |
| `validation_errors` | `jsonb` `.$type<string[]>()` default `[]` | 校验错误列表 |
| `validation_checked_at` | `timestamp` | 最后校验时间 |
| `published_slug` | `varchar(256)` | 发布后的 slug |
| `published_tutorial_id` | `uuid` | 关联的 PublishedTutorial id |
| `published_at` | `timestamp` | 发布时间 |
| `created_at` | `timestamp` `defaultNow()` | 创建时间 |
| `updated_at` | `timestamp` `defaultNow()` | 更新时间 |

`published_tutorials` 表：

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | `uuid` PK `defaultRandom()` | 主键 |
| `draft_record_id` | `uuid` FK → `drafts.id` | 关联 DraftRecord |
| `slug` | `varchar(256)` `notNull().unique()` | 发布 slug |
| `tutorial_draft_snapshot` | `jsonb` `.$type<TutorialDraft>()` `notNull()` | 冻结快照 |
| `created_at` | `timestamp` `defaultNow()` | 创建时间 |
| `published_at` | `timestamp` `defaultNow()` | 发布时间 |

### 1.4 数据库连接

**`lib/db/index.ts`**（新建）

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
```

### 1.5 Zod Schema 体系

**`lib/schemas/source-item.ts`**（新建）

```typescript
import { z } from 'zod';

export const sourceItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal('snippet'),
  label: z.string().min(1),
  content: z.string().min(1),
  language: z.string().optional(),
});

export type SourceItem = z.infer<typeof sourceItemSchema>;
```

**`lib/schemas/teaching-brief.ts`**（新建）

```typescript
import { z } from 'zod';

export const teachingBriefSchema = z.object({
  topic: z.string().min(1),
  audience_level: z.enum(['beginner', 'intermediate', 'advanced']),
  core_question: z.string().min(1),
  ignore_scope: z.string(),
  output_language: z.string().min(1),
  desired_depth: z.enum(['short', 'medium', 'deep']).optional(),
  target_step_count: z.number().int().min(1).max(20).optional(),
  preferred_style: z.string().optional(),
});

export type TeachingBrief = z.infer<typeof teachingBriefSchema>;
```

**`lib/schemas/tutorial-draft.ts`**（新建，核心文件）

三重用途：AI 输出约束、API 校验、DB 写入校验。

```typescript
import { z } from 'zod';

const contentPatchSchema = z.object({
  find: z.string().min(1),
  replace: z.string(),
});

const contentRangeSchema = z.object({
  find: z.string().min(1),
});

const contentMarkSchema = z.object({
  find: z.string().min(1),
  color: z.string().min(1),
});

const tutorialStepSchema = z.object({
  id: z.string().min(1),
  eyebrow: z.string().optional(),
  title: z.string().min(1),
  lead: z.string().optional(),
  paragraphs: z.array(z.string()),
  patches: z.array(contentPatchSchema).optional(),
  focus: contentRangeSchema.nullable().optional(),
  marks: z.array(contentMarkSchema).optional(),
});

export const tutorialDraftSchema = z.object({
  meta: z.object({
    title: z.string().min(1),
    lang: z.string().min(1),
    fileName: z.string().min(1),
    description: z.string().min(1),
  }),
  intro: z.object({
    paragraphs: z.array(z.string()),
  }),
  baseCode: z.string().min(1),
  steps: z.array(tutorialStepSchema).min(1),
});

export type TutorialDraft = z.infer<typeof tutorialDraftSchema>;
export type TutorialStep = z.infer<typeof tutorialStepSchema>;
export type ContentPatch = z.infer<typeof contentPatchSchema>;
export type ContentRange = z.infer<typeof contentRangeSchema>;
export type ContentMark = z.infer<typeof contentMarkSchema>;
```

**`lib/schemas/api.ts`**（新建）

API 请求 schema：

```typescript
import { z } from 'zod';
import { sourceItemSchema, teachingBriefSchema, tutorialStepSchema } from './index';

// POST /api/drafts
export const createDraftRequestSchema = z.object({
  sourceItems: z.array(sourceItemSchema).min(1),
  teachingBrief: teachingBriefSchema,
});

// PATCH /api/drafts/[id]
export const updateDraftRequestSchema = z.object({
  teachingBrief: teachingBriefSchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  introParagraphs: z.array(z.string()).optional(),
});

// POST /api/drafts/[id]/steps
export const appendStepRequestSchema = z.object({
  step: tutorialStepSchema,
});

// PATCH /api/drafts/[id]/steps/[stepId]
export const updateStepRequestSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  lead: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
});

// POST /api/drafts/[id]/steps/[stepId]/regenerate
export const regenerateStepRequestSchema = z.object({
  mode: z.enum(['prose', 'step']),
  instruction: z.string().optional(),
});

// POST /api/drafts/[id]/publish
export const publishRequestSchema = z.object({
  slug: z.string().optional(),
});
```

**`lib/schemas/index.ts`**（新建）— 统一导出

### 1.6 共享 TS 类型

**`lib/types/api.ts`**（新建）

从 Zod schema 推导的类型，供前后端共享：

- `DraftRecord` — 含所有操作字段（syncState, generation, validation, published）
- `PublishedTutorial` — 发布快照
- `ApiErrorResponse` — 统一错误格式 `{ message, code, details }`

### 1.7 Repository 层

**`lib/repositories/draft-repository.ts`**（新建）

方法：
- `createDraft(data)` — 创建，`tutorialDraft` 为 null，`syncState` 为 `'empty'`
- `getDraftById(id)` — 按 ID 读取
- `updateDraft(id, data)` — 更新指定字段
- `updateDraftTutorial(id, tutorialDraft, generationMeta)` — 生成完成后回写
- `updateDraftGenerationState(id, state, errorMessage?)` — 更新生成状态
- `updateDraftValidation(id, valid, errors)` — 更新校验状态
- `publishDraft(id, slug, publishedTutorialId)` — 标记为已发布

**`lib/repositories/published-tutorial-repository.ts`**（新建）

方法：
- `createPublishedTutorial(data)` — 创建发布快照
- `getPublishedBySlug(slug)` — 按 slug 读取
- `isSlugTaken(slug)` — 检查 slug 是否被占用

### 1.8 工具函数

**`lib/utils/hash.ts`** — `computeInputHash(sourceItems, teachingBrief)` SHA-256

**`lib/utils/slug.ts`** — `generateSlug(title)` 生成 URL-safe slug；`isReservedSlug(slug)` 检查保留路径

**`lib/utils/validation.ts`** — `validateTutorialDraft(tutorialDraft)` 调用 `buildTutorialSteps()` 做可执行校验

### 1.9 Phase 1 文件清单

| 操作 | 文件路径 | 用途 |
|------|---------|------|
| 新建 | `tsconfig.json` | TypeScript 配置 |
| 新建 | `drizzle.config.ts` | Drizzle Kit 迁移配置 |
| 新建 | `lib/db/schema.ts` | Drizzle 表定义 |
| 新建 | `lib/db/index.ts` | 数据库连接 |
| 新建 | `lib/schemas/source-item.ts` | SourceItem schema |
| 新建 | `lib/schemas/teaching-brief.ts` | TeachingBrief schema |
| 新建 | `lib/schemas/tutorial-draft.ts` | TutorialDraft schema（核心） |
| 新建 | `lib/schemas/api.ts` | API 请求 schema |
| 新建 | `lib/schemas/index.ts` | 统一导出 |
| 新建 | `lib/types/api.ts` | 共享 TS 类型 |
| 新建 | `lib/repositories/draft-repository.ts` | DraftRecord 仓储 |
| 新建 | `lib/repositories/published-tutorial-repository.ts` | PublishedTutorial 仓储 |
| 新建 | `lib/utils/hash.ts` | 输入哈希计算 |
| 新建 | `lib/utils/slug.ts` | Slug 生成与校验 |
| 新建 | `lib/utils/validation.ts` | 可执行校验 |
| 修改 | `.gitignore` | 添加 `.env.local` |

### 1.10 验证清单

- [ ] `npx drizzle-kit push` 能成功建表
- [ ] 手动插入 DraftRecord，能读回完整数据
- [ ] `tutorialDraftSchema.parse()` 能正确校验 `content/sample-tutorial.js` 的数据
- [ ] `validateTutorialDraft(sampleTutorial)` 返回 `{ valid: true, errors: [] }`
- [ ] `generateSlug()` 生成的 slug 不含特殊字符
- [ ] `npx tsc --noEmit` 编译通过

---

## Phase 2：输入与 AI 生成

### 2.1 依赖安装

```bash
npm install ai @ai-sdk/react @ai-sdk/openai
```

> 根据实际使用的 AI provider 选择对应 SDK，也可以用 `@ai-sdk/anthropic` 等。

### 2.2 AI 生成链路

**`lib/ai/prompt-templates.ts`**（新建）

构造 system prompt 和 user prompt。

System prompt 要点：
- 角色：代码教程生成器
- 输出格式：严格 JSON，遵循 TutorialDraft 结构
- Patch 规则：find/replace 格式，find 必须唯一匹配，按数组顺序依次应用
- 教学原则：每步一个概念，变化最小化，讲构建过程而非结果说明书
- 教学意图必须显式影响生成结果

User prompt 结构：
- 源码内容（label + content）
- 教学意图（topic, audience_level, core_question, ignore_scope, output_language）

**`lib/ai/tutorial-generator.ts`**（新建，核心文件）

封装 AI 调用，返回流式结果：

```typescript
import { streamText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { tutorialDraftSchema } from '../schemas/tutorial-draft';

export function createTutorialGenerationStream(sourceItems, teachingBrief, modelId = 'gpt-4o') {
  const { systemPrompt, userPrompt } = buildGeneratePrompt(sourceItems, teachingBrief);

  return streamText({
    model: openai(modelId),
    system: systemPrompt,
    prompt: userPrompt,
    output: Output.object({ schema: tutorialDraftSchema }),
  });
}
```

关键：使用 `streamText` + `Output.object`（Vercel AI SDK v6 的结构化流式输出 API），schema 直接传入 Zod schema。

### 2.3 应用服务层

**`lib/services/create-draft.ts`**（新建）

1. Zod 校验入参
2. 为 sourceItem 生成 UUID
3. 计算 `inputHash`
4. 调用 repository 创建 DraftRecord
5. 返回完整 DraftRecord

**`lib/services/generate-tutorial-draft.ts`**（新建）

1. 读取 DraftRecord
2. 设 `generationState = 'running'`
3. 创建流
4. 流完成后执行可执行校验
5. 成功：保存 `tutorialDraft`，设 `syncState = 'fresh'`，`generationState = 'succeeded'`
6. 失败：保存错误信息，`generationState = 'failed'`

### 2.4 API Route Handlers

**`app/api/drafts/route.ts`**（新建）

`POST /api/drafts` — 创建草稿，返回 201 + DraftRecord

**`app/api/drafts/[id]/route.ts`**（新建）

- `GET` — 读取草稿，返回 200 + DraftRecord 或 404
- `PATCH` — 更新 meta/intro/teachingBrief；如果 teachingBrief 变更，重算 inputHash 并检查 syncState

**`app/api/drafts/[id]/generate/route.ts`**（新建，系统最复杂的 handler）

`POST /api/drafts/[id]/generate` — SSE 流式生成

核心流程：
1. 标记 `generationState = 'running'`
2. 创建流
3. 双轨消费：SSE 推送到前端 + 后台收集完整结果
4. 流完成后执行可执行校验
5. 根据校验结果更新 DraftRecord
6. 返回 SSE 流给前端

SSE 实现方案：使用 `stream.body.tee()` 分流，一个给客户端，一个给服务端后台收集。

### 2.5 页面组件

**`app/new/page.tsx`**（新建）

输入页，Server Component。渲染源码输入和 Teaching Brief 输入区域。

**`components/create-draft-form.tsx`**（新建）

`"use client"` 客户端组件：
- 维护表单状态（sourceItems, teachingBrief）
- 提交时调用 `POST /api/drafts` 创建 DraftRecord
- 创建成功后自动调用 `POST /api/drafts/[id]/generate` 触发生成
- 生成过程中使用 `useObject` 消费 SSE 流，实时显示生成进度
- 生成完成后跳转到 `/drafts/[id]`

**`components/generation-progress.tsx`**（新建）

`"use client"` 客户端组件：
- 接收 `useObject` 返回的 partial TutorialDraft
- 实时渲染已生成的标题、简介、步骤列表（只读预览态）

### 2.6 Phase 2 文件清单

| 操作 | 文件路径 | 用途 |
|------|---------|------|
| 新建 | `lib/services/create-draft.ts` | 创建草稿服务 |
| 新建 | `lib/services/generate-tutorial-draft.ts` | 生成教程服务 |
| 新建 | `lib/ai/prompt-templates.ts` | AI prompt 模板 |
| 新建 | `lib/ai/tutorial-generator.ts` | AI 调用封装 |
| 新建 | `app/api/drafts/route.ts` | POST /api/drafts |
| 新建 | `app/api/drafts/[id]/route.ts` | GET + PATCH /api/drafts/[id] |
| 新建 | `app/api/drafts/[id]/generate/route.ts` | POST generate (SSE) |
| 新建 | `app/new/page.tsx` | 输入页 |
| 新建 | `components/create-draft-form.tsx` | 创建表单 |
| 新建 | `components/generation-progress.tsx` | 生成进度展示 |
| 修改 | `app/globals.css` | 添加输入页样式 |

### 2.7 验证清单

- [ ] `POST /api/drafts` 能创建 DraftRecord 并写入数据库
- [ ] `GET /api/drafts/[id]` 能读回完整 DraftRecord
- [ ] `POST /api/drafts/[id]/generate` 返回 SSE 流
- [ ] `useObject` 在客户端能逐步接收生成的 TutorialDraft
- [ ] 生成完成后 `tutorialDraft` 被正确保存到数据库
- [ ] 可执行校验自动运行，校验失败时 `generationState` 设为 `'failed'`
- [ ] `/new` 页面能完成从输入到生成的完整流程

---

## Phase 3：草稿工作区

### 3.1 应用服务层

**`lib/services/update-draft-meta.ts`**（新建）

更新 title/description/introParagraphs/teachingBrief。修改 teachingBrief 时重算 inputHash，检查 syncState。

**`lib/services/update-draft-step.ts`**（新建）

定位 step（按 id），只修改文案字段（eyebrow, title, lead, paragraphs），不动 patches/focus/marks。保存后运行可执行校验。

**`lib/services/append-draft-step.ts`**（新建）

追加 step 到 `tutorialDraft.steps` 末尾。保存后运行整篇可执行校验。

**`lib/services/regenerate-draft-step.ts`**（新建）

单步重新生成：
- `prose` 模式：只重新生成文案，保留 patches/focus/marks
- `step` 模式：重新生成整个 step（含 patches）
- 提供完整上下文给 AI（源码、teachingBrief、前后步骤）
- 生成完成后运行整篇可执行校验

### 3.2 API Route Handlers

**`app/api/drafts/[id]/steps/route.ts`**（新建）

`POST /api/drafts/[id]/steps` — 追加步骤

**`app/api/drafts/[id]/steps/[stepId]/route.ts`**（新建）

`PATCH /api/drafts/[id]/steps/[stepId]` — 编辑步骤文案

**`app/api/drafts/[id]/steps/[stepId]/regenerate/route.ts`**（新建）

`POST /api/drafts/[id]/steps/[stepId]/regenerate` — 单步重新生成

### 3.3 页面组件

**`app/drafts/[id]/page.tsx`**（新建）

草稿工作区页，Server Component。从数据库读取 DraftRecord，渲染编辑器。

**`components/draft-workspace.tsx`**（新建）

`"use client"` 主组件。布局：
- 顶部：草稿标题 + 状态指示器
- 左侧：步骤列表（可展开/折叠）
- 右侧：当前步骤的编辑面板

功能：编辑标题/简介、选择并编辑步骤、追加步骤、regenerate、保存、打开预览、发布

**`components/draft-meta-editor.tsx`**（新建）— meta/intro 编辑表单

**`components/step-editor.tsx`**（新建）— 单步文案编辑器

**`components/step-list.tsx`**（新建）— 步骤列表组件

### 3.4 Phase 3 文件清单

| 操作 | 文件路径 | 用途 |
|------|---------|------|
| 新建 | `lib/services/update-draft-meta.ts` | 更新元信息 |
| 新建 | `lib/services/update-draft-step.ts` | 编辑步骤文案 |
| 新建 | `lib/services/append-draft-step.ts` | 追加步骤 |
| 新建 | `lib/services/regenerate-draft-step.ts` | 单步 regenerate |
| 新建 | `app/api/drafts/[id]/steps/route.ts` | POST 追加步骤 |
| 新建 | `app/api/drafts/[id]/steps/[stepId]/route.ts` | PATCH 编辑步骤 |
| 新建 | `app/api/drafts/[id]/steps/[stepId]/regenerate/route.ts` | POST regenerate |
| 新建 | `app/drafts/[id]/page.tsx` | 草稿工作区页 |
| 新建 | `components/draft-workspace.tsx` | 工作区主组件 |
| 新建 | `components/draft-meta-editor.tsx` | Meta 编辑器 |
| 新建 | `components/step-editor.tsx` | 步骤编辑器 |
| 新建 | `components/step-list.tsx` | 步骤列表 |
| 修改 | `app/globals.css` | 工作区样式 |

### 3.5 验证清单

- [ ] `PATCH /api/drafts/[id]` 能更新标题和简介
- [ ] 修改 teachingBrief 后 syncState 正确变为 `'stale'`
- [ ] `PATCH .../steps/[stepId]` 能更新步骤文案
- [ ] 更新步骤后 validation 自动重新运行
- [ ] `POST .../steps` 能追加步骤到末尾
- [ ] 追加含 patches 的步骤后整篇校验仍通过
- [ ] `POST .../regenerate` 能重新生成步骤
- [ ] `/drafts/[id]` 页面能完整展示和编辑草稿

---

## Phase 4：草稿预览

### 4.1 应用服务层

**`lib/services/build-draft-preview-payload.ts`**（新建）

调用现有 `buildTutorialPayload(tutorialDraft)`（从 `lib/tutorial-payload.js` 导入），无需任何转换。DraftRecord.tutorialDraft 格式与 sample-tutorial.js 一致。

### 4.2 API Route Handler

**`app/api/drafts/[id]/payload/route.ts`**（新建）

`GET /api/drafts/[id]/payload` — 读取 DraftRecord，检查 tutorialDraft 存在，调用 `buildTutorialPayload`，返回 JSON。

### 4.3 页面路由

**`app/drafts/[id]/preview/page.tsx`**（新建）

直出预览页，Server Component。与现有 `app/[slug]/page.jsx` 模式一致，数据来源从 registry 变为数据库：
1. 读取 DraftRecord
2. 调用 `buildTutorialSteps(tutorialDraft)`
3. 渲染 `TutorialScrollyDemo`

**`app/drafts/[id]/preview/request/page.tsx`**（新建）

远程预览页。使用新的通用远程预览组件。

**`components/remote-preview-page.tsx`**（新建）

`"use client"` 客户端组件。与现有 `remote-tutorial-page.jsx` 逻辑一致，但 `fetchUrl` 由 prop 传入，不硬编码。

### 4.4 Phase 4 文件清单

| 操作 | 文件路径 | 用途 |
|------|---------|------|
| 新建 | `lib/services/build-draft-preview-payload.ts` | 构造预览 payload |
| 新建 | `app/api/drafts/[id]/payload/route.ts` | GET payload |
| 新建 | `app/drafts/[id]/preview/page.tsx` | 直出预览页 |
| 新建 | `app/drafts/[id]/preview/request/page.tsx` | 远程预览页 |
| 新建 | `components/remote-preview-page.tsx` | 通用远程预览组件 |

### 4.5 验证清单

- [ ] `GET /api/drafts/[id]/payload` 返回正确的 TutorialPayload
- [ ] `/drafts/[id]/preview` 直出渲染正常，高亮/动画正常
- [ ] `/drafts/[id]/preview/request` 远程渲染正常
- [ ] 预览使用同一个 `TutorialScrollyDemo` 渲染器
- [ ] 编辑后重新预览能反映变更

---

## Phase 5：发布

### 5.1 应用服务层

**`lib/services/publish-draft.ts`**（新建）

1. 前置条件检查：tutorialDraft 存在、syncState === 'fresh'、validationValid === true
2. 生成或使用用户提供的 slug
3. 检查 slug 保留路径和唯一性
4. 事务中执行：
   - 创建 `PublishedTutorial`（snapshot = tutorialDraft 深拷贝）
   - 更新 DraftRecord.status = 'published'，写入 publishedSlug/Id/At

### 5.2 API Route Handler

**`app/api/drafts/[id]/publish/route.ts`**（新建）

`POST /api/drafts/[id]/publish` — 发布草稿。前置条件不满足返回 409/422。

### 5.3 改造现有路由

**`app/[slug]/page.jsx`**（修改）

改造逻辑：优先从数据库 `published_tutorials` 按 slug 查询 → 找到则渲染 → 未找到则 fallback 到 registry（保留 sample 开发样例）。

**`app/api/tutorials/[slug]/route.js`**（修改）

同样改造：先查数据库，fallback 到 registry。

**`app/[slug]/request/page.jsx`**（修改）

同样改造。

### 5.4 首页更新

**`app/page.tsx`**（修改）

增加：已发布教程列表（从数据库查询）+ 「创建新教程」入口（链接到 `/new`）。

### 5.5 Phase 5 文件清单

| 操作 | 文件路径 | 用途 |
|------|---------|------|
| 新建 | `lib/services/publish-draft.ts` | 发布服务 |
| 新建 | `app/api/drafts/[id]/publish/route.ts` | POST publish |
| 修改 | `app/[slug]/page.jsx` | 优先读数据库 |
| 修改 | `app/api/tutorials/[slug]/route.js` | 优先读数据库 |
| 修改 | `app/[slug]/request/page.jsx` | 优先读数据库 |
| 修改 | `app/page.tsx` | 已发布列表 + 创建入口 |

### 5.6 验证清单

- [ ] `POST .../publish` 能创建 PublishedTutorial
- [ ] 发布事务正确执行（快照 + DraftRecord 同时更新）
- [ ] slug 唯一性约束生效
- [ ] 保留路径段被拦截
- [ ] syncState !== 'fresh' 或 validationValid === false 时发布被拒绝
- [ ] `/[slug]` 能展示已发布教程
- [ ] 后续编辑草稿不影响已发布内容
- [ ] `/sample` 仍正常工作（fallback）
- [ ] 首页展示已发布列表

---

## 跨阶段关注点

### 环境变量

`.env.local`（不提交到 Git）：

```
DATABASE_URL=postgresql://user:password@localhost:5432/vibedocs
OPENAI_API_KEY=sk-...
```

### 错误处理统一格式

```typescript
function errorResponse(message: string, code: string, status: number, details?: string[]) {
  return NextResponse.json({ message, code, details: details ?? [] }, { status });
}
```

错误码：`VALIDATION_ERROR`(400), `NOT_FOUND`(404), `CONFLICT`(409), `PRECONDITION_FAILED`(412), `GENERATION_FAILED`(500)

### 完整新增文件树

```
lib/
  db/
    schema.ts                          # Drizzle 表定义
    index.ts                           # 数据库连接
  schemas/
    source-item.ts                     # SourceItem Zod schema
    teaching-brief.ts                  # TeachingBrief Zod schema
    tutorial-draft.ts                  # TutorialDraft Zod schema（核心）
    api.ts                             # API 请求 schema
    index.ts                           # 统一导出
  types/
    api.ts                             # 共享 TS 类型
  repositories/
    draft-repository.ts                # DraftRecord 仓储
    published-tutorial-repository.ts   # PublishedTutorial 仓储
  services/
    create-draft.ts                    # 创建草稿
    generate-tutorial-draft.ts         # AI 生成
    update-draft-meta.ts               # 更新元信息
    update-draft-step.ts               # 编辑步骤
    append-draft-step.ts               # 追加步骤
    regenerate-draft-step.ts           # 单步 regenerate
    build-draft-preview-payload.ts     # 构造预览 payload
    publish-draft.ts                   # 发布
  ai/
    prompt-templates.ts                # AI prompt 模板
    tutorial-generator.ts              # AI 调用封装
  utils/
    hash.ts                            # 输入哈希
    slug.ts                            # Slug 生成
    validation.ts                      # 可执行校验

app/
  new/
    page.tsx                           # 输入页
  drafts/
    [id]/
      page.tsx                         # 草稿工作区
      preview/
        page.tsx                       # 直出预览
        request/
          page.tsx                     # 远程预览
  api/
    drafts/
      route.ts                         # POST /api/drafts
      [id]/
        route.ts                       # GET + PATCH /api/drafts/[id]
        generate/
          route.ts                     # POST generate (SSE)
        payload/
          route.ts                     # GET payload
        publish/
          route.ts                     # POST publish
        steps/
          route.ts                     # POST 追加步骤
          [stepId]/
            route.ts                   # PATCH 编辑步骤
            regenerate/
              route.ts                 # POST regenerate

components/
  create-draft-form.tsx                # 创建表单
  generation-progress.tsx              # 生成进度
  draft-workspace.tsx                  # 工作区主组件
  draft-meta-editor.tsx                # Meta 编辑器
  step-editor.tsx                      # 步骤编辑器
  step-list.tsx                        # 步骤列表
  remote-preview-page.tsx              # 通用远程预览

根目录:
  tsconfig.json                        # TypeScript 配置
  drizzle.config.ts                    # Drizzle Kit 配置
  .env.local                           # 环境变量（不提交）
```

### 关键风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| AI 生成结果无法被 buildTutorialSteps 消费 | 每次生成后自动运行可执行校验；prompt 中强调 patch 唯一匹配约束 |
| AI SDK v6 API 细节不确定 | 实现前通过 Context7 获取最新文档验证 |
| 流式生成 + 持久化时序问题 | 使用 `stream.body.tee()` 双轨消费 |
| TS 与 JS 互操作问题 | `allowJs: true`，所有新增代码用 TS |
