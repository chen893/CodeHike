# VibeDocs 迭代路线图

**创建日期：** 2026-04-12
**基线版本：** v3.2（源码输入 → 多阶段 AI 生成 → 全量编辑 → 预览 → 发布）
**当前分支：** docs/iteration-roadmap

---

## 版本总览

```
v3.3  Patch 编辑体验 + 取消发布        ← 产品可用性
v3.4  AI 生成能力升级                   ← 技术突破
v3.5  产品化 & 上线准备                 ← 对外可用
v4.0  教程发现 & 平台化                 ← 规模化
```

每个版本独立可交付：v3.3 完成后编辑体验完整，v3.4 完成后 AI 能力突破，v3.5 完成后可对外 demo。

---

## v3.3 — Patch 编辑体验 + 取消发布

> 让编辑工作区从"能用"变成"好用"。当前 patch 编辑是 raw textarea，修改代码变更的体验粗糙。

### P0：可视化 Diff + 实时校验

- [ ] **3.3.1** 行级 diff 计算 `computeDiffLines(before, after) → DiffLine[]`
  - 复用 `diff` 库的 `diffArrays`（已安装）
  - 新建 `components/step-editor/diff-utils.ts`
- [ ] **3.3.2** `CodeDiffView` 组件 — unified diff 渲染（绿色 added、红色 removed、黄色 modified）
  - 新建 `components/step-editor/code-diff-view.tsx` + `diff-line.tsx`
- [ ] **3.3.3** 替换 step-editor 中的纯文本预览为 `CodeDiffView`
  - 修改 `components/step-editor.tsx`
  - 大文件（500+ 行）只渲染变更行 ± 10 行上下文
- [ ] **3.3.4** 单 patch 校验函数 `validateSinglePatch(previousCode, findText) → { status, matchCount, lineNumber }`
  - 新增到 `lib/tutorial/draft-code.js` 或 `diff-utils.ts`
- [ ] **3.3.5** `usePatchValidation` 防抖 hook — 300ms 防抖，多 patch 时基于累积代码校验
  - 新建 `components/step-editor/use-patch-validation.ts`
- [ ] **3.3.6** Patch 输入框状态指示器 — 绿色 ✓ 唯一匹配 / 红色 ✗ 未找到 / 黄色 ⚠ 多次匹配
  - 修改 `components/step-editor.tsx`

### P1：代码选区操作 + 中间态预览

- [ ] **3.3.7** 代码预览区文本选区捕获 + 浮动菜单
  - 新建 `components/step-editor/code-selection-layer.tsx` + `selection-menu.tsx`
  - 浏览器原生 `Selection` API
- [ ] **3.3.8** "设为 Patch Find" / "设为 Focus 范围" / "设为 Mark 行" 快捷操作
  - 修改 `components/step-editor.tsx`
- [ ] **3.3.9** 中间态计算 `computePatchIntermediateStates(previousFiles, patches, primaryFile)`
  - 逐个 patch 调用 `applyContentPatches`，记录每次应用后的代码
- [ ] **3.3.10** Patch 折叠/展开 + mini 预览 — 每个中间态只展示变更行 ± 3 行上下文

### P1：取消发布

- [ ] **3.3.11** `unpublishDraft` 服务 — 删除 published_tutorial 记录 + 清除草稿发布字段
  - 新建 `lib/services/unpublish-draft.ts`
- [ ] **3.3.12** `POST /api/drafts/[id]/unpublish` 路由
  - 新建 route handler
- [ ] **3.3.13** 工作区 + 列表页 UI — "取消发布"按钮（红色，需二次确认）

**约束：** 不引入新依赖，复用已有的 `diff`、CodeMirror、`getStepCodePreview()`。

---

## v3.4 — AI 生成能力升级

> 突破 DeepSeek 8192 token 上限，支持多模型，提升生成质量。

### P0：多模型支持

- [ ] **3.4.1** Provider 注册表 — 统一的 `createProvider(modelId)` 工厂函数
  - DeepSeek（现有）、OpenAI、Claude 等按 provider 分发
  - 修改 `lib/ai/` 层，保持 prompt 模板与 provider 解耦
- [ ] **3.4.2** 模型配置 schema — `{ provider, modelId, maxOutputTokens, supportsJsonResponse }`
  - 新增 `lib/schemas/model-config.ts`
- [ ] **3.4.3** 创建草稿时选择模型 — UI 下拉 + 传递 `modelId` 到生成链路
  - 修改 `components/create-draft-form.tsx` + `lib/services/generate-tutorial-draft.ts`
- [ ] **3.4.4** 模型能力探测 — 自动检测 `maxOutputTokens`、`response_format` 支持情况
  - 避免 MiniMax 式的静默失败（问题 #3）

### P1：智能生成

- [ ] **3.4.5** 大源码 chunking — 大纲阶段只传函数签名 + 注释，填充阶段按需加载
  - 修改 `lib/ai/outline-prompt.ts` + `lib/ai/step-fill-prompt.ts`
- [ ] **3.4.6** 增量重新生成 — 修改大纲后只重新生成受影响步骤
  - 新增 `lib/services/incremental-regenerate.ts`
  - 比对 old outline vs new outline，定位差异步骤
- [ ] **3.4.7** 生成风格模板 — 对话式 / 教科书式 / 渐进式，prompt 注入风格指令
  - 新增 `TeachingBrief.preferred_style` 选项值约束

### P2：AI 辅助编辑

- [ ] **3.4.8** AI patch 建议 — 编辑 patch 时"AI 推荐变更"入口
- [ ] **3.4.9** AI 文案润色 — 单步 paragraphs 的"AI 润色"按钮（复用 `regenerate-draft-step` 的 prose 模式）

**关键约束：**
- `@ai-sdk/openai-compatible` 兼容性最好，新模型优先通过它接入
- `generationModel` 字段已在 DB schema 中预留
- 不同模型对 patch 规则的遵循度不同，需要 prompt 适配层

---

## v3.5 — 产品化 & 上线准备

> 从个人工具变成可部署的产品。

### P0：用户系统 + 首页

- [ ] **3.5.1** 用户认证接入 — NextAuth.js 或 Clerk
  - GitHub OAuth 为主，邮箱登录为辅
  - 草稿绑定用户 ID，数据隔离
- [ ] **3.5.2** 教程展示首页 — `/` 展示已发布教程列表
  - 卡片布局：标题、描述、标签、浏览量
  - OG meta + SEO 友好的 slug URL
- [ ] **3.5.3** DB schema 扩展 — `drafts.userId`、`users` 表（如用 NextAuth 自带表可省略）

### P1：体验完善

- [ ] **3.5.4** 教程分享 — 已发布教程的公开链接 + embed snippet（iframe）
- [ ] **3.5.5** 错误恢复增强 — "从失败步骤批量重试"入口
  - 分析 patch 链，定位首个失效步骤，提供一键修复
- [ ] **3.5.6** 生成取消 — 前端"取消生成"按钮（后端 `CancelToken` 已实现）
- [ ] **3.5.7** 草稿版本快照 — 每次保存前创建快照，支持回退

### P1：工程质量

- [ ] **3.5.8** 测试覆盖 — patch 链正确性、assembler 核心算法、分层边界
  - `tests/patch-chain.test.js` — 多步 patch 应用 + 边界情况
  - `tests/assembler.test.js` — 高亮 + focus + marks 注入
  - `tests/layer-boundary.test.js` — 导入规则约束
- [ ] **3.5.9** 部署自动化 — Vercel 部署 + CI/CD + DB migration 流程
- [ ] **3.5.10** 性能监控 — 生成耗时、payload 大小、页面加载时间的简单埋点

### P2：运营基础

- [ ] **3.5.11** 使用统计 — 教程浏览量、生成次数、模型使用分布
- [ ] **3.5.12** 错误追踪 — 生成失败率、patch 校验失败率、Sentry 接入

---

## v4.0 — 教程发现 & 平台化

> 从单用户工具升级为教程平台。具体范围根据 v3.5 上线后的用户反馈决定。

### 教程市场

- [ ] **4.0.1** 公开教程浏览页 — 搜索 + 标签分类 + 排序（最新 / 最热 / 推荐）
- [ ] **4.0.2** 教程标签系统 — AI 自动生成标签 + 用户手动编辑
- [ ] **4.0.3** 教程评分 / 收藏

### 高级创作

- [ ] **4.0.4** 教程系列 — 多章节串联，支持"上一篇 / 下一篇"导航
- [ ] **4.0.5** 草稿模板 — 预设 TeachingBrief 模板（React 教程 / Node.js 教程等）
- [ ] **4.0.6** 批量源码导入 — GitHub repo URL → 自动解析文件结构

### 高级 AI

- [ ] **4.0.7** 多语言教程生成 — 输入中文源码，输出英文教程（或反向）
- [ ] **4.0.8** 交互式练习生成 — 在步骤间插入"试一试"练习题
- [ ] **4.0.9** 学习者自适应 — 根据读者停留时间/滚动行为调整教学节奏（远期）

### 导出能力

- [ ] **4.0.10** 导出为 Markdown — 保留代码高亮标记
- [ ] **4.0.11** 导出为 PDF — 打印友好的排版
- [ ] **4.0.12** 导出为静态 HTML — 嵌入式代码播放器

---

## 版本间的衔接点

```
v3.3 完成
  → Patch 编辑体验就绪，可引入 AI 辅助 patch 建议（v3.4 P2 的基础）
v3.4 完成
  → 多模型支持解除 token 瓶颈，大项目也能高质量生成
v3.5 完成
  → 用户系统 + 首页 + 测试，达到可对外展示的状态
v4.0
  → 按用户反馈决定平台化方向，优先做教程发现（引流）还是高级创作（留存）
```
