# VibeDocs 章节能力重构实施计划

> 前提：当前应用尚未正式发布，可以重置数据库，不需要兼容历史线上数据。本文档替代 `20260415-roadmap-chapter-scaling.md` 中的原始落地方案，目标是用更稳定的数据模型支撑 40-60 步大教程的生成、编辑、阅读和后续维护。

---

## 1. 结论摘要

原方案的核心方向是对的：章节不应该打断现有 patch 链，也不应该把渲染链路改成嵌套结构。但原方案把 `chapters[].stepIds` 作为持久化字段，会导致 `steps[]` 和 `chapters[]` 双写漂移，并且在重排、删除、空章节、远程 payload、章节级重新生成时产生大量边界问题。

重构后的方案采用：

```ts
TutorialDraft {
  meta: TutorialMeta
  intro: TutorialIntro
  baseCode: string | Record<string, string>
  chapters: Chapter[]      // 只存章节元数据和顺序
  steps: TutorialStep[]    // 唯一步骤顺序源，patch 链仍按此顺序应用
}

Chapter {
  id: string
  title: string
  description?: string
  order: number
}

TutorialStep {
  id: string
  chapterId: string        // 步骤归属，替代 chapters[].stepIds
  eyebrow?: string
  title: string
  lead?: string
  paragraphs: string[]
  patches?: ContentPatch[]
  focus?: ContentRange | null
  marks?: ContentMark[]
  teachingGoal?: string
  conceptIntroduced?: string
}
```

核心原则：

- `steps[]` 是 patch 链、渲染顺序、编辑顺序的唯一可信源。
- `chapters[]` 只存标题、描述、顺序，不持久化 step id 列表。
- 章节边界、每章步骤数、start/end index、stepIds 全部由服务端 helper 从 `steps[].chapterId` 派生。
- `buildTutorialSteps()` 保持返回 `RenderedStep[]`，避免破坏核心渲染和校验契约。
- `buildTutorialPayload()` 负责输出可 JSON 序列化的章节信息，不返回 `Map`。
- 长教程生成不依赖把单个 SSE 请求拉长到 600 秒；优先设计为可持久化、可重连的 generation run。

---

## 2. 目标与非目标

### 2.1 目标

1. 支持 40-60 步教程的章节化阅读体验。
2. 让编辑器能创建、重命名、删除、重排章节，并移动步骤归属。
3. 降低长教程生成失败时的重跑成本，支持按章节 checkpoint 生成。
4. 保持服务端 patch 应用、高亮、diff 计算的既有边界。
5. 让远程加载、静态页面、预览、导出、embed 都能消费同一套章节 payload。

### 2.2 非目标

1. 不做 chapter -> section -> step 多层嵌套。
2. 不做每章节独立 `baseCode`。
3. 不做章节独立发布。
4. 不做章节级权限。
5. 不做章节级 SEO。
6. 不在第一阶段实现跨章节拖拽的复杂 DnD；先用明确的移动按钮或选择器。
7. 不把 `maxDuration = 600` 当作架构依赖。

---

## 3. 数据模型

### 3.1 权威 DSL

```ts
interface TutorialData {
  meta: TutorialMeta
  intro: TutorialIntro
  baseCode: string | Record<string, string>
  chapters: Chapter[]
  steps: TutorialStep[]
}

interface Chapter {
  id: string
  title: string
  description?: string
  order: number
}

interface TutorialStep {
  id: string
  chapterId: string
  eyebrow?: string
  title: string
  lead?: string
  paragraphs: string[]
  patches?: ContentPatch[]
  focus?: ContentRange | null
  marks?: ContentMark[]
  teachingGoal?: string
  conceptIntroduced?: string
}
```

### 3.2 为什么不用 `chapters[].stepIds`

`chapters[].stepIds` 看起来直观，但它会让“步骤顺序”同时存在于两个地方：

- `steps[]` 的数组顺序。
- `chapters[].stepIds` 的列表顺序。

一旦重排、删除、追加、重新生成或恢复快照，只要其中一个更新失败，就会出现无效草稿。改为 `steps[].chapterId` 后，顺序只有一份，章节结构可以随时派生。

### 3.3 派生结构

服务端新增 `lib/tutorial/chapters.ts`，提供纯函数：

```ts
interface ChapterSection {
  id: string
  title: string
  description?: string
  order: number
  startIndex: number
  endIndex: number
  stepIds: string[]
  stepCount: number
}

interface StepChapterMeta {
  chapterId: string
  chapterTitle: string
  chapterDescription?: string
  chapterIndex: number
  totalChapters: number
  stepIndexInChapter: number
  totalStepsInChapter: number
}

function deriveChapterSections(draft: TutorialDraft): ChapterSection[]
function deriveStepChapterMeta(draft: TutorialDraft): Record<string, StepChapterMeta>
function normalizeChapterOrders(chapters: Chapter[]): Chapter[]
function createDefaultChapter(): Chapter
function ensureDraftChapters(draft: Partial<TutorialDraft>): TutorialDraft
```

派生规则：

- `chapters` 按 `order` 升序。
- `steps[]` 按数组顺序渲染，不因为章节 order 重新排序。
- 同一章节的步骤在 `steps[]` 中必须连续。
- 每个 step 必须有有效 `chapterId`。
- 允许空章节存在于编辑态，但发布和生成成功态默认不允许空章节。

### 3.4 Schema 分层

新增三类 schema，不把编辑态和发布态混在一起：

```ts
chapterSchema
tutorialDraftEditingSchema
tutorialDraftPublishableSchema
```

编辑态允许：

- 空章节。
- 只有一个章节。
- 未发布前的章节草稿描述为空。

发布态要求：

- 至少一个章节。
- 每个 step 必须归属有效 chapter。
- 非空章节必须按 `steps[]` 连续。
- 空章节不能发布。
- `validateTutorialDraft()` 必须同时通过 patch 链校验和章节结构校验。

---

## 4. Assembler 与 Payload

### 4.1 保持 `buildTutorialSteps()` 契约

`buildTutorialSteps(data)` 继续返回 `RenderedStep[]`，不要改成对象。

需要补齐 `RenderedStep` 字段：

```ts
interface RenderedStep {
  id: string
  chapterId: string
  eyebrow?: string
  title: string
  lead?: string
  paragraphs: string[]
  highlighted: unknown
  highlightedFiles: Record<string, unknown>
  activeFile: string
  changeSummary?: {
    patchCount: number
    added: number
    removed: number
    modified: number
  }
}
```

当前渲染端需要 `id` 做稳定 key 和章节关联，也需要 `changeSummary` 替代 StepRail 读取原始 patches。

### 4.2 `buildTutorialPayload()` 输出

`buildTutorialPayload()` 才负责包装章节元数据：

```ts
interface TutorialPayload {
  title: string
  description: string
  fileName?: string
  intro: string[]
  chapters: ChapterSection[]
  stepChapterMeta: Record<string, StepChapterMeta>
  steps: RenderedStep[]
}
```

注意：

- 不输出 `Map`，只输出 JSON 可序列化对象。
- 静态页和远程页都使用同一个 payload shape。
- 静态直出可以继续在服务层拆出 props，但数据来源应和 payload helper 保持一致。

---

## 5. API 设计

### 5.1 统一结构更新接口

新增：

| 方法 | 路径 | 用途 |
|------|------|------|
| `PUT` | `/api/drafts/[id]/structure` | 原子更新章节元数据、章节顺序、步骤顺序、步骤归属 |

请求：

```ts
interface UpdateDraftStructureRequest {
  chapters: Array<{
    id: string
    title: string
    description?: string
    order: number
  }>
  stepOrder: Array<{
    stepId: string
    chapterId: string
  }>
}
```

服务端流程：

1. 校验 draft ownership。
2. 校验 chapter id 唯一。
3. 校验 step id 恰好覆盖当前 draft 的全部 steps。
4. 用 `stepOrder` 重建 `steps[]` 顺序并写入 `chapterId`。
5. 运行章节结构校验。
6. 运行 patch 链校验。
7. 在一个事务中保存 `tutorialDraft` 和 validation 状态。

### 5.2 章节 CRUD 作为轻量封装

章节 CRUD 可以存在，但它们内部应复用 `updateDraftStructure` 服务，不各自写 JSON：

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/api/drafts/[id]/chapters` | 添加空章节 |
| `PATCH` | `/api/drafts/[id]/chapters/[chapterId]` | 修改标题、描述、order |
| `DELETE` | `/api/drafts/[id]/chapters/[chapterId]` | 删除章节，并要求指定步骤迁移目标 |

删除章节请求必须显式传入：

```ts
{ moveStepsToChapterId: string }
```

不要使用“自动归入相邻章节”的隐式行为，因为这会在空章节、最后一章、前后章顺序变化时产生不可预测结果。

### 5.3 步骤 API 调整

现有接口保留但语义收紧：

- `POST /api/drafts/[id]/steps` 新增可选 `chapterId`，默认追加到当前选中章节或最后一个非空章节。
- `PUT /api/drafts/[id]/steps` 只保留为兼容内部调用的扁平重排能力；UI 结构更新改走 `/structure`。
- `PATCH /api/drafts/[id]/steps/[stepId]` 允许更新 `chapterId`，但如果涉及顺序变更仍走 `/structure`。

---

## 6. 编辑器体验

### 6.1 Sidebar 分组

`components/step-list.tsx` 拆分为：

```text
components/drafts/chaptered-step-list.tsx
components/drafts/chapter-row.tsx
components/drafts/chapter-step-row.tsx
```

第一版不做复杂拖拽。交互采用：

- 章节展开/折叠。
- 章节重命名。
- 章节描述编辑。
- 章节上移/下移。
- 步骤上移/下移。
- 步骤移动到另一个章节。
- 在当前章节末尾添加步骤。
- 删除章节时要求选择迁移目标章节。

### 6.2 编辑器状态

`use-draft-workspace-controller.ts` 新增：

```ts
chapters
chapterSections
selectedChapterId
updateStructure()
addChapter()
updateChapter()
deleteChapter()
moveStepToChapter()
moveChapter()
appendStepToChapter()
```

所有结构变化都通过一次服务端请求完成，不在客户端连续发两个请求。

### 6.3 自动章节工具

保留“从 eyebrow 生成章节”，但生成后应写入：

- `chapters[]`
- `steps[].chapterId`

不要生成 `chapters[].stepIds`。

生成逻辑：

1. 按连续相同 `eyebrow` 分组。
2. 如果只有一个分组，则创建一个默认章节。
3. 每组生成稳定 id。
4. 把每个 step 的 `chapterId` 指向该组。
5. 运行结构校验。

---

## 7. 阅读与渲染体验

### 7.1 文章流

`TutorialScrollyDemo` 接收：

```ts
steps
chapters
stepChapterMeta
```

渲染规则：

- `Selectable` 仍只包裹 step，不包裹章节分隔符。
- 章节分隔符作为 step 之前的普通元素插入。
- 如果 `index === chapter.startIndex`，渲染 `ChapterDivider`。
- 分隔符不参与 CodeHike selection index。

### 7.2 StepRail / ChapterRail

第一版建议新建 `ChapterRail`，而不是在 `StepRail` 中塞过多条件分支。

行为：

- 无章节或只有一个默认章节时显示简单 StepRail。
- 多章节时显示章节分组。
- 当前步骤所在章节自动展开。
- 章节标题点击滚动到第一步。
- 折叠按钮单独存在，不和标题点击冲突。
- Tooltip 使用 `changeSummary`，不读取原始 patches。

### 7.3 移动端

章节分隔符应在文章流里插入，不放进 `MobileCodeFrame`。

移动端第一版只做：

- 文章流章节标题。
- 每步 `MobileCodeFrame` 内显示 `Chapter n · Step m / k`。
- 暂不做移动端章节选择器，避免增加交互复杂度。

---

## 8. 生成链路

### 8.1 阶段一仍可使用现有 v3.1

章节 UI 和编辑能力不必等待章节级生成。现有 v3.1 生成后可以：

1. 默认创建一个章节。
2. 或按 outline 的概念/eyebrow 自动分组。
3. 用户再手动调整。

### 8.2 章节级生成 v3

新增 `createChapteredGenerationRun()`，不要直接把全部逻辑塞进现有 `createMultiPhaseGenerationStream()`。

流程：

```text
1. Chapter Plan
   输入：sourceItems + teachingBrief
   输出：chapters[] + 每章 step outline

2. Chapter Fill Loop
   对每章顺序执行：
     2.1 计算当前章开始前的 currentFiles
     2.2 对本章每个 step 调用 step-fill
     2.3 每步 patch 立即校验
     2.4 整章完成后运行 chapter validation
     2.5 持久化 partial progress

3. Full Validation
   对完整 draft 跑 validateTutorialDraft

4. Persist Final Draft
```

### 8.3 失败策略

不要使用“整章失败后继续下一章”的默认策略。重构后采用：

| 场景 | 行为 |
|------|------|
| 单步失败 | 重试最多 3 次 |
| 单步仍失败 | 生成 placeholder step，但不应用 patch |
| placeholder 出现在章内 | 当前章标记 degraded |
| 当前章 degraded | 停止自动生成后续章节，保存 partial draft |
| 用户选择继续 | 从最后有效代码状态重新规划后续章节 |

原因：下一章依赖上一章最终代码，失败后强行继续会把 patch 链污染到更远。

### 8.4 章节重新生成

提供两种模式：

```ts
type RegenerateChapterMode =
  | 'preserve-end-state'
  | 'regenerate-tail'
```

`preserve-end-state`：

- 只重生成目标章。
- 新章节最终代码必须等于旧章节最终代码。
- 如果无法收敛，返回失败，不修改草稿。

`regenerate-tail`：

- 从目标章开始重生成所有后续章节。
- 更适合用户修改了教学意图或章节目标的情况。

第一版只实现 `regenerate-tail`，因为它更符合 patch 链事实，失败模式更少。

### 8.5 SSE / Run 协议

不要依赖一个 600 秒 SSE 请求。新增 generation run 概念：

```ts
GenerationRun {
  id: string
  draftId: string
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  protocolVersion: 3
  currentChapterIndex?: number
  currentStepIndex?: number
  totalChapters?: number
  totalSteps?: number
  partialDraft?: TutorialDraft
  errorMessage?: string
}
```

API：

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/api/drafts/[id]/generate` | 创建 run 并返回 SSE |
| `GET` | `/api/drafts/[id]/generation-runs/[runId]/events` | 断线后重连 |
| `POST` | `/api/drafts/[id]/generation-runs/[runId]/cancel` | 取消 |

SSE event：

```ts
event: phase
data: { protocolVersion: 3, phase: 'chapter-plan' }

event: chapter-plan
data: { chapters, totalSteps }

event: chapter-start
data: { chapterId, chapterIndex, totalChapters, startGlobalStepIndex }

event: step-start
data: { chapterId, globalStepIndex, stepIndexInChapter, totalSteps }

event: step
data: { chapterId, globalStepIndex, stepIndexInChapter, step }

event: chapter-complete
data: { chapterId, chapterIndex, stepCount }

event: validation
data: { valid, errors }

event: done
data: { success, runId, totalChapters, totalSteps }

event: error
data: { message, phase, chapterId?, globalStepIndex? }
```

---

## 9. 数据库策略

虽然可以重置数据库，仍建议最小化 schema 表结构变化：

- `drafts.tutorial_draft` JSONB 存新 DSL。
- `published_tutorials.tutorial_draft_snapshot` JSONB 存新 DSL。
- `draft_snapshots.tutorial_draft_snapshot` JSONB 存新 DSL。

新增 generation run 表可选。如果短期不想加表，可先把 run 状态放在 drafts 现有 generation 字段中。但如果要支持断线重连和长任务，建议新增：

```ts
generation_runs {
  id uuid primary key
  draftId uuid not null
  state varchar not null
  protocolVersion integer not null
  events jsonb default []
  partialDraft jsonb
  errorMessage text
  createdAt timestamp
  updatedAt timestamp
}
```

因为可以重置 DB，迁移策略简单：

1. 修改 Drizzle schema。
2. 生成或手写 migration。
3. 重置数据库。
4. 重新 seed 示例数据。

---

## 10. 文件变更清单

### 10.1 新增

| 文件 | 用途 |
|------|------|
| `lib/schemas/chapter.ts` | Chapter schema 和类型 |
| `lib/tutorial/chapters.ts` | 章节派生、校验、默认章节 helper |
| `lib/services/update-draft-structure.ts` | 原子结构更新服务 |
| `components/drafts/chaptered-step-list.tsx` | 编辑器章节步骤列表 |
| `components/drafts/chapter-row.tsx` | 章节行 |
| `components/drafts/chapter-step-row.tsx` | 章节内步骤行 |
| `components/tutorial/chapter-divider.tsx` | 阅读页章节分隔符 |
| `components/tutorial/chapter-rail.jsx` | 章节导航 |
| `app/api/drafts/[id]/structure/route.ts` | 结构更新 API |
| `app/api/drafts/[id]/chapters/route.ts` | 添加章节 API |
| `app/api/drafts/[id]/chapters/[chapterId]/route.ts` | 更新/删除章节 API |

### 10.2 修改

| 文件 | 修改 |
|------|------|
| `lib/schemas/tutorial-draft.ts` | 增加 chapters 和 step.chapterId |
| `lib/schemas/tutorial-outline.ts` | 为章节生成增加 chapter plan 类型 |
| `lib/schemas/api.ts` | 增加结构更新请求 schema |
| `lib/tutorial/assembler.js` | RenderedStep 保留 id、chapterId、changeSummary |
| `lib/tutorial/payload.js` | 输出 chapters 和 stepChapterMeta |
| `lib/utils/validation.ts` | 同时校验章节结构和 patch 链 |
| `lib/repositories/draft-repository.ts` | 更新 steps/chapter 写入 helper |
| `lib/services/append-draft-step.ts` | 支持 chapterId |
| `lib/services/delete-draft-step.ts` | 删除后保留章节结构合法 |
| `lib/services/replace-draft-steps.ts` | 收紧为内部使用或迁移到 structure service |
| `lib/services/regenerate-draft-step.ts` | 保留 step.chapterId |
| `lib/services/generate-tutorial-draft.ts` | 生成后确保 chapters 和 step.chapterId |
| `components/drafts/use-draft-workspace-controller.ts` | 加章节结构状态和 mutation |
| `components/drafts/draft-workspace-sidebar.tsx` | 使用章节列表 |
| `components/tutorial/tutorial-scrolly-demo.jsx` | 插入 ChapterDivider，传 ChapterRail |
| `components/tutorial/scrolly-step-rail.jsx` | 简化为 legacy 或被 ChapterRail 包装 |
| `components/remote-tutorial-page.jsx` | 传章节 payload |
| `app/[slug]/page.jsx` | 传章节 props |
| `app/drafts/[id]/preview/page.tsx` | 传章节 props |
| `lib/services/export-markdown.ts` | 导出章节标题 |
| `lib/services/export-html.ts` | 导出章节标题 |
| `app/api/tutorials/[slug]/embed/route.ts` | embed 显示章节 |
| `docs/tutorial-data-format.md` | 更新 DSL 权威规范 |
| `docs/vibedocs-technical-handbook.md` | 更新组件、API、数据流 |

---

## 11. 分阶段实施

### Phase 0：数据模型与 helper

目标：建立新 DSL 的单一可信源。

任务：

1. 新增 `chapterSchema`。
2. `tutorialStepSchema` 增加必填 `chapterId`。
3. `tutorialDraftSchema` 增加必填 `chapters`。
4. 新增 `ensureDraftChapters()`，用于生成和创建手动步骤时补默认章节。
5. 新增 `deriveChapterSections()` 和 `validateChapterStructure()`。
6. 修改测试覆盖空章节、非法 chapterId、不连续步骤、重复 order。

验收：

- `npm test` 通过。
- 无章节旧样例可以通过一次本地数据转换变成默认章节。
- 发布态 schema 能拒绝空章节和无效 step.chapterId。

### Phase 1：Payload 与阅读页

目标：阅读页可正确显示章节，且不破坏 patch 链。

任务：

1. `buildTutorialSteps()` 保持数组返回，但 RenderedStep 增加 `id`、`chapterId`、`changeSummary`。
2. `buildTutorialPayload()` 输出 `chapters`、`stepChapterMeta`。
3. 新增 `ChapterDivider`。
4. 新增 `ChapterRail`。
5. 更新静态页、远程页、预览页 props。
6. 更新 export markdown/html/embed。

验收：

- 多章节教程显示章节分隔符。
- Step selection index 连续，不被章节分隔符影响。
- 远程 `/api/tutorials/[slug]` 返回 JSON 中无 `Map`。
- 移动端章节标题在文章流中出现。

### Phase 2：编辑器结构管理

目标：用户可以维护章节结构。

任务：

1. 新增 `/api/drafts/[id]/structure`。
2. 新增 `updateDraftStructure()` 服务，事务内更新结构和 validation。
3. 替换 sidebar 的 step list 为 chaptered list。
4. 支持章节新增、重命名、删除、上移、下移。
5. 支持步骤移动到指定章节、在章节内上移/下移。
6. 添加“从 eyebrow 生成章节”入口。

验收：

- 所有结构变更只发一个请求。
- 删除章节必须选择步骤迁移目标。
- patch 链断裂时结构更新失败，并显示明确错误。
- 空章节可以在编辑态保存，但发布前被阻止。

### Phase 3：生成后自动章节化

目标：现有 v3.1 生成结果自动带章节结构。

任务：

1. 放宽 `target_step_count` 上限到 60。
2. v3.1 outline 仍生成扁平 steps。
3. 生成完成后按 outline/eyebrow/step count 自动分组。
4. 每个生成 step 写入 `chapterId`。
5. generation quality 增加 chapterCount、avgStepsPerChapter。

验收：

- 20 步以下默认 1-2 章。
- 20 步以上默认多章。
- 自动分组不影响 patch 校验。

### Phase 4：章节级生成 v3

目标：降低长教程生成失败后的重跑成本。

任务：

1. 新增 chapter plan prompt。
2. 新增 chaptered generation run 编排。
3. SSE 协议升级到 v3。
4. 前端 GenerationProgress 支持章节进度。
5. 每章完成后持久化 partial draft。
6. 失败时停止后续章节，允许用户从失败章节继续或重规划后续章节。

验收：

- 30+ 步教程可以看到章节级进度。
- 章节失败不会覆盖已成功章节。
- 断线后可以恢复查看 run 状态。
- 完整 draft 仍通过全链路 patch 校验。

### Phase 5：章节级重新生成

目标：支持局部维护长教程。

任务：

1. 新增 `POST /api/drafts/[id]/chapters/[chapterId]/regenerate`。
2. 第一版只支持 `regenerate-tail`。
3. 从目标章节第一步开始重生成后续步骤。
4. 复用 v3 generation progress UI。

验收：

- 重新生成目标章后，后续章节同步重建。
- 不产生断裂 patch 链。
- 用户能看到受影响章节列表。

---

## 12. 测试计划

新增或更新：

| 测试 | 覆盖 |
|------|------|
| `tests/chapter-helpers.test.js` | derive sections、step meta、默认章节 |
| `tests/chapter-validation.test.js` | 无效 chapterId、空章节、非连续步骤、发布态校验 |
| `tests/assembler.test.js` | RenderedStep 保留 id/chapterId/changeSummary |
| `tests/payload.test.js` | payload JSON 可序列化 |
| `tests/patch-chain.test.js` | 跨章节仍按 steps 顺序应用 patch |
| `tests/api-routes.test.js` | 新 structure/chapter routes 分层约束 |
| `tests/export-markdown.test.js` | 导出章节标题 |
| `tests/export-html.test.js` | 导出章节标题 |

手动验证：

1. 创建 3 章 12 步教程。
2. 章节折叠/展开，点击步骤，确认代码区切换正确。
3. 移动步骤到另一章，确认 patch 链校验生效。
4. 删除中间章节并迁移步骤。
5. 发布前存在空章节时被阻止。
6. 远程预览和静态预览章节显示一致。
7. Markdown、HTML、embed 输出包含章节结构。

---

## 13. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 结构更新导致 patch 链断裂 | 编辑保存失败 | 结构更新后立即运行 full validation，不通过不写入 |
| 章节 UI 影响 Selectable index | 阅读代码切换错位 | 章节分隔符不包裹 Selectable，不占 step index |
| payload 过大 | 首屏加载变慢 | 仅增加章节元数据，不增加章节级 baseCode |
| 长教程生成超过请求时长 | 生成中断 | generation run 持久化，SSE 可重连 |
| 章节重新生成破坏后续步骤 | patch 链断裂 | 第一版只支持 regenerate-tail |
| 空章节进入发布态 | 阅读页出现无意义章节 | 编辑态允许，发布态禁止 |

---

## 14. 决策记录

### 14.1 `steps[].chapterId` 优先于 `chapters[].stepIds`

这是本计划最关键的架构决策。它牺牲了一点章节数据的直观性，换来更稳定的编辑、重排、删除、生成和校验流程。

### 14.2 不修改 `buildTutorialSteps()` 返回 shape

核心渲染链路已经稳定。改变返回 shape 会影响页面、预览、payload、校验和测试。章节应该作为 payload 和渲染元数据叠加，不应该改变 assembler 的基础契约。

### 14.3 章节级生成失败后不自动继续

patch 链是连续代码状态。上一章失败后继续下一章，会把错误传播到更深位置。正确策略是保存 partial draft，让用户选择继续、重试或重规划后续章节。

### 14.4 第一版章节重新生成只做 `regenerate-tail`

只重生成单章并保持后续章节不变，需要证明章节最终代码状态完全一致，约束复杂。`regenerate-tail` 更符合当前 patch 模型，也更容易向用户解释。

---

## 15. 推荐执行顺序

如果只做一个可交付 MVP：

1. Phase 0：数据模型与 helper。
2. Phase 1：阅读页章节展示。
3. Phase 2：编辑器结构管理。

如果目标是解决 30+ 步生成成功率：

1. 先完成 Phase 0-2，确保章节结构可编辑。
2. 再做 Phase 3，让现有生成产物自动带章节。
3. 最后做 Phase 4，不要跳过 generation run 设计直接改 SSE 超时时间。

---

## 16. 成功标准

技术指标：

- 章节结构校验纯函数测试覆盖核心边界。
- 40 步教程 payload 能正常静态渲染和远程渲染。
- 章节结构更新无双请求竞态。
- 章节分隔符不影响 CodeHike selection。
- 生成结果必定包含至少一个有效章节。

产品指标：

- 40-60 步教程的 StepRail 不再是单条不可读长导航。
- 用户可以用章节定位和维护长教程。
- 长教程生成失败时，已成功章节不会丢失。
- 重新生成章节时，用户清楚知道哪些后续章节会受影响。
