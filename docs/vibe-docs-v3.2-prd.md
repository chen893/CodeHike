# 产品需求文档（PRD）：VibeDocs v3.2

**文档版本：** v3.2
**最后更新：** 2026-04-09
**对应基线：** v3.1 已完成多阶段生成 + 阅读交互增强
**一句话定义：** 补全草稿生命周期管理和步骤编辑能力，让 VibeDocs 从"能跑的 demo"变成"可用的工具"。

---

## 0. 本版定位

v3.0 验证了端到端链路，v3.1 提升了生成质量和阅读体验。但产品仍有基础性缺口——用户无法管理草稿、无法修改代码变化、无法组织步骤。这不是体验优化问题，而是**基础 CRUD 闭环缺失**。

v3.2 不追求新能力突破，而是把已有链路中缺失的基本操作补全。

### 核心问题清单

| # | 问题 | 现状 | 用户影响 |
|---|------|------|---------|
| 1 | 无草稿列表页 | `app/drafts/page.tsx` 不存在，无 `GET /api/drafts`，无 `listDrafts()` | 关闭标签页后无法找回草稿 |
| 2 | 无法删除草稿 | 无 `DELETE` 路由，无 repo 函数 | 草稿永存，无法清理废弃内容 |
| 3 | 无法删除 / 重排步骤 | 只能追加（`POST /steps`），不能删除或重排 | AI 生成了不理想的步骤时只能逐个手动覆盖 |
| 4 | 单文件源码输入 | `create-draft-form.tsx` 硬编码单个 `SourceItem` | 真实教程通常跨多个文件（如 `store.js` + `index.js`） |
| 5 | Patch 不可见不可编辑 | `step-editor.tsx` 只编辑文案，`patches` 字段无 UI | 只能靠 AI 重生成，不能手动修一个 find/replace |

---

## 1. 功能需求

### 1.1 草稿列表页

**优先级：** P0
**现状：** 无列表页、无列表 API、无 repo 查询函数。

**目标：** 用户可以查看所有草稿，快速进入编辑或预览。

#### 页面结构

```
┌─ AppShell ────────────────────────────────────────┐
│ [sidebar]  │  我的草稿                             │
│            │                                      │
│ + 新建教程  │  ┌─ draft-card ─────────────────┐   │
│ 教程列表    │  │ Redux Store 教程   [生成中...]  │   │
│            │  │ 2026-04-09 · 12 步 · 已发布     │   │
│            │  │                   [编辑] [预览]  │   │
│            │  └────────────────────────────────┘   │
│            │  ┌─ draft-card ─────────────────┐   │
│            │  │ Express 中间件      [待编辑]    │   │
│            │  │ 2026-04-08 · 0 步 · 生成失败    │   │
│            │  │          [编辑] [删除]          │   │
│            │  └────────────────────────────────┘   │
│            │                                      │
│            │  ┌─ 已发布 ──────────────────────┐   │
│            │  │ ...                             │   │
│            │  └────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

#### 需要新增的后端

```ts
// lib/repositories/draft-repository.ts
export async function listDrafts(): Promise<DraftRecord[]>
// SELECT * FROM drafts ORDER BY updatedAt DESC

// app/api/drafts/route.ts — 新增 GET handler
export async function GET(req: Request) {
  const drafts = await draftRepo.listDrafts();
  return NextResponse.json(drafts);
}
```

#### 需要新增的前端

- `app/drafts/page.tsx` — 草稿列表页，复用 `AppShell` 布局
- 卡片展示：标题（或"新草稿"）、状态标签、步骤数、更新时间、操作按钮

#### 状态标签映射

| `generationState` | `syncState` | 显示 |
|---|---|---|
| `idle` | `empty` | "待生成" |
| `running` | * | "生成中..."（带 spinner） |
| `succeeded` | `fresh` | "已就绪" |
| `succeeded` | `stale` | "已过期"（输入已变更） |
| `failed` | * | "生成失败" |
| `published` | * | "已发布" |

#### 路由和导航更新

- 首页 `app/page.jsx` 的 AppShell sidebar "教程列表" 链接改为 `/drafts`
- 或首页同时展示草稿列表 + 已发布列表（当前首页已有 published 展示逻辑）

### 1.2 删除草稿

**优先级：** P0
**现状：** 无 `DELETE` 路由，无 repo 函数，无 UI。

**目标：** 用户可以删除草稿及其关联数据。

#### 需要新增的后端

```ts
// lib/repositories/draft-repository.ts
export async function deleteDraft(id: string): Promise<boolean>
// DELETE FROM drafts WHERE id = $id
// 如果有 published_tutorial 引用，先取消发布（或阻止删除）

// app/api/drafts/[id]/route.ts — 新增 DELETE handler
export async function DELETE(req, context) {
  const { id } = await context.params;
  const draft = await draftRepo.getDraftById(id);
  if (!draft) return 404;
  if (draft.publishedTutorialId) return 409; // 已发布，需先取消发布
  await draftRepo.deleteDraft(id);
  return 200;
}
```

#### 删除策略

| 草稿状态 | 能否删除 | 说明 |
|---------|---------|------|
| `generationState = running` | 不能 | 需等生成完成或手动中断 |
| `status = draft`（未发布） | 能 | 直接删除 |
| `status = published`（已发布） | 不能 | 需先取消发布（v3.2 P1 或后续版本） |

#### UI 交互

- 列表页卡片：未发布草稿显示"删除"按钮
- 工作区 sidebar：添加"删除草稿"按钮（需二次确认）
- 删除后跳转到草稿列表页

### 1.3 步骤删除和重排

**优先级：** P1
**现状：** 只有 `POST /steps`（追加）和 `PATCH /steps/[stepId]`（编辑文案），无删除和重排。

**目标：** 用户可以删除步骤、调整步骤顺序。

#### 需要新增的后端

```ts
// lib/repositories/draft-repository.ts — 已有 updateDraftSteps(id, steps)
// 它接收完整 steps 数组并整体覆盖，所以删除和重排都可以通过它实现

// 无需新的 repo 函数，但需要新 API：
// DELETE /api/drafts/[id]/steps/[stepId]
// PATCH /api/drafts/[id]/steps — 重排（接收完整 steps 数组）
```

#### 前端实现

**StepList 组件增强：**

```
┌─ StepList ─────────────────┐
│ 1  Store 的核心结构   [▲][▼][✕] │
│ 2  dispatch 函数      [▲][▼][✕] │
│ 3  subscribe 机制    [▲][▼][✕] │  ← 当前选中
│ 4  中间件模式        [▲][▼][✕] │
└─────────────────────────────┘
```

- 每个步骤右侧显示上移 / 下移 / 删除按钮
- 删除需要二次确认
- 操作后 `PATCH /api/drafts/[id]/steps` 提交完整步骤数组
- 当前选中的步骤被删除后，选中 index 自动调整

#### 删除步骤的连带影响

- 步骤的 `patches` 是基于前一步的代码应用的，删除中间步骤会导致后续步骤的 patch 失效
- **处理策略：** 删除步骤后，将该步骤的 `syncState` 设为 `stale`，提示用户需要重新生成受影响的步骤
- 或者更简单的策略：删除步骤后，标记从该步骤起后续所有步骤需要重新校验

### 1.4 多文件源码输入

**优先级：** P1
**现状：** `create-draft-form.tsx` 硬编码单个 `SourceItem`。

**目标：** 用户可以添加多个源码文件。

#### 表单结构

```
┌─ 源码内容 ──────────────────────────────────┐
│                                              │
│ ┌─ source-item-1 ────────────────────────┐  │
│ │ 文件标签: [store.js    ]  语言: [JS ▾]  │  │
│ │ ┌─ CodeMirror ───────────────────────┐ │  │
│ │ │ ...                                │ │  │
│ │ └────────────────────────────────────┘ │  │
│ │                                 [删除] │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ ┌─ source-item-2 ────────────────────────┐  │
│ │ 文件标签: [index.js    ]  语言: [JS ▾]  │  │
│ │ ┌─ CodeMirror ───────────────────────┐ │  │
│ │ │ ...                                │ │  │
│ │ └────────────────────────────────────┘ │  │
│ │                                 [删除] │  │
│ └────────────────────────────────────────┘  │
│                                              │
│ [ + 添加源码文件 ]                            │
└──────────────────────────────────────────────┘
```

#### 状态管理

```ts
const [sourceItems, setSourceItems] = useState<SourceItemDraft[]>([
  { label: '', language: 'javascript', content: '' },
]);

// 添加
function addSourceItem() {
  setSourceItems(prev => [...prev, { label: '', language: 'javascript', content: '' }]);
}

// 删除（至少保留一个）
function removeSourceItem(index: number) {
  setSourceItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
}

// 提交时生成 id
const items: SourceItem[] = sourceItems.map((s, i) => ({
  id: crypto.randomUUID(),
  kind: 'snippet' as const,
  label: s.label || `file-${i + 1}`,
  content: s.content,
  language: s.language,
}));
```

#### 对 AI 生成的影响

- `buildOutlinePrompt` 和 `buildStepFillPrompt` 已支持 `sourceItems` 数组（遍历渲染所有文件的 `### label\n```content```）
- 无需修改 AI 层代码，只需前端传多个 `SourceItem`

### 1.5 Patch 可视化编辑

**优先级：** P1
**现状：** `step-editor.tsx` 只编辑 `eyebrow`、`title`、`lead`、`paragraphs`。`patches`、`focus`、`marks` 无 UI。

**目标：** 用户可以查看和编辑步骤的代码变化。

#### 设计方案

**两栏布局：左栏代码预览 + 右栏 patch 列表**

```
┌─ Step Editor ──────────────────────────────────────┐
│ Step 3: dispatch 函数                               │
│                                                     │
│ Eyebrow: [dispatch   ]   Title: [dispatch 函数    ] │
│ Lead:    [这步实现... ]                              │
│                                                     │
│ ┌─ 代码预览 ─────────┐  ┌─ Patches ─────────────┐  │
│ │ (上一步代码 +        │  │ Patch 1:              │  │
│ │  当前步骤 patches    │  │ find:                 │  │
│ │  应用后的结果)       │  │ ┌──────────────────┐  │  │
│ │                     │  │ │ export function   │  │  │
│ │  高亮变化行          │  │ │ createStore() {   │  │  │
│ │                     │  │ │   ...             │  │  │
│ │                     │  │ └──────────────────┘  │  │
│ │                     │  │ replace:              │  │
│ │                     │  │ ┌──────────────────┐  │  │
│ │                     │  │ │ export function   │  │  │
│ │                     │  │ │ createStore() {   │  │  │
│ │                     │  │ │   ...             │  │  │
│ │                     │  │ │   dispatch() {    │  │  │
│ │                     │  │ │     ...           │  │  │
│ │                     │  │ └──────────────────┘  │  │
│ │                     │  │         [删除此patch]  │  │
│ │                     │  │ [+ 添加 patch]         │  │
│ └─────────────────────┘  └───────────────────────┘  │
│                                                     │
│ 讲解段落: (MarkdownEditor)                           │
│                                                     │
│ [保存]  [重新生成]                                   │
└─────────────────────────────────────────────────────┘
```

#### 实现策略

**阶段 A（最小可用）：只读预览**

- 在 step-editor 中新增"代码预览"tab
- 展示"上一步代码 → 应用当前步骤 patches → 当前代码"的 diff 视图
- 使用已有的 `applyContentPatches` 计算当前代码，用 `diffArrays` 生成行级 diff
- patches 以只读列表展示（显示 find / replace 对比）

**阶段 B（可编辑）：Patch 编辑器**

- 每个_patch_可以编辑 `find` 和 `replace` 文本框
- 实时预览 patch 应用结果（验证 find 存在且唯一）
- 新增 / 删除 patch
- 修改 focus 和 marks（通过代码行号选择器）

**阶段 C（高级）：可视化 diff 编辑器**

- 左右分栏展示 before/after 代码
- 点击行直接创建 patch
- 拖选代码区域设置 focus/marks

#### Patch 编辑的校验逻辑

```ts
// 编辑 patch 后实时校验
function validatePatch(previousCode: string, patch: ContentPatch): ValidationResult {
  const index = previousCode.indexOf(patch.find);
  if (index === -1) return { valid: false, error: 'find 在上一步代码中找不到' };
  const secondIndex = previousCode.indexOf(patch.find, index + 1);
  if (secondIndex !== -1) return { valid: false, error: 'find 出现多次，请扩大上下文使其唯一' };
  return { valid: true };
}
```

#### 后端变更

```ts
// lib/schemas/api.ts — 扩展 updateStepRequestSchema
export const updateStepRequestSchema = z.object({
  eyebrow: z.string().optional(),
  title: z.string().optional(),
  lead: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
  // v3.2 新增
  patches: z.array(contentPatchSchema).optional(),
  focus: contentRangeSchema.nullable().optional(),
  marks: z.array(contentMarkSchema).optional(),
});

// app/api/drafts/[id]/steps/[stepId]/route.ts
// PATCH handler 需要将 patches/focus/marks 也写入步骤
```

---

## 2. 数据模型变更

### 2.1 无新 DB 表 / 新列

v3.2 所有功能都基于现有数据结构，无需新增表或列。

### 2.2 API 变更

| API | 方法 | 变更 |
|-----|------|------|
| `/api/drafts` | `GET` | **新增** — 返回草稿列表 |
| `/api/drafts/[id]` | `DELETE` | **新增** — 删除草稿 |
| `/api/drafts/[id]/steps/[stepId]` | `DELETE` | **新增** — 删除步骤 |
| `/api/drafts/[id]/steps` | `PUT` | **新增** — 整体更新步骤数组（重排） |
| `/api/drafts/[id]/steps/[stepId]` | `PATCH` | **扩展** — 支持编辑 patches/focus/marks |

### 2.3 Zod Schema 变更

```ts
// lib/schemas/api.ts
export const updateStepRequestSchema = z.object({
  // ...existing fields...
  patches: z.array(contentPatchSchema).optional(),  // v3.2
  focus: contentRangeSchema.nullable().optional(),   // v3.2
  marks: z.array(contentMarkSchema).optional(),      // v3.2
});
```

---

## 3. 实现优先级

### P0：基础可用性

| # | 功能 | 涉及文件 | 工作量估计 |
|---|------|---------|-----------|
| 1 | 草稿列表页 | repo + API route + page 组件 + StepList 复用 | 中 |
| 2 | 删除草稿 | repo + API route + UI 按钮 | 小 |

### P1：编辑能力

| # | 功能 | 涉及文件 | 工作量估计 |
|---|------|---------|-----------|
| 3 | 步骤删除和重排 | StepList 增强 + API route | 中 |
| 4 | 多文件源码输入 | create-draft-form 重构 | 中 |
| 5a | Patch 只读预览 | step-editor 扩展 | 中 |
| 5b | Patch 可编辑 | step-editor + API 扩展 | 大 |

### P2：生命周期

| # | 功能 | 涉及文件 | 工作量估计 |
|---|------|---------|-----------|
| 6 | 取消发布 | repo + API route + UI | 小 |
| 7 | 生成历史对比 | 新 page + API | 大 |

---

## 4. 技术约束

### 4.1 复用现有 `updateDraftSteps`

`draft-repository.ts` 已有 `updateDraftSteps(id, steps)` 函数，接收完整 steps 数组。步骤删除和重排都通过调用这个函数实现，无需新增 repo 层代码。

### 4.2 Patch 编辑的事务性

步骤的 patches 是有序的，且每个 patch 的 `find` 必须在前一个 patch 应用后的代码中匹配。编辑 patch 时需要：

1. 按顺序依次应用 patches 0..i-1 得到中间代码
2. 在中间代码上校验 patch i 的 `find`
3. 校验通过后预览最终代码

这个逻辑复用 `tutorial-assembler.js` 中已有的 `applyContentPatches`。

### 4.3 不改变渲染链路

Patch 编辑的结果仍然通过 `TutorialDraft` → `buildTutorialSteps` → `TutorialScrollyDemo` 渲染。编辑器只修改 `TutorialDraft.steps[i].patches` 等字段，不引入新的渲染路径。

### 4.4 多文件对 AI 生成的影响

`buildOutlinePrompt` 和 `buildStepFillPrompt` 已遍历 `sourceItems` 数组渲染所有文件内容，无需修改 AI 层。但需要注意：

- 多文件源码会导致 prompt 更长，可能触发 token 上限
- `estimatedLocChange` 仍然针对单个"当前文件"，AI 需要知道当前步骤操作的是哪个文件
- 后续版本可能需要在 outline 阶段标注每步操作的文件名

---

## 5. 关键风险

### 5.1 Patch 编辑的一致性

**风险：** 手动编辑 patch 可能破坏步骤间的代码链式依赖。
**缓解：** 编辑器实时校验 find 的存在性和唯一性；保存时整体重新校验所有步骤的 patches 链；校验失败时阻止保存并高亮错误步骤。

### 5.2 步骤删除的连锁影响

**风险：** 删除中间步骤后，后续步骤的 patches 可能失效（因为"上一步代码"变了）。
**缓解：** 删除步骤后将该步骤及之后所有步骤标记为 `stale`，UI 提示用户需要重新生成。不自动重生成（成本高且不可控）。

### 5.3 多文件的 token 预算

**风险：** 多文件源码 + teaching brief + 当前代码，prompt token 量可能超过模型限制。
**缓解：** 大纲阶段只传源码摘要（已有 estimatedLocChange 约束，大纲本身 token 量小）。步骤填充阶段传"当前操作的文件 + 相关上下文"而非全部文件内容。如果 token 仍然超限，可以在 prompt 中截断不相关文件。

---

## 6. 验收标准

### 6.1 草稿管理验收

- [ ] 用户可以从 `/drafts` 页面看到所有草稿
- [ ] 草稿卡片正确显示标题、状态、步骤数、更新时间
- [ ] 点击"编辑"跳转到工作区
- [ ] 点击"预览"跳转到预览页
- [ ] 未发布草稿可以删除，已发布草稿不能删除
- [ ] 正在生成的草稿不能删除

### 6.2 步骤管理验收

- [ ] 工作区 StepList 中可以上移 / 下移步骤
- [ ] 可以删除步骤（需二次确认）
- [ ] 删除后选中状态正确调整
- [ ] 重排后数据正确保存

### 6.3 多文件输入验收

- [ ] 创建表单支持添加多个源码文件
- [ ] 至少保留一个文件（不能全部删除）
- [ ] 每个文件可独立设置标签和语言
- [ ] 提交后 AI 能正确处理多文件输入

### 6.4 Patch 编辑验收

- [ ] Step Editor 展示当前步骤的代码预览（只读阶段）
- [ ] 展示 patch 列表（find / replace 对比）
- [ ] 编辑 find/replace 后实时校验（可编辑阶段）
- [ ] 修改 patch 后保存成功，预览页正确反映变化

### 6.5 向后兼容验收

- [ ] 现有草稿和已发布教程不受影响
- [ ] 单文件创建流程仍然正常工作
- [ ] API 新增字段均为可选

---

## 7. 里程碑

### Milestone 1：基础 CRUD 闭环（P0）

- `listDrafts()` repo 函数 + `GET /api/drafts` 路由
- `app/drafts/page.tsx` 草稿列表页
- `deleteDraft()` repo 函数 + `DELETE /api/drafts/[id]` 路由
- 列表页 + 工作区的删除 UI

### Milestone 2：步骤管理 + 多文件（P1 前半）

- StepList 增强上移 / 下移 / 删除按钮
- `DELETE /api/drafts/[id]/steps/[stepId]` + `PUT /api/drafts/[id]/steps` 路由
- `create-draft-form.tsx` 重构为多文件输入

### Milestone 3：Patch 可视化（P1 后半）

- Step Editor 扩展代码预览 tab（只读 diff）
- Patch 列表展示 + 编辑
- `updateStepRequestSchema` 扩展 patches/focus/marks
- PATCH handler 更新

---

## 8. 最终结论

v3.2 的核心定位是 **补全基础 CRUD 闭环**。v3.0 和 v3.1 构建了"AI 生成 → 渲染"的单向链路，但用户在生成后几乎无法管理结果——找不到草稿、不能删除、不能组织步骤、不能修代码。

这些问题不是锦上添花，而是产品可用性的硬伤。一个不能管理草稿的工具，只能用来做一次性演示。

v3.2 不引入新的 AI 能力、不改变渲染链路、不改变 DSL 结构。所有改动都在「用户与草稿数据的交互层」——列表、删除、排序、多文件输入、patch 编辑。这些改动让 VibeDocs 从"AI 演示"变成"可用的教学工具"。
