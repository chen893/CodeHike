# VibeDocs v3.3 / v3.4 / v3.5 Implementation Plan

## Context

VibeDocs v3.2 已完成核心链路（源码输入 → 多阶段 AI 生成 → 全量编辑 → 预览 → 发布），但编辑工作区 patch 编辑体验粗糙（纯文本 find/replace 无校验），AI 生成受 DeepSeek 8192 token 硬限制，产品无用户系统。本计划基于 `docs/iteration-roadmap.md` 的三阶段路线图，给出文件级的实施步骤。

---

## v3.3 — 编辑可用性 + 工程基础

> 让编辑工作区从"技术验证"变成"日常可用"

### Phase 3.3.A: Diff 工具函数（基础设施）

**新建** `components/step-editor/types.ts`
- 导出共享类型: `DiffLine { type, content, lineNumber }`, `PatchValidationResult { status, matchCount, lineNumber }`, `IntermediatePatchState`

**新建** `components/step-editor/diff-utils.ts`
- `computeDiffLines(before, after): DiffLine[]` — 用 `diffArrays`（`diff` 包已在依赖中）生成统一 diff
- `formatUnifiedDiff(diffLines, contextLines=10): DiffLine[]` — 截断只显示变更行+N行上下文
- `classifyPatchValidation(previousCode, findText): PatchValidationResult` — 复用 `draft-code.js` 的 `countOccurrences`，增加行号定位

**复用**: `diff` npm 包的 `diffArrays`（已在 `assembler.js` 和 `draft-code.js` 中使用）

### Phase 3.3.B: CodeDiffView 组件（核心 UI）

**新建** `components/step-editor/diff-line.tsx`
- 单行渲染: `{ type, content, lineNumber }` → CSS 类 + gutter 标记（`+`/`-`/`~`）

**新建** `components/step-editor/code-diff-view.tsx`
- Props: `{ diffLines: DiffLine[], language: string, height?: string }`
- 渲染方式: `<div>` + monospace font + CSS 背景色（不用 CodeMirror，因 CM 不支持混合行类型）
- 红色 removed、绿色 added、黄色 modified、中性 unchanged

### Phase 3.3.C: 实时 Patch 校验 + Step Editor 重构

**新建** `components/step-editor/use-patch-validation.ts`
- Hook: `{ previousCode, patches } → PatchValidationState[]`
- 300ms 防抖，逐 patch 累积调用 `classifyPatchValidation`

**修改** `components/step-editor.tsx`（当前 612 行）
1. 替换 lines 290-317 的 Before/After `CodeMirrorEditor` 为单个 `<CodeDiffView>`
2. 在 patch find textarea 旁（lines 386-403 区域）加校验状态指示器: ✓ 唯一匹配 / ✗ 未找到 / ⚠ 多次匹配
3. 用 `usePatchValidation` hook 驱动校验状态
4. 可移除 `previewError` 分支（lines 283-288），用新的校验逻辑替代

### Phase 3.3.D: Patch 中间态预览

**新建** `components/step-editor/intermediate-preview.tsx`
- 当 step 有多个 patch 时，展示每个 patch 的独立 diff 效果（折叠手风琴）
- 每个 patch 调用 `applyContentPatches` 累积计算，用 `<CodeDiffView>` compact 模式（3 行上下文）
- 默认折叠，可展开

**修改** `components/step-editor.tsx` — patches 区域后条件渲染 `<IntermediatePatchPreview>`

### Phase 3.3.E: 取消发布

**新建** `lib/services/unpublish-draft.ts`
- `unpublishDraft(draftId)` — 事务: 删除 `published_tutorials` 行 + 更新 draft 状态为 `draft`，清空 `publishedSlug/publishedTutorialId/publishedAt`

**修改** `lib/repositories/published-tutorial-repository.ts`
- 新增 `deletePublishedTutorial(id)` 方法

**新建** `app/api/drafts/[id]/unpublish/route.ts`
- POST handler, 调用 `unpublishDraft`

**修改** `components/drafts/draft-client.ts` — 新增 `unpublishDraftRequest(draftId)`
**修改** `components/drafts/use-draft-workspace-controller.ts` — 新增 `unpublishDraft()` 方法
**修改** `components/drafts/draft-workspace-sidebar.tsx` — 新增"取消发布"按钮（仅 published 状态显示，需二次确认）

### Phase 3.3.F: 代码选区操作（需技术验证）

**前置**: 1-2 天技术验证 — 测试 Selection API + CodeHike token DOM 兼容性

**如果验证通过:**
- **新建** `components/step-editor/code-selection-menu.tsx` — 浮动菜单（设为 Patch Find / Focus / Mark）
- **修改** `step-editor.tsx` — 包装 CodeDiffView 容器，监听选区事件

**如果验证失败**: 降级为 P2，可后续补"复制到剪贴板"的简单替代

### Phase 3.3.G: 测试覆盖

**新建** `tests/patch-chain.test.js`
- 多步 patch 应用、多文件 patch 链、空 patch 步骤、边界情况（find 在文件头/尾、空 find/replace）

**新建** `tests/assembler.test.js`
- `computeLineChanges`、`findLineRange`、`injectAnnotations`、`getAnnotationCommentStyle`
- `buildTutorialSteps` 最小 2 步教程（可能需 mock CodeHike `highlight`）

**新建** `tests/layer-boundary.test.js`
- 扩展 `codebase-structure.test.js` 模式，验证分层导入规则

### Phase 3.3.H: 错误分类框架

**新建** `lib/errors/error-types.ts`
- 判别联合类型: `patch_not_found | patch_ambiguous | patch_file_not_found | generation_outline_failed | generation_step_failed | generation_cancelled | validation_failed | publish_*`

**新建** `lib/errors/classify-error.ts`
- `classifyPatchError(rawError, patchIndex?)` — 解析 `applyContentPatches` 抛出的字符串消息为结构化错误
- `classifyGenerationError(rawError, context?)`

---

## v3.4 — AI 生成升级 + 首次体验优化

> 突破 DeepSeek 8192 token 硬天花板

### Phase 3.4.A: Provider 注册表（基础设施）

**新建** `lib/ai/provider-registry.ts`
- `PROVIDERS` 配置 map（deepseek/openai/... 各含 name, baseURL, apiKeyEnvVar, defaultModel, maxOutputTokens, supportsJsonResponse）
- `createProvider(modelId)` 工厂函数 — 解析 "provider/model" 格式，返回 AI SDK model instance

**新建** `lib/schemas/model-config.ts`
- `modelConfigSchema` + `AVAILABLE_MODELS` 常量数组（含 label 供 UI 使用）

**修改** `lib/ai/tutorial-generator.ts` — 删除 lines 8-14 的内联 deepseek provider，改用 `createProvider`
**修改** `lib/ai/multi-phase-generator.ts` — 删除 lines 14-20 的重复 deepseek provider，改用 `createProvider`；替换硬编码的 `maxOutputTokens: 4096` 为模型感知值

**关键陷阱**: 新模型必须用 `@ai-sdk/openai-compatible`（不用 `@ai-sdk/openai`，走 `/responses` 端点不兼容）

### Phase 3.4.B: 模型选择 UI

**修改** `components/create-draft-form.tsx` — 新增模型选择下拉框（options 来自 `AVAILABLE_MODELS`）
**修改** `components/drafts/use-create-draft-form-controller.ts` — form state 增加 `modelId`
**修改** `app/api/drafts/[id]/generate/route.ts` — 从 request body 解析 `modelId` 传入 `initiateGeneration`（当前 line 23 已有 `modelId` 参数但未从 body 读取）
**修改** `components/drafts/draft-client.ts` — `startDraftGenerationStream` 传入 `modelId`

**注**: `initiateGeneration(draftId, modelId?, generationVersion)` 的 `modelId` 参数已存在（generate-tutorial-draft.ts line 11），只需从 route handler 传入

### Phase 3.4.C: Prompt-Provider 解耦

**新建** `lib/ai/prompt-adapters.ts`
- `adaptPromptForModel(basePrompt, modelId)` — per-model prompt 调整
- `getLocBudget(modelId)` — 不同模型不同 LOC 限制

**修改** `lib/ai/prompt-templates.ts` — 提取硬编码 "15 lines" 为参数
**修改** `lib/ai/step-fill-prompt.ts` — 提取 "3-8 lines" 为参数，应用 `adaptPromptForModel`
**修改** `lib/ai/outline-prompt.ts` — 应用 `adaptPromptForModel`

### Phase 3.4.D: 模型能力探测

**新建** `lib/ai/model-probe.ts`
- `probeModelCapabilities(modelId)` — 发送最小 generateText 调用，检测可达性、延迟、response_format 支持

**新建** `app/api/models/probe/route.ts`
- POST `{ modelId }` → 探测结果

### Phase 3.4.E: 生成风格模板

**新建** `lib/ai/style-templates.ts`
- `STYLE_TEMPLATES` 数组: `{ id: 'conversational' | 'textbook' | 'progressive', label, description, promptInjection }`

**修改** `components/create-draft-form.tsx` — 风格选择下拉框 → `brief.preferred_style`

**注**: prompt 层已支持 `preferred_style`（三个 prompt 文件都有条件注入逻辑），只需 UI 选择器

### Phase 3.4.F: 首次体验模板

**新建** `lib/first-experience-template.ts`
- 预设 `SourceItem[]`（复用 `docs/mini-redux.js` 内容）+ `TeachingBrief`

**修改** `components/create-draft-form.tsx` — "用示例试试" 按钮，一键填充模板数据

### Phase 3.4.G: 增量重新生成（P1，可延后）

**新建** `lib/services/incremental-regenerate.ts`
- `computeAffectedSteps(oldOutline, newOutline): number[]` — 比对大纲差异
- `regenerateAffectedSteps(draftId, affectedIndices)` — 逐步重生成

**新建** `app/api/drafts/[id]/incremental-regenerate/route.ts`

**依赖**: 3.4.A + 3.4.C

### Phase 3.4.H: 错误恢复增强

**修改** `components/tutorial/generation-progress-view.tsx` — "从失败步骤重试"按钮
**修改** `components/drafts/use-draft-workspace-controller.ts` — 用 v3.3.H 的错误分类增强重试逻辑

---

## v3.5 — 产品化 & 对外可用

> 从个人工具变成可部署、可分享的产品

### Phase 3.5.A: 用户认证（L — 最大变更）

**安装**: `next-auth@5`（利用已有 PostgreSQL）

**新建**:
- `lib/auth.ts` — auth 配置 + `getCurrentUser()`, `requireAuth()`
- `app/api/auth/[...nextauth]/route.ts` — NextAuth route handler（GitHub OAuth）
- `middleware.ts` — 保护 `/drafts/*`, `/new`, `/api/drafts/*`；公开 `/`, `/[slug]`
- `components/auth/login-button.tsx`
- `components/auth/user-menu.tsx`

**新建** `drizzle/0001_add_user_id.sql`
- `drafts` 表新增 `userId` 列（nullable 先兼容，后续 required）
- NextAuth 需要的 users/accounts/sessions/verification_tokens 表

**修改** `lib/db/schema.ts` — 新增 `userId` 列定义 + NextAuth 表

**修改** `lib/repositories/draft-repository.ts` — ~10 个查询函数加 `userId` 参数/过滤
**修改** `lib/repositories/published-tutorial-repository.ts` — published 查询保持公开（不过滤 userId）

**修改** 全部 8 个 API route 文件 — 从 session 提取 userId 传入 service
**修改** 全部 service 文件 — 透传 userId 到 repository

**修改** `components/app-shell.tsx` — 认证感知 header（Login/UserMenu）

### Phase 3.5.B: 公开首页增强

**修改** `app/page.jsx` — OG meta、卡片布局、step/language badge、阅读时间
**修改** `lib/services/tutorial-queries.ts` — 新增 `getPublicTutorialList()` 含计算元数据
**新建** `lib/utils/seo.ts` — OG meta 生成、JSON-LD structured data
**修改** `app/[slug]/page.jsx` — `generateMetadata` + `generateStaticParams`

### Phase 3.5.C: 教程分享 + Embed

**新建** `components/tutorial/share-dialog.tsx` — 公开 URL + embed snippet + 社交分享按钮
**修改** `components/tutorial/tutorial-scrolly-demo.jsx` — 添加 Share 按钮
**新建** `app/api/tutorials/[slug]/embed/route.ts` — 简化 HTML 页面（无 AppShell），含 CORS header

### Phase 3.5.D: OG Image

**新建** `app/api/og/[slug]/route.ts` — Next.js ImageResponse 生成 OG 图片（标题+语言+步数+品牌）
**修改** `app/[slug]/page.jsx` — `generateMetadata` 引用 OG image URL

### Phase 3.5.E: 取消生成按钮

**修改** `components/tutorial/generation-progress-view.tsx` — "取消生成"按钮，调用 `abortController.abort()`
**修改** `components/tutorial/use-generation-progress.ts` — 处理 abort 为 `cancelled` 状态而非 `error`

**注**: 后端 CancelToken 机制已就绪（generate-tutorial-draft.ts lines 49-52, 127-133），前端 AbortController 也已存在

### Phase 3.5.F: 草稿版本快照

**修改** `lib/db/schema.ts` — 新增 `draftSnapshots` 表
**新建** `lib/repositories/draft-snapshot-repository.ts` — CRUD
**新建** `lib/services/draft-snapshots.ts` — 创建/恢复快照
**新建** `app/api/drafts/[id]/snapshots/route.ts` — GET list + POST create
**新建** `app/api/drafts/[id]/snapshots/[snapshotId]/route.ts` — POST restore

### Phase 3.5.G: 部署自动化

**新建** `.github/workflows/ci.yml` — PR 检查: test + build
**新建** `.github/workflows/deploy.yml` — main push: test → build → deploy Vercel → DB migration

### Phase 3.5.H: 监控 + 测试延续

**新建** `lib/monitoring/metrics.ts` — 简单计时和计数工具
**新建** `tests/api-routes.test.js` — API 契约测试（mock DB）
**新建** `tests/model-config.test.js` — provider registry 单元测试

---

## 跨版本依赖图

```
v3.3.A (diff-utils) → v3.3.B (CodeDiffView) → v3.3.C (step-editor 重构)
                                                   ↓
v3.3.H (error types) ───────────────────→ v3.4.H (error recovery)
v3.3.G (tests) ←── 贯穿所有版本的测试基础

v3.4.A (provider registry) → v3.4.B (model UI) + v3.4.C (prompt 解耦) + v3.4.D (probe)
v3.4.E (style templates) ─────────────── 独立
v3.4.F (first experience) ────────────── 独立
v3.4.G (incremental regen) → 依赖 3.4.A + 3.4.C

v3.3 + v3.4 完成 → v3.5.A (user auth)
v3.5.A → v3.5.B (homepage) → v3.5.C (sharing) → v3.5.D (OG images)
v3.5.A → v3.5.F (snapshots)
v3.5.G (deploy) → 独立，可与其它 phase 并行
```

## 验证方式

每个版本完成后:
1. `npm run build` — 确保编译通过
2. `npm test` — 运行所有测试
3. `npm run dev` — 手动验证核心流程:
   - v3.3: 创建草稿 → 编辑 patch → 看到可视化 diff + 校验状态 → 取消发布
   - v3.4: 创建草稿 → 选择模型/风格 → 生成 → 验证多模型工作
   - v3.5: GitHub 登录 → 创建/编辑/发布 → 公开首页访问 → 分享
4. 浏览器测试 scrollytelling 渲染效果（Chrome + Safari）
