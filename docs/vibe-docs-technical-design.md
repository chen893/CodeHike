# VibeDocs v3.0 技术方案

**文档版本：** v1.0  
**最后更新：** 2026-04-08  
**对应 PRD：** `docs/vibe-docs-prd.md`  
**文档目标：** 以当前仓库已经跑通的通用渲染链路为基础，给出一套可直接落地的 v3.0 技术实现方案。

---

## 0. 文档定位

这份文档不是愿景描述，也不是页面原型说明，而是实现层技术约束。

它回答四个问题：

1. 现有系统的哪部分继续保留。
2. 为了完成 PRD，需要新增哪些模块。
3. 顶层数据对象、接口和页面该如何组织。
4. P0 应该按什么顺序落地，才能在不重写渲染层的前提下完成闭环。

本方案默认遵循两个前提：

1. 当前 “数据 -> 组装 -> 页面渲染” 链路是稳定底座，不推翻重来。
2. P0 先做最小闭环，不直接上复杂工作流、队列系统或多版本编辑器。

---

## 1. 当前技术基线

### 1.1 现有技术栈

- Next.js 16 App Router
- React 19
- CodeHike 1.1
- PostgreSQL + Drizzle ORM
- Vercel AI SDK v6（结构化生成 + 流式输出）
- Zod（schema 定义 + 校验 + AI 输出约束）
- Node.js runtime route handlers

### 1.2 当前已跑通链路

当前仓库已经实现两条稳定链路：

```text
Tutorial Draft
  -> buildTutorialSteps()
  -> TutorialScrollyDemo
  -> 服务端直出预览
```

```text
Tutorial Draft
  -> buildTutorialPayload()
  -> /api/tutorials/[slug]
  -> RemoteTutorialPage
  -> TutorialScrollyDemo
```

### 1.3 当前应复用的模块

这些模块是 v3.0 的底座，不应重写语义：

- `lib/tutorial-assembler.js`
- `lib/tutorial-payload.js`
- `components/tutorial-scrolly-demo.jsx`
- `components/remote-tutorial-page.jsx`

它们已经验证了三件事：

1. `Tutorial Draft` 可以稳定组装为 `Tutorial Payload`。
2. 代码高亮、patch 应用、focus/marks 注入可以全部留在服务端。
3. 静态页和远程页可以复用同一套渲染器。

---

## 2. 技术目标与非目标

### 2.1 v3.0 技术目标

v3.0 要在当前渲染底座之上补齐以下能力：

1. 创建 `DraftRecord`
2. 保存 `Source Item` 和 `Teaching Brief`
3. 生成 `tutorialDraft`
4. 编辑标题、简介、步骤文案
5. 新增步骤
6. 单步 regenerate
7. 预览草稿
8. 发布为 `Published Tutorial`

### 2.2 v3.0 技术非目标

P0 不做：

1. 删除步骤
2. 调整步骤顺序
3. 直接编辑 `patches`
4. 直接编辑 `focus`
5. 直接编辑 `marks`
6. 任务队列系统
7. 实时协作编辑
8. 复杂 revision 树

原因很直接：

- 当前 patch 链是严格顺序应用的。
- 删除和重排会引入 patch rebase 问题。
- 复杂异步架构会显著抬高首版实现成本。

---

## 3. 核心设计原则

### 3.1 单一内容模型

系统只有一套权威教程内容模型：

- `DraftRecord.tutorialDraft`

渲染层只消费它的派生结果，不允许引入第二套并行内容结构。

### 3.2 持久化与内容分层

顶层持久化对象是：

- `DraftRecord`
- `PublishedTutorial`

内容层对象是：

- `Tutorial Draft`

渲染层对象是：

- `Tutorial Payload`

### 3.3 服务端组装

以下逻辑全部留在服务端：

- patch 应用
- focus 锚点解析
- marks 锚点解析
- CodeHike 高亮
- payload 构造

浏览器只负责：

- 发起请求
- 渲染表单
- 消费 payload

### 3.4 预览与发布同构

草稿预览和已发布内容必须共享同一套渲染器与 payload 结构。

### 3.5 P0 先做“可完成”，再做“可视化复杂编辑”

P0 默认以“结构化编辑 + 远程预览 + 发布快照”为目标，不先做 patch 可视化编辑器。

---

## 4. 目标系统架构

v3.0 目标架构如下：

```text
Creator UI
  -> Route Handlers
  -> Application Services
  -> Repositories
  -> DraftRecord / PublishedTutorial storage

DraftRecord.tutorialDraft
  -> buildTutorialSteps / buildTutorialPayload
  -> TutorialScrollyDemo
  -> Draft Preview / Published Page
```

按职责拆分后，系统分成五层：

### 4.1 展示层

负责：

- 输入页
- 草稿工作区
- 预览页
- 发布页

### 4.2 接口层

负责：

- 接收表单或 JSON 请求
- 做参数校验
- 调用应用服务
- 返回统一错误结构

### 4.3 应用服务层

负责：

- 创建草稿
- 生成草稿
- 更新草稿
- 构造预览 payload
- 发布草稿

### 4.4 仓储层

负责：

- 读写 `DraftRecord`
- 读写 `PublishedTutorial`
- 维护 slug 唯一性

### 4.5 渲染底座层

负责：

- 把 `tutorialDraft` 组装成步骤或 payload
- 把 payload 渲染为教学页面

---

## 5. 数据模型设计

### 5.1 `SourceItem`

P0 先支持单文件代码粘贴，但对象结构仍保持可扩展：

```ts
type SourceItem = {
  id: string
  kind: "snippet"
  label: string
  content: string
  language?: string
}
```

说明：

- `kind` 预留给后续 GitHub 导入、多文件输入。
- `id` 需要稳定，便于生成结果追溯源码来源。

### 5.2 `TeachingBrief`

```ts
type TeachingBrief = {
  topic: string
  audience_level: "beginner" | "intermediate" | "advanced"
  core_question: string
  ignore_scope: string
  output_language: string
  desired_depth?: "short" | "medium" | "deep"
  target_step_count?: number
  preferred_style?: string
}
```

P0 必填：

- `topic`
- `audience_level`
- `core_question`
- `ignore_scope`
- `output_language`

### 5.3 `TutorialDraft`

保持与当前 DSL 对齐：

```ts
type TutorialDraft = {
  meta: {
    title: string
    lang: string
    fileName: string
    description: string
  }
  intro: {
    paragraphs: string[]
  }
  baseCode: string
  steps: Array<{
    id: string
    eyebrow?: string
    title: string
    lead?: string
    paragraphs: string[]
    patches?: Array<{
      find: string
      replace: string
    }>
    focus?: {
      find: string
    } | null
    marks?: Array<{
      find: string
      color: string
    }>
  }>
}
```

### 5.4 `DraftRecord`

```ts
type DraftRecord = {
  id: string
  sourceItems: SourceItem[]
  teachingBrief: TeachingBrief
  tutorialDraft: TutorialDraft | null
  status: "draft" | "published"
  createdAt: string
  updatedAt: string
  syncState: "empty" | "fresh" | "stale"
  inputHash: string
  tutorialDraftInputHash?: string | null
  generation?: {
    state: "idle" | "running" | "succeeded" | "failed"
    errorMessage?: string | null
    model?: string | null
    lastGeneratedAt?: string | null
  }
  validation?: {
    valid: boolean
    errors: string[]
    checkedAt?: string | null
  }
  published?: {
    slug: string
    publishedTutorialId: string
    publishedAt: string
  } | null
}
```

设计说明：

1. `tutorialDraft` 在创建草稿时可以为空，生成后再填充。
2. `inputHash` 代表当前 `sourceItems + teachingBrief` 的输入快照。
3. `tutorialDraftInputHash` 代表当前教程内容是基于哪次输入生成出来的。
4. 当用户修改 `teachingBrief` 时，如果 `tutorialDraftInputHash !== inputHash`，必须把 `syncState` 标为 `stale`。
5. `generation` 和 `validation` 是服务状态，不属于教程内容本体。
6. `status` 在 P0 只需要 `draft` 和 `published`。

### 5.5 `PublishedTutorial`

```ts
type PublishedTutorial = {
  id: string
  draftRecordId: string
  slug: string
  tutorialDraftSnapshot: TutorialDraft
  createdAt: string
  publishedAt: string
}
```

设计说明：

1. 发布快照必须直接持有 `tutorialDraftSnapshot`。
2. 发布页只依赖快照，不回读活跃草稿。

---

## 6. 持久化方案

### 6.1 数据库选型：PostgreSQL + Drizzle ORM

P0 直接采用 PostgreSQL 作为持久化存储，ORM 层使用 Drizzle。

选型理由：

1. PostgreSQL 支持 JSONB 字段，适合存储 `tutorialDraft`、`sourceItems` 等结构化大对象。
2. 原生支持事务，保证发布等复合操作的原子性。
3. 可部署于 Vercel Postgres、Neon、Supabase 等云服务，无本地文件系统依赖。
4. Drizzle 是轻量级 TypeScript ORM，schema 直接写 TS，与项目的类型定义复用。

不选 SQLite 的原因：

1. 部署目标包括 Vercel 等 Serverless 平台，SQLite 依赖本地文件系统，不适用于只读或临时文件系统环境。
2. 虽然有 Turso（libSQL 云服务）作为替代，但引入额外概念和依赖。
3. PostgreSQL 生态更成熟，迁移工具、云托管方案更丰富。

不选 Prisma 的原因：

1. Prisma 的 schema 定义语言（`.prisma` 文件）与 TypeScript 类型系统割裂，需要额外生成步骤。
2. Drizzle 的 schema 直接写 TS，与项目的 Zod schema、API 类型可以共享定义。
3. Drizzle 对 JSONB 字段的操作更直观。

### 6.2 推荐的 PostgreSQL 托管方案

本地开发：

```text
docker run -d -p 5432:5432 -e POSTGRES_DB=vibedocs postgres:16
```

或使用本地安装的 PostgreSQL。

云部署（按需选择）：

- **Neon**：Serverless PostgreSQL，免费层足够 P0 使用，与 Vercel 集成最好。
- **Supabase**：PostgreSQL + 额外功能（Auth、Storage），如果后续需要用户系统可一步到位。
- **Vercel Postgres**：基于 Neon，Vercel 控制台内直接创建。

### 6.3 仓储抽象

所有数据库访问必须通过 Drizzle query 层封装，不在 route handler 中直接写 SQL。

仓储模块：

- `lib/db/schema.ts` — Drizzle table 定义
- `lib/db/index.ts` — 数据库连接与客户端初始化
- `lib/repositories/draft-repository.ts`
- `lib/repositories/published-tutorial-repository.ts`

### 6.4 数据库 Schema 设计要点

- `drafts` 表：存储 `DraftRecord`，其中 `sourceItems`、`teachingBrief`、`tutorialDraft` 使用 JSONB 字段。
- `published_tutorials` 表：存储 `PublishedTutorial`，其中 `tutorialDraftSnapshot` 使用 JSONB 字段。
- `slug` 字段加唯一索引，保证发布 slug 不冲突。
- `inputHash` 和 `tutorialDraftInputHash` 用于检测输入与内容的同步状态。

### 6.5 写入策略

所有写操作通过 Drizzle 事务执行：

1. 发布操作（创建 `PublishedTutorial` + 更新 `DraftRecord.status`）必须在同一事务内完成。
2. 单步 regenerate 涉及校验 + 更新 `tutorialDraft` + 更新 `generation` 状态，也应在事务内。

### 6.4 slug 策略

发布时 slug 规则：

1. 优先基于 `tutorialDraft.meta.title` 生成 slug
2. 若冲突，则追加短后缀
3. slug 一旦发布，不再随草稿标题变化
4. slug 分配时必须避开保留路径段

P0 保留路径至少包括：

- `new`
- `drafts`
- `api`
- `_next`
- `favicon.ico`
- `robots.txt`
- `sitemap.xml`

---

## 7. 模块拆分与目录建议

以下是建议目录，不要求一次建完，但后续实现应朝这个边界靠拢。

### 7.1 复用现有模块

保留：

- `lib/tutorial-assembler.js`
- `lib/tutorial-payload.js`
- `components/tutorial-scrolly-demo.jsx`
- `components/remote-tutorial-page.jsx`

补充约束：

当前 `components/remote-tutorial-page.jsx` 是面向 `/api/tutorials/[slug]` 的样例容器。进入 v3.0 时，要么把它泛化为接受 `fetchUrl` 的通用远程预览壳，要么新增一个草稿预览专用远程壳；不要在草稿预览和发布远程预览上复制两套近似客户端组件。

### 7.2 新增领域模块

建议新增：

```text
lib/
  db/
    schema.ts            # Drizzle table 定义（drafts, published_tutorials）
    index.ts             # 数据库连接与客户端初始化
  drafts/
    draft-schema.ts      # Zod schema，同时用于 API 校验 + AI 输出约束
    draft-validator.ts
    draft-mutations.ts
  published/
    published-schema.ts
  repositories/
    draft-repository.ts
    published-tutorial-repository.ts
  services/
    create-draft.ts
    generate-tutorial-draft.ts
    update-draft-meta.ts
    update-draft-step.ts
    append-draft-step.ts
    regenerate-draft-step.ts
    build-draft-preview-payload.ts
    publish-draft.ts
  ai/
    tutorial-generator.ts
    prompt-templates.ts
  types/
    api.ts               # 共享的 request/response 类型定义
```

以及：

```text
components/
  remote-preview-page.jsx
```

### 7.3 页面与 API 模块

建议新增：

```text
app/
  new/page.jsx
  drafts/[id]/page.jsx
  drafts/[id]/preview/page.jsx
  drafts/[id]/preview/request/page.jsx
  api/drafts/route.js
  api/drafts/[id]/route.js
  api/drafts/[id]/generate/route.js
  api/drafts/[id]/payload/route.js
  api/drafts/[id]/publish/route.js
  api/drafts/[id]/steps/route.js
  api/drafts/[id]/steps/[stepId]/route.js
  api/drafts/[id]/steps/[stepId]/regenerate/route.js
```

发布侧建议：

```text
app/[slug]/page.jsx
app/api/tutorials/[slug]/route.js
```

它们最终应从 `PublishedTutorial` 读取，而不再依赖当前的样例注册表。

---

## 8. 页面路由设计

### 8.1 输入页

```text
/new
```

职责：

- 输入源码
- 输入 `TeachingBrief`
- 创建 `DraftRecord`
- 发起首次生成

### 8.2 草稿工作区

```text
/drafts/[id]
```

职责：

- 编辑标题、简介、步骤文案
- 新增步骤
- 触发单步 regenerate
- 查看当前验证状态
- 跳转预览和发布

### 8.3 草稿预览页

```text
/drafts/[id]/preview
```

职责：

- 直接服务端读取 `DraftRecord`
- 调用现有渲染链路预览草稿

### 8.4 草稿远程预览页

```text
/drafts/[id]/preview/request
```

职责：

- 通过接口请求 payload
- 验证远程数据链路

### 8.5 已发布教程页

```text
/[slug]
```

职责：

- 从 `PublishedTutorial` 读取快照
- 复用当前教程渲染器

说明：

- 草稿预览链接和发布链接必须分离。
- `slug` 只服务于已发布内容。

---

## 9. API 设计

P0 不求接口极多，但要保证每个编辑动作都有明确语义。

统一错误响应建议：

```json
{
  "message": "Human readable message",
  "code": "VALIDATION_ERROR",
  "details": []
}
```

### 9.1 创建草稿

```text
POST /api/drafts
```

请求体：

```json
{
  "sourceItems": [...],
  "teachingBrief": {...}
}
```

返回：

- `201 Created`
- 完整 `DraftRecord`

### 9.2 读取草稿

```text
GET /api/drafts/[id]
```

返回：

- `200 OK`
- 完整 `DraftRecord`

### 9.3 更新草稿基础信息

```text
PATCH /api/drafts/[id]
```

P0 允许更新：

- `teachingBrief`
- `tutorialDraft.meta.title`
- `tutorialDraft.meta.description`
- `tutorialDraft.intro.paragraphs`

补充规则：

1. P0 不提供 `sourceItems` 的在线编辑；如果源码输入本身要改，默认重新建稿。
2. 当 `teachingBrief` 被修改时，必须重算 `inputHash`。
3. 如果修改后 `tutorialDraftInputHash !== inputHash`，系统必须把 `syncState` 标为 `stale`。
4. `stale` 草稿仍可查看已有内容，但不能直接发布。

### 9.4 生成教程草稿（SSE 流式）

```text
POST /api/drafts/[id]/generate
```

**此接口使用 SSE（Server-Sent Events）流式返回生成结果。**

职责：

- 读取 `sourceItems + teachingBrief`
- 调用 AI 生成 `tutorialDraft`（通过 Vercel AI SDK v6 的 `streamObject`）
- 前端逐步接收生成的 title → intro → steps
- 生成完成后在服务端执行 schema 校验和可执行校验
- 回写 `tutorialDraftInputHash = inputHash`
- 把 `syncState` 标为 `fresh`
- 保存回 `DraftRecord`

SSE 流格式：

```text
event: object
data: {"meta":{"title":"..."},...}          // 逐步补全的部分 JSON

event: object
data: {"meta":{"title":"..."},"intro":...}  // 继续补全

event: done
data: {"success":true,"draftId":"..."}
```

前端消费方式：

- 使用 Vercel AI SDK v6 的 `useObject` hook 或 `streamObject` 客户端方法
- 实时展示生成进度（标题出来就显示标题，步骤出来就追加步骤）
- 收到 `done` 事件后刷新为完整草稿

选择 SSE 而非同步响应的原因：

1. 教程生成通常需要 30-60 秒，同步阻塞会导致用户面对长时间 loading。
2. 流式输出让用户尽早看到内容，体感上显著优于等待完整响应。
3. Vercel AI SDK v6 原生支持 SSE + Zod schema 约束输出，与项目校验体系统一。

**注意：此接口是唯一使用 SSE 的接口。** 其他所有 CRUD 操作（创建、编辑、发布等）继续使用普通 REST JSON 响应。

### 9.5 编辑单个步骤

```text
PATCH /api/drafts/[id]/steps/[stepId]
```

P0 允许修改：

- `title`
- `lead`
- `paragraphs`
- `eyebrow`

P0 不允许直接修改：

- `patches`
- `focus`
- `marks`

### 9.6 新增步骤

```text
POST /api/drafts/[id]/steps
```

P0 约束：

1. 默认只支持追加到末尾。
2. 新增步骤可以是解释性步骤，也可以是尾部代码推进步骤。
3. 如果新增步骤包含代码变化，保存前必须运行整篇链路校验。

之所以采用 append-only，是因为当前 patch 链是顺序应用的，插入中间步骤会立刻引入 rebase 问题。

### 9.7 单步 regenerate

```text
POST /api/drafts/[id]/steps/[stepId]/regenerate
```

建议请求体：

```json
{
  "mode": "prose" | "step",
  "instruction": "optional user hint"
}
```

语义：

- `prose` 只重生成文案字段
- `step` 可重生成该步骤完整结构，但必须重新校验整条 patch 链

### 9.8 构造草稿预览 payload

```text
GET /api/drafts/[id]/payload
```

职责：

- 读取 `DraftRecord.tutorialDraft`
- 调用 `buildTutorialPayload()`
- 返回前端直接可渲染数据

### 9.9 发布草稿

```text
POST /api/drafts/[id]/publish
```

职责：

1. 读取 `DraftRecord`
2. 检查 `syncState === "fresh"`
3. 运行发布前校验
4. 检查 slug 是否与保留路径段冲突
5. 生成唯一 slug
6. 生成 `PublishedTutorial`
7. 持久化发布快照
8. 回写 `DraftRecord.status` 和发布信息

返回：

- `201 Created`
- `PublishedTutorial`

发布前置条件：

- `tutorialDraft` 存在
- `validation.valid === true`
- `syncState === "fresh"`

---

## 10. 生成链路设计

### 10.1 输入

生成服务的输入只有两类：

- `sourceItems`
- `teachingBrief`

不要把“页面布局”“组件树结构”作为 AI 的直接输出目标。

### 10.2 输出

AI 必须输出结构化 JSON，目标结构就是 `TutorialDraft`。

最低要求：

- 标题、简介齐全
- 有 `baseCode`
- 有步骤序列
- 每一步能在当前 patch 机制下被应用

### 10.3 生成流程

使用 Vercel AI SDK v6 的 `streamObject` 进行结构化流式生成：

```text
load DraftRecord
  -> build generation prompt
  -> streamObject({ model, schema: TutorialDraftZodSchema, prompt })
  -> 流式返回 SSE 给前端
  -> 生成完成后，在服务端执行可执行校验
  -> run buildTutorialSteps() as executable validation
  -> persist DraftRecord
```

AI SDK 集成要点：

1. 使用 `streamObject` 而非 `generateObject`，获得流式体验。
2. `schema` 参数直接传入 Zod schema，AI 输出自动受 schema 约束——结构校验与生成一体化。
3. 前端使用 `useObject` hook 消费流式响应，实时渲染生成进度。
4. 生成完成后服务端仍需额外运行可执行校验（`buildTutorialSteps()`），因为 Zod 只能校验结构，无法验证 patch 锚点是否正确命中。

### 10.4 校验策略

生成结果必须通过两层校验：

#### 结构校验（由 Zod + AI SDK 自动完成）

Zod schema 同时用于三个场景：

1. AI `streamObject` 的输出约束——生成阶段保证结构正确。
2. API 入参校验——`POST /api/drafts`、`PATCH /api/drafts/[id]/steps/[stepId]` 等。
3. 数据库写入前校验——repository 层的最后一道防线。

检查：

- 字段是否完整
- step id 是否唯一
- 文本字段是否为预期类型

#### 可执行校验

检查：

- 所有 patch 是否都能唯一命中
- focus 锚点是否能定位
- marks 锚点是否能定位
- `buildTutorialSteps()` 是否能完整跑通

没有通过可执行校验的草稿，不允许进入预览或发布。

### 10.5 输入与草稿同步规则

为避免 `Teaching Brief` 改了但教程内容没重新生成，系统必须维护输入同步状态。

规则如下：

1. `inputHash` 由 `sourceItems + teachingBrief` 计算得出。
2. 每次成功生成 `tutorialDraft` 后，把当前 `inputHash` 写入 `tutorialDraftInputHash`。
3. 只要 `inputHash` 和 `tutorialDraftInputHash` 不一致，`syncState` 就必须是 `stale`。
4. `stale` 状态下允许继续编辑文案和预览，但不允许发布。
5. 发布动作只能基于 `fresh` 草稿。

---

## 11. 编辑器设计

### 11.1 编辑范围

P0 编辑器只做结构化字段编辑，不做代码 patch 可视化编辑。

具体包括：

- 标题编辑
- 简介编辑
- intro 段落编辑
- 步骤标题编辑
- 步骤文案编辑
- 步骤新增
- 单步 regenerate

### 11.2 状态管理

P0 建议采用：

- 页面加载时读取 `DraftRecord`
- 局部表单本地维护 dirty state
- 用户保存时调用对应 mutation API

不建议 P0 一开始就做：

- 自动保存
- 多人并发编辑
- 冲突合并

### 11.3 预览联动

建议工作区中提供两个动作：

- “保存”
- “打开预览”

而不是在每个输入字符后都重跑 payload 构造和高亮。

原因：

1. CodeHike 高亮在服务端执行，有成本。
2. patch 可执行校验不适合每次击键都跑。
3. 显式预览更利于隔离“编辑态”和“阅读态”。

### 11.4 技术边界

#### API 层：Route Handlers，不引入 tRPC

P0 的 mutation 入口统一选择 route handlers，不引入 tRPC，也不并行设计 server actions 写路径。

原因：

1. 当前系统已经以 API route 为主，接口约 10 个，复杂度不高。
2. 如果 P0 同时维护 route handlers 和 server actions，两边都要复制校验、错误结构和仓储调用。
3. 单一写入口更利于后续接 AI 生成、发布和审计日志。
4. tRPC 的核心价值是端到端类型安全，但 Next.js App Router 通过共享 TS 类型文件（`lib/types/api.ts`）即可实现同样效果，无需引入额外依赖。

#### 类型安全方案

不使用 tRPC，改用共享 TypeScript 类型文件实现端到端类型安全：

- `lib/types/api.ts`：统一定义所有 API 的 request/response 类型
- Route Handler 端引用类型做入参校验
- 前端通过同一个类型文件获得响应类型推导
- Zod schema 作为运行时校验层，TS 类型作为编译时校验层

---

## 12. 预览与发布链路

### 12.1 草稿预览

草稿预览分两条：

#### 直出预览

```text
DraftRecord
  -> tutorialDraft
  -> buildTutorialSteps()
  -> TutorialScrollyDemo
```

#### 远程预览

```text
DraftRecord
  -> tutorialDraft
  -> buildTutorialPayload()
  -> /api/drafts/[id]/payload
  -> RemotePreviewPage
  -> TutorialScrollyDemo
```

### 12.2 发布

发布流程：

```text
DraftRecord
  -> validation
  -> slug allocation
  -> PublishedTutorial snapshot
  -> /[slug]
```

### 12.3 同构约束

无论是：

- 草稿直出预览
- 草稿远程预览
- 已发布内容展示

最终都必须落到同一个 `TutorialScrollyDemo`。

---

## 13. 样例数据与现有注册表的迁移

当前 `content/sample-tutorial.js` 和 `lib/tutorial-registry.js` 只适合作为样例和过渡方案。

后续建议：

1. 保留 `sample` 作为 fixture
2. 将运行时读取逻辑逐步迁移到 repository
3. 发布页从 `PublishedTutorial` 仓储取内容
4. `tutorial-registry` 逐渐退化为开发样例入口，而不是生产内容来源

这一步很关键，因为 PRD 的目标不是“维护一个仓库内注册表”，而是“生成和发布真实草稿对象”。

---

## 14. 验证与测试策略

### 14.1 单元测试

建议覆盖：

- draft schema 校验
- repository 读写
- slug 生成
- step append 约束
- publish 流程校验

### 14.2 组装校验测试

必须覆盖：

- `buildTutorialSteps()` 对生成结果的可执行校验
- `buildTutorialPayload()` 的返回结构

### 14.3 路由集成测试

建议覆盖：

- 创建草稿
- 生成草稿
- 编辑步骤
- 获取草稿 payload
- 发布草稿
- 打开发布页

### 14.4 手工验收

P0 最少手工验收清单：

1. 从输入源码到生成预览可以完整跑通
2. 修改标题和步骤文案后，预览能反映变更
3. 新增末尾步骤后，整篇仍可渲染
4. 单步 regenerate 后，整篇仍可渲染
5. 发布后获得稳定 URL
6. 后续继续编辑草稿，不影响已发布内容

---

## 15. P0 实施顺序

建议按以下顺序落地：

### Phase 1：数据库与对象模型

- 安装 `drizzle-orm`、`pg`、`zod`、`ai`（Vercel AI SDK v6）
- 建 Drizzle schema（`lib/db/schema.ts`）和数据库连接（`lib/db/index.ts`）
- 建 Zod schema（`lib/drafts/draft-schema.ts`），同时用于校验 + AI 输出约束
- 建 repository 抽象
- 数据库读写跑通（本地 PostgreSQL 或 Docker）

### Phase 2：输入与生成

- `/new`
- `POST /api/drafts`
- `POST /api/drafts/[id]/generate`（SSE 流式）
- 集成 Vercel AI SDK v6 `streamObject` + Zod schema
- 生成后的可执行校验与保存

### Phase 3：草稿工作区

- `/drafts/[id]`
- meta / intro / step copy 编辑
- 末尾新增步骤
- 单步 regenerate

### Phase 4：草稿预览

- `/drafts/[id]/preview`
- `/drafts/[id]/preview/request`
- `/api/drafts/[id]/payload`

### Phase 5：发布闭环

- `POST /api/drafts/[id]/publish`
- `/[slug]`
- 已发布内容读取

---

## 16. 风险与技术决策

### 16.1 风险：生成结果无法被当前组装层消费

决策：

- 所有 AI 输出必须经过 `buildTutorialSteps()` 可执行校验

### 16.2 风险：编辑器引入第二套模型

决策：

- 编辑器只编辑 `DraftRecord.tutorialDraft`

### 16.3 风险：新增步骤破坏 patch 链

决策：

- P0 的新增步骤只支持 append-only

### 16.4 风险：草稿预览和发布内容不一致

决策：

- 预览和发布统一复用当前渲染链路与 payload 结构

### 16.5 风险：过早引入复杂基础设施

决策：

- P0 直接使用 PostgreSQL + Drizzle ORM，避免文件仓储在部署阶段的迁移成本。
- 生成链路使用 Vercel AI SDK v6 的 `streamObject` 做 SSE 流式输出，不引入独立任务队列。
- API 层统一用 Route Handlers + 共享 TS 类型，不引入 tRPC 或 server actions。

---

## 17. 最终结论

v3.0 的实现重点不是“重做教程渲染器”，而是围绕当前已经稳定的渲染底座，补齐一套真正可用的内容生产链路。

技术上，最重要的约束只有三条：

1. `DraftRecord` 是顶层持久化对象。
2. `tutorialDraft` 是唯一权威教程内容模型。
3. 预览与发布都必须继续复用当前 `TutorialScrollyDemo` 渲染链路。

只要守住这三条，后续无论接 AI、做编辑器还是做发布系统，都不会重新裂成“两套模型、两套页面、两套内容源”。
