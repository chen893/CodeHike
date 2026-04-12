# 产品需求文档（PRD）：VibeDocs v3.1

**文档版本：** v3.1
**最后更新：** 2026-04-09
**对应基线：** v3.0 已完成源码输入 → AI 生成 → 编辑 → 预览 → 发布闭环
**实现状态：** P0 已完成，P1 已完成，P2 部分完成
**一句话定义：** 在 v3.0 闭环基础上，优化 AI 生成质量与阅读器交互，让自动生成的教程接近手工教程的教学水准。

---

## 0. 本版定位

v3.0 验证了完整链路：输入源码 → AI 端到端生成 → 编辑 → 预览 → 发布。但生成结果与顶级手工教程（如 *Build Your Own React*）存在明显差距：

1. **叙事质量** — AI 生成的是代码功能描述，不是带认知弧线的教学叙事
2. **步骤粒度** — 8192 token 上限导致 300 行源码被压缩成 6 步，每步承载过多变化
3. **阅读体验** — 当前渲染器只有滚动切换代码，缺少读者导向的交互能力

v3.1 不引入新功能模块（不做用户系统、不做协作编辑），而是集中提升两个维度：

- **生成质量**：让 AI 端到端产出的教程在教学设计上更接近手工水平
- **阅读交互**：让读者在消费教程时获得更好的理解和导航体验

---

## 1. 当前问题诊断

### 1.1 生成质量差距

| 维度 | 手工教程（如 Build Your Own React） | v3.0 生成结果 | 差距根因 |
|------|------|------|------|
| 叙事结构 | 先讲"为什么需要"，再展示代码作为"解决方案" | 先贴代码，再解释"这段代码做了什么" | Prompt 缺乏叙事弧线引导 |
| 步骤设计 | 按概念递进：先让最小模型跑起来，再指出不足，逐步修正 | 按代码模块分步：先写 A 模块，再写 B 模块 | AI 按代码结构而非学习路径组织 |
| 步骤粒度 | 每步一个概念，变化 3-5 行 | 每步一个模块，变化 15-30 行 | 一次性生成受 token 预算约束 |
| 认知脚手架 | 刻意给出不完整实现，下一步修正它 | 直接给出正确实现 | AI 默认追求"正确"，不会刻意制造认知缺口 |
| Prose 个性 | 对话式、有预判、有类比 | 教科书式、平铺直叙 | Prompt 未要求叙事风格 |

### 1.2 阅读交互差距

| 维度 | v3.0 状态 | v3.1 实现 |
|------|------|------|
| 代码导航 | 只能随滚动切换，无法跳转到任意步骤 | StepRail 侧边导航，点击跳转 + hover 显示变化量 |
| 代码变化 | 只显示当前步骤的完整代码，无变化可视化 | changeIndicator handler：新增行 `+` 绿色标记，修改行 `~` 黄色标记 |
| 进度感知 | 不知道当前在第几步 | StepRail 显示 completed/current/upcoming 状态 |
| 移动端 | 双栏折叠为单栏，代码区和文字区割裂 | MobileCodeFrame：每步内嵌代码块，文字-代码交替布局 |
| 行级动画 | 无 | animateLineDiff：幽灵行淡出 + 新增行淡入 |

---

## 2. v3.1 目标与非目标

### 2.1 目标

1. AI 端到端生成的教程，在教学设计上显著优于 v3.0
2. 生成的步骤粒度更细，每步引入的概念更单一
3. 教程文案从"代码说明书"升级为"教学叙事"
4. 读者在阅读时有更好的导航和上下文感知
5. 代码区的展示能直观呈现行级变化

### 2.2 成功标准

**生成质量：**
- 相同源码输入下，v3.1 生成的步骤数 ≥ v3.0 的 1.5 倍（粒度更细）
- Patch 校验通过率 ≥ 90%（粒度更细后每个 patch 更小，匹配更容易）
- 人工评审时，"教学主线清晰"评分显著高于 v3.0

**阅读体验：**
- 读者可以通过 StepRail 跳转到任意步骤
- 读者可以直观看到每步的代码变化（新增/修改行标记）
- 移动端文字和代码交替排列，无需来回滚动

### 2.3 非目标

- 不做用户系统、登录注册
- 不做协作编辑、评论、社区
- 不做可视化 patch 编辑器
- 不做步骤删除/重排
- 不做 AI 模型训练或微调
- 不改变渲染底座（继续复用 `TutorialScrollyDemo`）

---

## 3. 功能需求

### 3.1 多阶段生成（Phase Generation） ✅ 已实现

**问题：** v3.0 一次性生成完整 `TutorialDraft`，受 8192 token 限制，300 行源码被压缩成 6 步。

**方案：** 将一次性生成拆为三个阶段，每个阶段独立调用 AI，突破 token 预算限制。

**实现文件：**
- `lib/ai/outline-prompt.ts` — 阶段一 prompt
- `lib/ai/step-fill-prompt.ts` — 阶段二 prompt
- `lib/ai/multi-phase-generator.ts` — SSE 流编排（outline → step-fill with retry → validate）
- `lib/services/generate-tutorial-draft.ts` — v1/v2 入口分发 + 异步持久化

#### 阶段一：生成教学大纲（Outline）

输入：`sourceItems` + `teachingBrief`
输出：

```ts
type TutorialOutline = {
  meta: { title: string; lang: string; fileName: string; description: string }
  intro: { paragraphs: string[] }
  baseCode: string
  steps: Array<{
    id: string
    title: string
    teachingGoal: string
    conceptIntroduced: string
    estimatedLocChange: number  // 3-8，超出则拆分
  }>
}
```

Prompt 核心要求（已实现在 `outline-prompt.ts`）：

1. 先确定认知弧线，再决定步骤
2. 每步只引入一个概念，概念间有递进关系
3. baseCode 是源码的最小可运行子集
4. `estimatedLocChange` 严格控制在 3-8 行
5. 叙事弧线模板：开端 → 发展 → 转折 → 收束

#### 阶段二：逐步填充内容（Step Fill）

对每个步骤独立调用 `generateText` + `Output.object({ schema: tutorialStepSchema })`。

关键实现细节（`multi-phase-generator.ts`）：

- 每步生成前，通过 `applyContentPatches` 逐步累积计算 `previousCode`
- 单步失败自动重试最多 3 次（`MAX_STEP_RETRIES = 3`），重试时传入上次错误信息
- 3 次全部失败后生成降级步骤（标题来自 outline，paragraphs 提示手动编辑）
- LOC 超预算仅 warn 不阻塞（容差 +10 行）
- 每步生成后注入 outline 的 `teachingGoal` 和 `conceptIntroduced`

Prompt 核心要求（已实现在 `step-fill-prompt.ts`）：

1. "问题 → 解决 → 收束"三段结构
2. find 必须从当前代码逐字精确复制
3. patches 总变化控制在 3-8 行
4. focus 指向变化核心区域

#### 阶段三：校验（Validate）

- 对组装后的完整 `TutorialDraft` 执行 `validateTutorialDraft`
- 校验结果通过 SSE 事件发送给前端
- 校验结果影响 `generationState`（succeeded / failed）

#### SSE 流协议

```text
event: phase       data: {"phase": "outline", "status": "started"}
event: outline     data: {"meta": {...}, "steps": [{...}]}
event: phase       data: {"phase": "step-fill", "stepIndex": 0, "totalSteps": N}
event: step        data: {"stepIndex": 0, "step": {...}}
event: phase       data: {"phase": "step-fill", "stepIndex": 1, "totalSteps": N}
...
event: phase       data: {"phase": "validate", "status": "started"}
event: validation  data: {"valid": true, "errors": []}
event: done        data: {"success": true}
```

前端消费（`components/generation-progress.tsx`）：

- 自动检测 v1/v2 协议
- v2 模式展示大纲预览 + 逐步填充进度
- SSE 流结束后轮询 `/api/drafts/[id]` 等待服务端持久化完成

### 3.2 叙事质量 Prompt 优化 ✅ 已实现

**实现位置：** `lib/ai/outline-prompt.ts` 和 `lib/ai/step-fill-prompt.ts`

#### 大纲阶段 Prompt

注入"认知弧线"框架：
1. 开端：最小可运行代码，成就感
2. 发展：指出不足 → 引入新概念修正
3. 转折：至少一步"推翻简单实现"
4. 收束：最终代码与源码对齐

禁止模式：按模块罗列、并列无递进、直接展示完整实现。

#### 步骤填充阶段 Prompt

`paragraphs` 必须遵循"问题 → 解决 → 收束"三段结构：
1. 描述当前代码的不足（为什么需要）
2. 代码变化通过 patches 展示
3. 解释解决了什么问题（收束）

### 3.3 生成结果质量评估 ✅ 已实现

**实现文件：** `lib/services/compute-generation-quality.ts`、`lib/schemas/generation-quality.ts`

每次 v2 生成后自动计算质量指标，存入 `DraftRecord.generationQuality`。

```ts
type GenerationQuality = {
  stepCount: number                // 总步骤数
  avgPatchesPerStep: number        // 每步平均 patch 数
  avgLocChangePerStep: number      // 每步平均代码变化行数
  avgParagraphsPerStep: number     // 每步平均段落数
  proseToCodeRatio: number         // 文案字数 / 代码变化行数
  patchValidationPassRate: number  // 有 patches 的步骤占比
  outlineToFillConsistency: number // 大纲标题与实际步骤标题的一致性
  retryCount: number               // 总重试次数
  totalGenerationTimeMs: number    // 总生成耗时
}
```

`outlineToFillConsistency` 使用语义关键词匹配（精确匹配 / 子串匹配 / 关键词重叠率 ≥ 30%），支持中英文标题。

不作为发布阻塞条件，仅作质量监控数据基础。

### 3.4 步骤导航（StepRail） ✅ 已实现

**实现位置：** `components/tutorial-scrolly-demo.jsx` → `StepRail` 组件

**实际实现方案：**

- 竖向 dash 风格导航条，位于代码区和文章区之间
- 使用 CodeHike `useSelectedIndex()` 获取当前选中步骤
- 点击 dash 节点：`selectIndex(i)` + `scrollIntoView` 双向同步
- 三种状态样式：`completed`（已完成）、`current`（当前）、`upcoming`（未到达）
- Hover tooltip 显示步骤标题和变化量（如 "2 changes · ~5 lines"）

### 3.5 代码变化指示器 ✅ 已实现

**实现位置：**
- 服务端：`lib/tutorial-assembler.js` → `computeLineChanges()` + `injectAnnotations()`
- 客户端：`components/tutorial-scrolly-demo.jsx` → `changeIndicator` CodeHike handler

**实际实现方案：**

组装层通过 `diffArrays` 对比前后代码，生成行级变化 map（added / modified），通过 `!change()` 注解注入代码。渲染器的 `changeIndicator` handler 解析注解：

- 新增行：左侧 `+` 标记，绿色左边框 + 淡绿背景
- 修改行：左侧 `~` 标记，黄色左边框 + 淡黄背景

**注意：** 变化信息通过 CodeHike 注解机制传递（服务端注入 `// !change(1) added`），不扩展 payload 结构。

### 3.6 行级过渡动画 ✅ 已实现

**实现位置：** `components/tutorial-scrolly-demo.jsx` → `animateLineDiff()`

- 删除行：创建幽灵行 DOM，淡出 + 上移动画后移除
- 新增行：淡入 + 下移动画，带逐行延迟（每行 45ms）

### 3.7 移动端阅读优化 ✅ 已实现

**实现位置：** `components/tutorial-scrolly-demo.jsx` → `MobileCodeFrame`

- 每个步骤的文字和代码紧邻排列（`article-step-code-mobile`）
- 移动端不再只显示代码区，而是在每步文字下方内嵌对应代码块
- 代码块包含 focus 高亮和 changeIndicator 标注

### 3.8 编辑器增强 ✅ 已实现

**新增组件：**

| 组件 | 实现 | 用途 |
|------|------|------|
| `components/code-mirror-editor.tsx` | CodeMirror 6 封装 | 步骤代码编辑（多语言、只读模式） |
| `components/markdown-editor.tsx` | 自定义 Markdown 编辑器 | 步骤文案编辑（工具栏 + 编辑/预览切换） |
| `components/app-shell.tsx` | 应用外壳 | 桌面侧边栏 + 移动端抽屉导航 |

---

## 4. 数据模型

### 4.1 DraftRecord（实际 DB schema）

**实现文件：** `lib/db/schema.ts`

v3.1 使用**扁平列**存储（非嵌套 `generation` 对象），通过 Drizzle pgEnum + jsonb 实现。

```ts
// 关键字段（v3.0 基线）
drafts = pgTable('drafts', {
  id, status, sourceItems, teachingBrief, tutorialDraft,
  syncState, inputHash, tutorialDraftInputHash,
  generationState,        // pgEnum: idle | running | succeeded | failed
  generationErrorMessage, // text
  generationModel,        // varchar(64)
  generationLastAt,       // timestamp

  // v3.1 新增（均为可选，向后兼容）
  generationOutline,      // jsonb: TutorialOutline | null
  generationQuality,      // jsonb: GenerationQuality | null

  validationValid, validationErrors, validationCheckedAt,
  publishedSlug, publishedTutorialId, publishedAt,
  createdAt, updatedAt,
})
```

**设计说明：**

- `generationVersion` 不持久化，仅作为 `POST /generate` 的请求参数（默认 `"v2"`）
- `generationOutline` 和 `generationQuality` 为可选 jsonb，v3.0 草稿此列为 null
- 没有使用 PRD 初版中的嵌套 `generation` 对象，保持 DB 列扁平以便独立查询和更新

### 4.2 Zod Schema 新增

| Schema | 文件 | 用途 |
|--------|------|------|
| `tutorialOutlineSchema` | `lib/schemas/tutorial-outline.ts` | 阶段一 AI 输出约束 |
| `generationQualitySchema` | `lib/schemas/generation-quality.ts` | 质量指标结构定义 |
| `tutorialStepSchema` 扩展 | `lib/schemas/tutorial-draft.ts` | 新增 `teachingGoal`、`conceptIntroduced` 可选字段 |

### 4.3 API 变更

| API | 变更 |
|-----|------|
| `POST /api/drafts/[id]/generate` | 支持 `generationVersion` 参数（`"v1"` / `"v2"`），默认 `"v2"` |
| `POST /api/drafts/[id]/generate` | v2 模式返回多阶段 SSE 流（event: phase/outline/step/validation/done） |
| `GET /api/drafts/[id]` | 返回 `generationOutline` 和 `generationQuality` 字段 |

---

## 5. 实现优先级与状态

### P0：生成质量核心 ✅ 已完成

1. **多阶段生成** — outline → step-fill (with retry) → validate
2. **叙事质量 Prompt** — 认知弧线 + 问题驱动叙事 + 三段结构
3. **前端生成进度** — `GenerationProgress` 组件支持 v2 SSE 协议

### P1：阅读交互 ✅ 已完成

4. **StepRail 步骤导航** — dash 风格侧边导航 + hover tooltip
5. **代码变化指示器** — changeIndicator handler + 行级 diff 注入
6. **行级过渡动画** — 幽灵行淡出 + 新增行淡入
7. **移动端布局** — MobileCodeFrame 文字-代码交替排列

### P1.5：编辑器增强 ✅ 已完成

8. **CodeMirror 编辑器** — 步骤代码编辑
9. **Markdown 编辑器** — 步骤文案编辑（工具栏 + XSS 安全过滤）
10. **AppShell 布局** — 统一应用外壳

### P2：质量监控

11. **生成质量评估** ✅ — 每次生成后计算并持久化质量指标
12. **生成历史对比** — 未实现（同源码不同 brief 的生成结果对比视图）

---

## 6. 技术约束

### 6.1 继续复用渲染底座

v3.1 的阅读交互改进建立在现有 `TutorialScrollyDemo` 基础上，通过 CodeHike handler 机制（`focus`、`mark`、`changeIndicator`、`tokenTransitions`）扩展功能，不替换组件。

### 6.2 不改变 DSL 核心结构

`TutorialDraft` 的核心结构（meta、intro、baseCode、steps）不变。新增字段（`teachingGoal`、`conceptIntroduced`）为可选扩展，不影响现有数据兼容性。

### 6.3 多阶段生成的降级策略

- v1/v2 通过 `generationVersion` 请求参数切换，v1 逻辑完整保留
- 大纲生成失败：SSE 流发送 error 事件并终止，不降级为 v1
- 某步填充失败 3 次：生成降级步骤（paragraphs 提示手动编辑），不阻塞后续步骤
- 校验不通过：`generationState` 设为 `failed`，草稿内容仍保留可供手动编辑

### 6.4 向后兼容

- v3.0 已有的草稿和已发布教程不受影响
- `generationVersion: "v1"` 继续使用旧逻辑（`createTutorialGenerationStream`）
- API 新增字段均为可选，不影响现有消费者
- `tutorialStepSchema` 新增字段均为 `.optional()`，Zod parse 向后兼容

---

## 7. 关键风险

### 7.1 多阶段生成的总耗时增加

**风险：** 阶段一 + 阶段二逐步 + 阶段三校验，总耗时可能达到 2-5 分钟。
**缓解：** SSE 流实时展示进度。前端展示大纲 → 逐步填充进度 → 校验结果，体感上接近实时。`maxDuration = 300` 已配置。

### 7.2 逐步填充的 patch 一致性

**风险：** 每步独立生成，后续步骤可能引用不存在的代码。
**缓解：** 每步填充时通过 `applyContentPatches` 逐步累积计算 `previousCode`，AI 基于真实代码写 find。每步完成后立即校验 patch 可应用性，失败重试。

### 7.3 叙事弧线是否可被 Prompt 工程约束

**风险：** Prompt 要求"问题驱动叙事"，但 AI 可能仍然按功能模块组织。
**缓解：** 大纲阶段已约束教学路径（认知弧线 + 每步单概念），步骤填充阶段有 `teachingGoal` 约束。两阶段配合比单一 prompt 更容易控制叙事结构。

---

## 8. 验收标准

### 8.1 生成质量验收

使用以下测试用例：

| 测试用例 | 源码行数 | 预期步骤数 | 验收标准 |
|---------|---------|----------|---------|
| Redux store（300 行） | 300 | 10-15 步 | 每步 ≤ 10 行变化，叙事有问题-解决结构 |
| React useState（80 行） | 80 | 6-8 步 | 每步 ≤ 8 行变化，从最简用到完整用 |
| Express 中间件（150 行） | 150 | 8-12 步 | 每步一个中间件概念 |

### 8.2 阅读交互验收

- [x] 读者可以通过 StepRail 跳转到任意步骤
- [x] 新增行有 `+` 标记和淡色背景，修改行有 `~` 标记
- [x] 移动端文字和代码交替排列，无需来回滚动
- [x] 行级过渡动画（幽灵行淡出 + 新增行淡入）

### 8.3 向后兼容验收

- [x] v3.0 生成的草稿仍可正常预览和发布
- [x] 已发布的教程不受影响
- [x] API 新增字段不影响现有前端消费者
- [x] `generationVersion: "v1"` 仍可正常使用

---

## 9. 里程碑

### Milestone 1：多阶段生成 ✅ 已完成

- `TutorialOutline` schema（`lib/schemas/tutorial-outline.ts`）
- 大纲生成 prompt（`lib/ai/outline-prompt.ts`）
- 逐步填充 prompt + 单步校验 + 自动重试（`lib/ai/step-fill-prompt.ts`、`lib/ai/multi-phase-generator.ts`）
- v1/v2 入口分发 + 异步持久化（`lib/services/generate-tutorial-draft.ts`）
- 前端生成进度展示（`components/generation-progress.tsx` v2 协议）

### Milestone 2：阅读交互增强 ✅ 已完成

- StepRail 步骤导航（`tutorial-scrolly-demo.jsx` → `StepRail`）
- 代码变化指示器（`tutorial-assembler.js` → `computeLineChanges` + `changeIndicator` handler）
- 行级过渡动画（`animateLineDiff`）
- 移动端布局（`MobileCodeFrame`）
- 编辑器增强（`CodeMirrorEditor`、`MarkdownEditor`、`AppShell`）

### Milestone 3：质量监控 部分完成

- [x] 生成质量评估指标计算（`compute-generation-quality.ts`）
- [x] 质量数据持久化（`generationQuality` jsonb 列）
- [ ] 多源码多 brief 的生成对比视图

---

## 10. 最终结论

v3.1 的核心假设已验证：**多阶段生成 + 叙事 prompt 优化，可以在保持端到端自动化的前提下，显著提升教程的教学质量。**

多阶段生成的本质是把"AI 一次性想清楚教学路径和代码实现"这个过于困难的任务，拆解为"先想清楚教学路径（大纲），再逐个实现代码变化（填充），最后检查一致性（校验）"三个更可控的子任务。

这个方向不改变产品定位（AI 端到端生成），不改变 DSL 核心结构（仍然是 TutorialDraft），不改变渲染底座（仍然是 TutorialScrollyDemo），而是在生成链路内部提升质量，在渲染层通过 CodeHike handler 机制提升阅读体验。
