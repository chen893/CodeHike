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

### 6.1 P0 选择：文件仓储

为了尽快在当前仓库内完成闭环，P0 默认采用文件仓储，而不是先接数据库。

推荐目录：

```text
data/
  drafts/
    <draftId>.json
  published/
    <slug>.json
```

原因：

1. 当前仓库没有数据库依赖。
2. 文档、调试和 Git 协作阶段更容易直接查看内容。
3. 先把对象模型和链路做稳，比先选数据库更重要。

边界说明：

1. 文件仓储只适用于本地开发、演示环境或单实例自托管场景。
2. 如果目标部署环境是只读文件系统或多实例运行环境，必须先把 repository 适配到持久化存储，再进入真实发布阶段。
3. 因此，文件仓储是 P0 的实现策略，不是长期基础设施承诺。

### 6.2 仓储抽象

即使 P0 用文件，也必须通过 repository 抽象访问：

- `draft-repository`
- `published-tutorial-repository`

不要在 route handler 中直接读写 JSON 文件。

### 6.3 写入策略

文件写入必须是原子操作：

1. 先写临时文件
2. 再 rename 覆盖目标文件

避免半写状态污染草稿或发布快照。

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
  drafts/
    draft-schema.js
    draft-validator.js
    draft-mutations.js
  published/
    published-schema.js
  repositories/
    draft-repository.js
    published-tutorial-repository.js
  services/
    create-draft.js
    generate-tutorial-draft.js
    update-draft-meta.js
    update-draft-step.js
    append-draft-step.js
    regenerate-draft-step.js
    build-draft-preview-payload.js
    publish-draft.js
  ai/
    tutorial-generator.js
    prompt-templates.js
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

### 9.4 生成教程草稿

```text
POST /api/drafts/[id]/generate
```

职责：

- 读取 `sourceItems + teachingBrief`
- 调用 AI 生成 `tutorialDraft`
- 运行 schema 校验和组装校验
- 回写 `tutorialDraftInputHash = inputHash`
- 把 `syncState` 标为 `fresh`
- 保存回 `DraftRecord`

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

建议流程：

```text
load DraftRecord
  -> build generation prompt
  -> call AI provider
  -> parse structured JSON
  -> validate TutorialDraft schema
  -> run buildTutorialSteps() as executable validation
  -> persist DraftRecord
```

### 10.4 校验策略

生成结果必须同时通过两层校验：

#### 结构校验

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

P0 的 mutation 入口统一选择 route handlers，不再并行设计一套 server actions 写路径。

原因：

1. 当前系统已经以 API route 为主。
2. 如果 P0 同时维护 route handlers 和 server actions，两边都要复制校验、错误结构和仓储调用。
3. 单一写入口更利于后续接 AI 生成、发布和审计日志。

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

### Phase 1：仓储与对象模型

- 建 `DraftRecord` / `PublishedTutorial` schema
- 建 repository 抽象
- 文件仓储读写跑通

### Phase 2：输入与生成

- `/new`
- `POST /api/drafts`
- `POST /api/drafts/[id]/generate`
- 生成后的校验与保存

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

### 16.5 风险：过早引入数据库或任务队列

决策：

- 先用文件仓储和同步生成链路完成闭环，再考虑升级基础设施

---

## 17. 最终结论

v3.0 的实现重点不是“重做教程渲染器”，而是围绕当前已经稳定的渲染底座，补齐一套真正可用的内容生产链路。

技术上，最重要的约束只有三条：

1. `DraftRecord` 是顶层持久化对象。
2. `tutorialDraft` 是唯一权威教程内容模型。
3. 预览与发布都必须继续复用当前 `TutorialScrollyDemo` 渲染链路。

只要守住这三条，后续无论接 AI、做编辑器还是做发布系统，都不会重新裂成“两套模型、两套页面、两套内容源”。
