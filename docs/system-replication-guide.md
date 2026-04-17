# VibeDocs — 系统复刻技术指南

> 面向 AI Agent 的系统理解与完整复刻文档。读完本文档应能理解 VibeDocs 的全部设计决策，并有能力从零复现整个系统。

---

## 1. 一句话定义

**VibeDocs** 是一个 AI 驱动的 scrollytelling 源码教学教程生成器：用户输入源码 + 教学意图 → 系统通过多阶段 AI 生成结构化教程 → 用户编辑/预览 → 发布为可交互的滚动式教程页面。

---

## 2. 核心概念

### 2.1 教程 DSL（整个系统的数据核心）

系统的一切围绕一个 JSON 数据结构运转——AI 生成它、编辑器修改它、渲染器消费它。

```
TutorialData {
  meta: { title, lang?, fileName?, description }
  intro: { paragraphs: string[] }
  baseCode: string | Record<string, string>   // 单文件用 string，多文件用 { "file.js": "code" }
  steps: TutorialStep[]
}
```

**关键设计——内容锚定 Patch（不用行号）：**

每个 step 的代码变更不使用行号，而是用 find/replace 文本匹配：

```
ContentPatch {
  find: string     // 在当前代码中精确唯一匹配的文本片段
  replace: string  // 替换后的文本
  file?: string    // 多文件模式下的目标文件
}
```

这个设计是整个系统最核心的架构决策：
- AI 不需要计算行号，只需"找到旧代码 → 写新代码"
- 比完整代码快照节省 ~58% token
- 运行时可验证（不匹配立即报错，不会静默错位）

同样，高亮区域（focus）和行标记（marks）也用内容锚定，不用行号。

### 2.2 组装算法（服务端，不可在客户端运行）

```
1. currentCode = baseCode
2. 对每个 step：
   a. 应用 patches（find/replace，按数组顺序，必须精确唯一匹配）
   b. step.fullCode = currentCode
   c. 计算 focus/mark 的行号（通过 indexOf + 统计换行符）
   d. 注入行变更注解（新增行标 +，修改行标 ~）
   e. CodeHike highlight() 语法高亮
3. 输出带高亮代码的 steps 数组
```

### 2.3 Scrollytelling 渲染（固定的基础设施）

- **左侧**：固定代码面板（sticky），随滚动切换显示哪步的代码
- **右侧**：独立滚动的文章（引言 + 各步骤文字）
- **联动**：IntersectionObserver 检测哪步文字进入视口，切换左侧代码
- **变更指示器**：新增行绿色 + 号、修改行黄色 ~ 号
- **移动端**：文字-代码交替布局，每步内嵌代码块

---

## 3. 用户流程

```
用户输入源码 + TeachingBrief
  → 创建 DraftRecord（存 DB）
  → 触发 AI 多阶段生成（SSE 流式推送进度）
     阶段一：Outline（教学大纲，每步 teachingGoal + conceptIntroduced）
     阶段二：Step Fill（逐步填充：paragraphs + patches + focus + marks）
     阶段三：Validate（全链路校验 patch 链完整性）
  → 用户在编辑工作区编辑草稿
  → 预览
  → 发布（冻结 DSL 快照到 published_tutorials 表）
  → 通过 /[slug] 公开访问
```

---

## 4. 技术栈

| 技术 | 版本 | 用途 | 注意事项 |
|------|------|------|----------|
| Next.js | 16 | App Router、Server Components、Route Handlers | 使用 `--webpack` 标志 |
| React | 19 | UI | - |
| PostgreSQL | - | 主数据库 | 通过 Drizzle ORM 访问 |
| Drizzle ORM | - | 数据库访问层 | schema 用 TS 定义，不用 Prisma |
| Vercel AI SDK | **v6** | `generateText` + `Output.object` + Zod 结构化生成 | `maxTokens` 已更名为 `maxOutputTokens` |
| DeepSeek | - | 默认 LLM provider | `@ai-sdk/deepseek`，maxOutputTokens 上限 8192 |
| OpenAI | - | 可选 LLM provider | `@ai-sdk/openai` |
| MiniMax | - | 默认生成模型（MiniMax-M2.7） | `@ai-sdk/openai-compatible` |
| Zhipu | - | 可选 LLM provider | `@ai-sdk/openai-compatible` |
| Zod | **v4** | schema 定义 | AI 输出 + API 校验 + DB 写入校验 |
| CodeHike | 1.1 | scrollytelling 代码高亮 + focus/marks/change handler | - |
| CodeMirror 6 | - | 草稿编辑器中的代码编辑 | - |
| Tailwind CSS | **v4** | 样式 | 需要 `@tailwindcss/postcss` + `@import "tailwindcss"` + 显式 `@source` |
| Radix UI | - | 无障碍 UI primitive | Dialog, Select, Tabs, Sheet 等 |
| NextAuth | **v5 beta** | 认证（GitHub OAuth + Linux.do OAuth + JWT） | Edge Runtime 中间件不能用 DB adapter |
| node:test | - | 测试框架 | `tsx --test`，最小回归集 |

---

## 5. 分层架构

```
┌────────────────────────────────────────────────────┐
│  app/                     路由层                    │
│  Next.js 页面 + Route Handlers                     │
│  只做编排和协议转换，不直接查库                      │
├────────────────────────────────────────────────────┤
│  components/              组件层                    │
│  客户端交互组件（编辑器、表单、渲染器、AppShell）     │
│  fetch 调用统一进 feature client，不散落在视图组件    │
├────────────────────────────────────────────────────┤
│  lib/services/            服务层                    │
│  业务逻辑（创建、生成、发布、质量计算、搜索、导出）    │
│  被 API 路由和页面调用                               │
├────────────────────────────────────────────────────┤
│  lib/repositories/        仓储层                    │
│  Drizzle ORM 数据访问，返回类型化 domain 对象         │
├────────────────────────────────────────────────────┤
│  lib/db/                  数据库层                  │
│  Drizzle schema 定义 + 连接池                       │
├────────────────────────────────────────────────────┤
│  lib/tutorial/            渲染基础层（服务端）       │
│  patch 应用、payload 构建、registry、normalize       │
├────────────────────────────────────────────────────┤
│  lib/ai/                  AI 层                    │
│  prompt 模板 + 多阶段生成编排 + provider 注册        │
├────────────────────────────────────────────────────┤
│  lib/schemas/             Schema 层                │
│  Zod schema（AI 输出约束 + API 校验）               │
├────────────────────────────────────────────────────┤
│  lib/types/               类型层                   │
│  DTO、客户端响应类型                                  │
├────────────────────────────────────────────────────┤
│  lib/utils/               工具层                   │
│  校验、序列化、hash、slug、请求版本化                │
├────────────────────────────────────────────────────┤
│  lib/monitoring/          监控层                   │
│  事件类型定义、埋点 helpers、计时计数                │
├────────────────────────────────────────────────────┤
│  lib/errors/              错误层                   │
│  错误类型定义 + 分类                                 │
├────────────────────────────────────────────────────┤
│  lib/api/                 路由工具层                │
│  Route Handler 共用的错误处理                       │
└────────────────────────────────────────────────────┘
```

**导入规则（分层边界）：**
- `app/*` → `components/*`、`lib/services/*`、`lib/utils/client-data.ts`
- `app/api/*` → 可额外用 `lib/api/route-errors.ts`
- `app/*` **禁止**直接调用 `lib/repositories/*`、`lib/db/*`、`lib/tutorial/*`
- `lib/services/*` → 可调用 repositories、tutorial、ai、schemas、utils、types
- 服务端数据发给客户端前，必须通过 `lib/utils/client-data.ts` 序列化

---

## 6. 数据库设计

### 6.1 核心表

**`drafts` — 草稿（最核心的表）**
```
id: uuid PK
userId: text FK→users (nullable，向后兼容)
sourceItems: jsonb          // SourceItem[] 输入的源码文件
teachingBrief: jsonb        // 教学意图
tutorialDraft: jsonb?       // AI 生成的教程 DSL（nullable）
status: enum(draft|published)
syncState: enum(empty|fresh|stale)
inputHash: varchar(64)      // sourceItems+teachingBrief 的 SHA-256
tutorialDraftInputHash: varchar(64)?  // 成功生成时的 inputHash 快照
generationState: enum(idle|running|succeeded|failed)
generationModel: varchar(64)?
activeGenerationJobId: uuid?  // 指向当前活跃的 generation job
generationOutline: jsonb?     // 大纲数据
generationQuality: jsonb?     // 质量指标
validationValid: boolean
validationErrors: jsonb
publishedSlug: varchar(256)?  // unique
publishedTutorialId: uuid?
timestamps: createdAt, updatedAt
```

**`draft_generation_jobs` — 生成任务（可靠性真相源）**
```
id: uuid PK
draftId: uuid FK→drafts (cascade)
userId: text FK→users (set null)
status: enum(queued|running|succeeded|failed|cancelled|abandoned)
phase: enum(outline|step_fill|validate|persist)?
startedAt, finishedAt, heartbeatAt, leaseUntil: timestamp?
currentStepIndex, totalSteps: integer?
retryCount: integer
modelId: varchar(64)?
errorCode: enum?
errorMessage: text?
failureDetail, outlineSnapshot: jsonb?
stepTitlesSnapshot: string[]?
```

约束：
- 同一 draft 最多一个 queued/running job（部分唯一索引）
- `drafts.activeGenerationJobId` 只能指向同 draft 的 job（复合外键）
- `createdAt/updatedAt` 用 `clock_timestamp()` 避免同事务连续插入落到同一时间戳

**`published_tutorials` — 已发布教程**
```
id: uuid PK
draftRecordId: uuid FK→drafts
slug: varchar(256) unique
tutorialDraftSnapshot: jsonb    // 冻结快照
publishedAt: timestamp
```

**`draft_snapshots` — 版本快照**
```
id: uuid PK
draftId: uuid FK→drafts (cascade)
label: varchar(256)?
tutorialDraftSnapshot: jsonb
stepCount: integer
createdAt: timestamp
```

**`users` — 用户**
```
id: text PK (auto UUID)
name, email(unique), image, emailVerified
username: varchar(64) unique nullable  // 首次设置后不可改
bio: text
```

**`accounts` — OAuth 账号（NextAuth）**
```
userId: text FK→users (cascade)
type, provider, providerAccountId: text
refresh_token, access_token, expires_at, token_type, scope, id_token, session_state
PK: compound(provider, providerAccountId)
```

**其他表：** `sessions`、`verification_tokens`（NextAuth 标准）、`tutorial_tags`、`tutorial_tag_relations`（标签系统）、`events`（埋点）

### 6.2 同步状态机制

- `inputHash` = SHA-256(sourceItems + teachingBrief)
- `tutorialDraftInputHash` = 成功生成时捕获的 inputHash
- 不匹配 → `syncState = stale` → 不能发布 → 需重新生成

---

## 7. 目录结构

```
app/
  layout.jsx                    # 根布局
  page.jsx                      # 首页
  [slug]/page.jsx               # 教程阅读（静态直出）
  [slug]/request/page.jsx       # 教程阅读（远程加载）
  auth/signin/page.tsx          # 登录页
  new/page.tsx                  # 创建草稿
  drafts/page.tsx               # 草稿列表
  drafts/[id]/page.tsx          # 编辑工作区
  drafts/[id]/preview/          # 预览
  explore/page.tsx              # 探索
  tags/page.tsx                 # 标签
  u/[username]/page.tsx         # 用户档案
  api/                          # Route Handlers（见下方 API 设计）

lib/
  ai/                           # AI 层（prompt + 多阶段生成 + provider 注册）
  api/                          # Route Handler 共用错误处理
  constants/                    # 常量（如 GitHub 导入限制）
  db/                           # Drizzle schema + 连接池
  errors/                       # 错误类型 + 分类
  monitoring/                   # 埋点 + 计时
  repositories/                 # Drizzle ORM 数据访问
  review/                       # 生成质量 review rubric
  schemas/                      # Zod schema
  services/                     # 业务逻辑（被 API 路由调用）
  tutorial/                     # 渲染基础层（assembler、normalize、payload、registry）
  types/                        # DTO 和响应类型
  utils/                        # 通用工具

components/
  app-shell.tsx                 # 应用外壳（侧边栏 + 移动端抽屉）
  code-mirror-editor.tsx        # CodeMirror 6 封装
  markdown-editor.tsx           # Markdown 编辑器
  create-draft-form.tsx         # 创建草稿表单
  draft-workspace.tsx           # 编辑工作区主容器
  step-editor.tsx               # 单步编辑器
  step-list.tsx                 # 步骤列表
  generation-progress.tsx       # 生成进度
  auth/                         # 认证组件
  create-draft/                 # GitHub 导入相关
  drafts/                       # 草稿 feature（client、hooks、子视图）
  explore/                      # 探索页交互
  profile/                      # 用户档案
  step-editor/                  # 步骤编辑器子组件
  tutorial/                     # 教程渲染相关
  ui/                           # shadcn/ui primitive
```

---

## 8. API 设计

### 8.1 统一错误格式

```json
{ "message": "描述", "code": "ERROR_CODE", "details": {} }
```

### 8.2 核心 API

**草稿 CRUD：**
- `POST /api/drafts` — 创建草稿（201 + `{ id }`）
- `GET /api/drafts` — 草稿列表（摘要，不返回大 JSONB）
- `GET /api/drafts/[id]` — 草稿详情
- `PATCH /api/drafts/[id]` — 更新 teachingBrief/meta/intro
- `DELETE /api/drafts/[id]` — 删除（生成中/已发布不可删）

**生成：**
- `POST /api/drafts/[id]/generate` — SSE 流式生成（30-60 秒，maxDuration=300）
- `GET /api/drafts/[id]/generation-status` — 轮询生成状态
- `POST /api/drafts/[id]/cancel` — 取消生成
- `POST /api/drafts/[id]/incremental-regenerate` — 增量重新生成

**步骤操作：**
- `GET /api/drafts/[id]/steps` — 步骤列表
- `POST /api/drafts/[id]/steps` — 追加步骤
- `PATCH /api/drafts/[id]/steps/[stepId]` — 编辑步骤（文案 + 结构）
- `DELETE /api/drafts/[id]/steps/[stepId]` — 删除步骤
- `PUT /api/drafts/[id]/steps` — 重排（只接受 stepIds 数组）
- `POST /api/drafts/[id]/steps/[stepId]/regenerate` — 重生单步

**预览/发布：**
- `GET /api/drafts/[id]/payload` — 构建预览 payload
- `POST /api/drafts/[id]/publish` — 发布（检查 syncState=fresh + validation valid）
- `POST /api/drafts/[id]/unpublish` — 取消发布

**快照：**
- `GET/POST /api/drafts/[id]/snapshots` — 列表/创建
- `POST /api/drafts/[id]/snapshots/[snapshotId]` — 恢复（自动备份当前）
- `DELETE /api/drafts/[id]/snapshots/[snapshotId]` — 删除

**教程消费：**
- `GET /api/tutorials/[slug]` — 已发布教程 payload
- `GET /api/tutorials/[slug]/embed` — 嵌入式 HTML（CORS header，无 AppShell）
- `GET /api/tutorials/[slug]/export-markdown` — 导出 Markdown
- `GET /api/tutorials/[slug]/export-html` — 导出 HTML

**GitHub 导入：**
- `GET /api/github/repo-tree?url=` — 仓库文件树（公开免登录）
- `GET /api/github/repo-tree/subdirectory?url=&sha=&path=` — 子目录懒加载
- `POST /api/github/file-content` — 批量获取文件内容（≤30 文件/批，partial success）

**其他：**
- `GET /api/search?q=` — 全文搜索（PostgreSQL ts_vector）
- `GET/PUT /api/tutorials/[slug]/tags` — 标签管理
- `GET/PATCH /api/user/profile` — 用户档案
- `POST /api/user/username` — 设置用户名
- `POST /api/events` — 埋点（fire-and-forget）
- `POST /api/models/probe` — 模型能力探测
- `GET /api/og/[slug]` — OG 图片生成

---

## 9. 多阶段 AI 生成（核心链路）

### 9.1 三阶段流程

```
阶段一：Outline
  输入：sourceItems + teachingBrief
  输出：步骤大纲（teachingGoal、conceptIntroduced、estimatedLocChange）
  约束：每步变更 3-8 LOC，超过则拆分
  Prompt：使用"认知弧线"框架（开篇→发展→转折→结论）

阶段二：Step Fill（逐步填充）
  输入：大纲 + 当前累积代码状态
  输出：完整 step（paragraphs + patches + focus + marks）
  默认：无工具 scoped prompt（注入当前目标文件代码 + 原始源码参考）
  重试：单步最多 3 次，3 次失败后中止生成
  Prompt：paragraphs 遵循"问题→方案→结论"三段结构

阶段三：Validate
  对组装结果执行完整 validateTutorialDraft
  校验：patch 链完整性 + assembler smoke test
```

### 9.2 SSE 协议

生成通过 SSE 流向客户端推送进度：

```
事件类型：
  phase     → { phase: "outline"|"step-fill"|"validate" }
  outline   → 大纲数据
  step      → 单步数据（含 stepIndex）
  validation → 验证结果
  error     → 错误信息
  done      → 成功完成
```

### 9.3 AI Provider 架构

```
provider-registry.ts  — 注册所有 provider（DeepSeek/OpenAI/MiniMax/Zhipu）
  ↓ 根据 modelId 前缀分发
prompt-adapters.ts    — 根据 provider 能力调整输出格式
  ↓
generateText() + Output.object({ schema })  — Vercel AI SDK 结构化生成
```

---

## 10. 客户端架构

### 10.1 三层分离

```
Feature Client（API 调用封装）
  如：components/drafts/draft-client.ts
  职责：URL 定义、fetch 调用、响应解析、错误消息归一化

Hook / Controller（状态管理）
  如：components/drafts/use-draft-workspace-controller.ts
  职责：状态机、重试、竞态保护、SSE 解析、轮询

View（视图组件）
  如：components/drafts/draft-workspace-content.tsx
  职责：接收状态和回调，渲染 UI，不直接 fetch
```

### 10.2 SSE 解析

`components/tutorial/use-generation-progress.ts` 解析 v2 SSE 协议，驱动前端 `GenerationProgress` 组件。

### 10.3 请求版本化

`lib/utils/request-version.js` 防止旧响应覆盖新响应（request version ref）。

---

## 11. 认证

### 11.1 双文件模式

- `auth.ts` — 完整 NextAuth 实例（带 Drizzle adapter，Node.js runtime）
- `middleware.ts` — 轻量级 NextAuth 实例（无 DB adapter，Edge Runtime 兼容）

### 11.2 Provider

- GitHub OAuth — 主要
- Linux.do OAuth — 辅助

### 11.3 Session

JWT 策略（`session: { strategy: 'jwt' }`）。`callbacks.jwt` 负责在 OAuth 登录时显式同步 access_token 到 accounts 表。

### 11.4 路由保护

- **公开**：`/`、`/[slug]`、`/explore`、`/tags`、`/u/`、`/api/tutorials/*`、`/api/auth/*`
- **受保护**：`/drafts/*`、`/new`、`/api/drafts/*`、`/api/user/*`、`/api/github/*`
- API 路由返回 401 JSON；页面路由 redirect 到登录页

---

## 12. 复刻步骤

### Phase 1：渲染基础层

1. 定义 TutorialData DSL 类型（meta + intro + baseCode + steps）
2. 实现 `assembler.js`：patch 应用 + 行号计算 + CodeHike 高亮 + focus/marks 注入
3. 实现 `payload.js`：包装为 TutorialPayload
4. 实现 `normalize.js`：单/多文件 baseCode 归一化
5. 创建示例教程 DSL（`content/sample-tutorial.js`）+ 静态 registry
6. 实现 `TutorialScrollyDemo` 渲染器：左侧代码面板 + 右侧滚动文章 + IntersectionObserver 联动
7. 实现 StepRail 侧边导航 + MobileCodeFrame 移动端布局
8. 实现 CodeHike handler：changeIndicator（+/~）、tokenTransitions、animateLineDiff
9. 创建两条消费路由：`/[slug]`（静态直出）+ `/[slug]/request`（远程加载）

### Phase 2：数据库 + 创建

1. 设置 PostgreSQL + Drizzle ORM
2. 定义 `drafts` 表 schema
3. 实现 `lib/db/schema.ts` + `lib/db/index.ts`（连接池）
4. 实现 `draft-repository.ts`（CRUD）
5. 实现创建草稿页面（多文件源码输入 + Teaching Brief 表单）
6. 实现 `POST /api/drafts` + `GET /api/drafts`

### Phase 3：AI 生成

1. 实现 `provider-registry.ts`（多 provider 注册）
2. 实现 `prompt-adapters.ts`（provider 能力适配）
3. 实现 `outline-prompt.ts`（阶段一 prompt）
4. 实现 `step-fill-prompt.ts`（阶段二 prompt）
5. 实现 `multi-phase-generator.ts`（SSE 流编排：outline → step-fill → validate）
6. 实现 `POST /api/drafts/[id]/generate`
7. 实现前端 SSE 解析 + GenerationProgress 组件
8. 实现 `generate-tutorial-draft.ts`（v1/v2 入口分发 + 异步持久化）

### Phase 4：编辑工作区

1. 实现 AppShell 布局（桌面侧边栏 + 移动端抽屉）
2. 实现草稿列表页（卡片布局 + 状态 badge + 删除确认）
3. 实现步骤编辑器（文案 + patches/focus/marks 全量编辑）
4. 实现 CodeMirror 6 代码编辑器封装
5. 实现 Markdown 编辑器
6. 实现步骤列表（删除/重排）
7. 实现步骤 PATCH/DELETE/REORDER API
8. 实现代码预览 + 结构变更检测
9. 实现单步重新生成

### Phase 5：预览 + 发布

1. 实现预览页面（本地 + 远程）
2. 实现发布流程（syncState + validation 前置检查 + 事务）
3. 实现 `published_tutorials` 表 + repository
4. 实现 `publish-draft.ts`（创建 PublishedTutorial + 更新 DraftRecord）
5. 实现 `unpublish-draft.ts`（反向操作）
6. 更新 `/[slug]` 页面集成 DB 查询

### Phase 6：认证 + 产品化

1. 设置 NextAuth v5（GitHub OAuth + JWT sessions + Drizzle adapter）
2. 创建 users/accounts/sessions/verification_tokens 表
3. 实现中间件路由保护
4. 实现版本快照系统
5. 实现 SEO 工具（OG 元数据 + JSON-LD + 阅读时间）
6. 实现 OG 图片生成
7. 实现分享对话框 + embed 端点
8. 实现取消生成

### Phase 7：发现 + 标签 + 用户档案

1. 实现全文搜索（PostgreSQL ts_vector）
2. 实现 tutorial_tags + tutorial_tag_relations 表
3. 实现 AI 标签生成（fire-and-forget）
4. 实现探索页面（搜索 + 标签筛选 + 排序 + 分页）
5. 实现用户档案（username/bio + 公开 profile 页面）
6. 实现标签页面

### Phase 8：导出 + 多 Provider + 编辑器增强

1. 实现 Markdown/HTML 导出
2. 实现 AI 多 provider 支持（provider registry）
3. 实现 patch 自动修复
4. 拆分步骤编辑器子组件（diff 视图、代码选择菜单、中间预览）

### Phase 9：GitHub 导入

1. 实现 GitHub Trees/Contents API 代理（公开免登录）
2. 实现大仓库子目录懒加载
3. 实现文件树多选 UI
4. 实现导入限制（≤200 文件、≤15000 行）
5. 实现交互式行选择（Focus/Mark 模式）
6. 实现创建表单 Tab 切换（手动粘贴 / GitHub 导入）

---

## 13. 关键约束与陷阱

### 13.1 架构约束

- **服务端计算**：所有 patch 应用、高亮、focus/marks 注入都在服务端完成
- **客户端只消费**：不做 patch 计算、不做高亮、不做行号推导
- **渲染器不可重写**：TutorialScrollyDemo 是固定基础设施
- **不用 Server Actions**：只用 Route Handlers
- **不直接查库**：app/* 禁止直接调用 repositories/db/tutorial

### 13.2 版本陷阱

- AI SDK v6：`maxTokens` → `maxOutputTokens`
- DeepSeek：`maxOutputTokens` 上限 8192
- Tailwind v4：需要 `@tailwindcss/postcss` + `@import "tailwindcss"` + `@source`
- NextAuth v5：`AUTH_SECRET`（非 `NEXTAUTH_SECRET`）；Edge Runtime 中间件不能有 DB adapter
- Zod v4：API 与 v3 有差异

### 13.3 实现陷阱

- AI SDK `partialOutputStream` 和 `toTextStreamResponse()` 共享流，消耗一个耗尽另一个 → 手动构建 SSE
- 步骤编辑级联验证：改一个 patch 可能导致后续所有 patch 失效 → 先校验到当前步骤，再全量校验
- 重排 API 只接受 stepIds 数组，不信任客户端提交的完整 step 对象
- 草稿列表用 `listDraftSummaries()` 只提取摘要，不返回大 JSONB
- 生成失败占位文本（如"自动生成失败"）必须被 validation 拦截，不能进入最终 DSL
- Drizzle `sql` 模板不支持 JSONB `->`/`->>` 与列引用插值混用 → 用原始 SQL 列名
- 探索/搜索查询必须用 `leftJoin(users)`（drafts.userId 可能为 NULL）
- 全文搜索用 PostgreSQL `simple` 配置（不分词，适合中英混合）
- 埋点和 AI 标签生成都是 fire-and-forget，不得阻塞主流程
- `createdAt/updatedAt` 用 `clock_timestamp()` 避免 Drizzle 默认 `now()` 在同事务内冻结

### 13.4 混合 JS/TS 策略

- 已有 `.js`/`.jsx` 文件（渲染链路）保持不变
- 新增功能默认用 `.ts`/`.tsx`
- `tsconfig.json` 设置 `allowJs: true`
- **不要强行统一为全 TS**

---

## 14. 环境变量

```
DATABASE_URL=postgresql://...
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
OPENAI_API_KEY=...              # 可选
MINIMAX_API_KEY=...             # 默认模型用
MINIMAX_BASE_URL=https://api.minimax.io/v1
DEFAULT_AI_MODEL=...            # 可选，覆盖 DEEPSEEK_MODEL
AUTH_SECRET=...                 # NextAuth v5
AUTH_URL=https://example.com
GITHUB_ID=...                   # GitHub OAuth
GITHUB_SECRET=...
NEXT_PUBLIC_BASE_URL=https://...  # SEO 用
```

---

## 15. 测试策略

- 框架：`node:test`（`tsx --test`），不引入额外测试框架
- 覆盖重点：**分层边界**（导入规则）、**patch 链**（多步正确性）、**纯函数**（assembler 核心算法）
- `npm run build` 验证路由图和类型边界
- 现有 28 个测试文件覆盖关键路径

---

## 16. 章节系统（大仓库分章）

v3.8 引入的 chapter 系统用于处理大型仓库教程：

- 每个草稿可包含多个 chapter，每个 chapter 有独立的步骤列表
- API：`/api/drafts/[id]/chapters` 用于 CRUD
- 编辑器侧边栏按 chapter 分组显示步骤
- 渲染器在 chapter 之间插入分隔线

---

*本文档基于 VibeDocs v3.9 实现状态编写。用于系统理解和完整复刻。详细数据结构见 `docs/tutorial-data-format.md`，详细组件/API 清单见 `docs/vibedocs-technical-handbook.md`。*
