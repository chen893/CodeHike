# VibeDocs — 技术手册

> VibeDocs 项目的权威技术文档，涵盖产品定义、架构分层、数据模型、API 契约、AI 生成链路和 UI 规格。所有关键设计决策集中在此，代码修改前必读。

---

## 1. 产品定位

**VibeDocs** 是一个 AI 驱动的 scrollytelling 源码教学教程生成器。

**核心用户流程：**
1. 用户输入源码 + 教学意图（Teaching Brief）
2. 系统通过多阶段 AI 生成结构化教程草稿（Tutorial Draft）
3. 用户在编辑工作区中编辑草稿、预览效果
4. 满意后发布为独立可访问的教程页面

**关键原则：**
- 系统的核心资产是**结构化教程数据**（JSON DSL），不是 HTML 页面
- 渲染层（scrollytelling）是固定的基础设施，不可重写
- 所有 patch 应用、代码高亮、focus/marks 注入都在**服务端**完成
- 客户端只消费渲染好的 payload，不做任何 patch 计算或高亮

---

## 2. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 16 | App Router、Server Components、Route Handlers |
| React | 19 | UI |
| PostgreSQL + Drizzle ORM | - | 持久化 |
| Vercel AI SDK | v6 | `generateText` + `Output.object` + Zod 结构化生成 |
| DeepSeek | via `@ai-sdk/openai-compatible` | LLM provider（`/chat/completions` 端点） |
| Zod | v4 | schema 定义（AI 输出约束 + API 校验 + DB 写入校验） |
| CodeHike | 1.1 | scrollytelling 代码高亮 + focus/marks/change handler |
| CodeMirror 6 | - | 草稿编辑器中的代码编辑 |
| Tailwind CSS | v4 | 样式 |
| Radix UI | - | 无障碍 UI primitive（Dialog、Select、Tabs 等） |
| NextAuth | v5 beta | Authentication (GitHub OAuth + JWT sessions + Drizzle adapter) |

**重要版本陷阱（已踩过）：**
- AI SDK v6 的 `maxTokens` 已重命名为 `maxOutputTokens`
- DeepSeek `maxOutputTokens` 上限为 **8192**（超出会被截断）
- 不要用 `@ai-sdk/openai` 的默认 provider（默认走 `/responses` 端点），DeepSeek 必须用 `@ai-sdk/openai-compatible`
- Tailwind v4 需要 `@tailwindcss/postcss` 和 `@import "tailwindcss"`，且需要显式 `@source` 指令
- NextAuth v5 使用 `AUTH_SECRET` 环境变量（不是 `NEXTAUTH_SECRET`），不过 v5 同时接受两者
- NextAuth v5 middleware 必须用轻量级实例（无 DB adapter），因为 Edge Runtime 不支持 Node.js crypto

---

## 3. 教程数据格式（核心 DSL）

这是整个系统的数据核心。AI 生成它、编辑器修改它、渲染器消费它。

### 3.1 TutorialData 顶层结构

```
TutorialData {
  meta: {
    title: string          // 教程标题
    lang?: string          // 编程语言（AI 可能遗漏，需从 baseCode 推导）
    fileName?: string      // 主文件名
    description: string          // 教程描述（必填，min 1）
  }
  intro: { paragraphs: string[] }  // 引言段落（包装在 paragraphs 数组外）
  baseCode: string | Record<string, string>   // 单文件用 string，多文件用 Record
  steps: TutorialStep[]
}
```

### 3.2 TutorialStep

```
TutorialStep {
  id: string               // 唯一标识
  eyebrow?: string         // 步骤标签（如 "Step 1"）
  title: string            // 步骤标题
  lead?: string            // 引导语
  paragraphs: string[]     // 教学文字段落
  patches?: ContentPatch[] // 代码变更（无变更则省略）
  focus?: ContentRange     // 高亮区域
  marks?: ContentMark[]    // 行标记
  teachingGoal?: string    // 教学目标（v3.1 大纲阶段生成）
  conceptIntroduced?: string // 引入的概念（v3.1 大纲阶段生成）
}
```

### 3.3 ContentPatch（内容锚定补丁）

这是 DSL 的核心创新——**不用行号，用内容锚定的 find/replace**：

```
ContentPatch {
  find: string     // 必须在代码中唯一匹配
  replace: string  // 替换内容（空字符串 = 删除）
  file?: string    // 多文件模式下的目标文件
}
```

**设计优势：**
- AI 不需要计算行号，只需"找到旧代码 → 写新代码"
- 相比完整代码快照节省约 **58-60%** token
- 每个 patch 在运行时可验证（不匹配立即报错）

### 3.4 ContentRange / ContentMark

```
ContentRange { find: string, file?: string }   // 高亮一段代码
ContentMark  { find: string, color: string, file?: string }  // 标记一行
```

同样用内容锚定，不用行号。

### 3.5 多文件支持

- `baseCode` 可以是 `Record<string, string>`（文件名 → 文件内容）
- `normalizeBaseCode()` 将单文件 string 包装为 Record 格式
- 主文件由 `meta.fileName` 或 Record 第一个 key 决定
- patches/focus/marks 的 `file` 字段省略时默认指向主文件
- 文件名匹配支持大小写不敏感回退

---

## 4. 核心渲染链路（不可重写）

```
TutorialDraft (DSL JSON)
  → lib/tutorial/assembler.js    # patch 应用 + diff 计算 + CodeHike 高亮 + focus/marks/change 注入 → TutorialStep[]
  → lib/tutorial/payload.js      # 包装为 TutorialPayload
  → components/tutorial/tutorial-scrolly-demo.jsx  # 客户端 scrollytelling 渲染
```

### 4.1 Assembler 算法

1. `currentCode = baseCode`
2. 对每个 step：
   - 应用 patches（find/replace，按数组顺序）
   - 计算 focus/mark 的行号（通过统计换行符）
   - 注入行变更注解（新增 `+`，修改 `~`）
   - CodeHike `highlight()` 语法高亮
3. 输出带 `highlighted` 代码的 steps 数组

**patch 应用规则：**
- `find` 必须在代码中**精确唯一匹配**（indexOf）
- 多次匹配 → 报错（ambiguous）
- 不匹配 → 报错
- 同一步骤内的多个 patches 按顺序应用，后续 patch 必须考虑前面 patch 的结果

### 4.2 渲染器交互规格

- **布局：** 左侧固定代码舞台 + 右侧独立滚动的文章
- **代码区：** 同一个面板持续变化，不切换整个组件
- **代码变更：** 由一个 `Pre` 实例承载，保留 CodeHike token 过渡动画
- **导航：** StepRail 侧边步骤导航（点击跳转 + hover 显示变更摘要）
- **变更指示器：** 新增行（绿色左边框 + 浅绿背景 + `+` 标记）、修改行（黄色左边框 + 浅黄背景 + `~` 标记）
- **行过渡动画：** 删除行淡出+上滑、新增行淡入+下滑（每行 45ms 延迟）
- **移动端：** MobileCodeFrame 文字-代码交替布局，每步内嵌代码块
- **浏览器不做：** 不做 patch 计算、不做高亮、不做行号推导

### 4.3 两条消费路径

1. **静态直出** `app/[slug]/page.jsx`：服务端查 DB published → 回退 registry → `buildTutorialSteps()` → 渲染
2. **远程加载** `app/[slug]/request/page.jsx`：客户端 fetch `/api/tutorials/[slug]` → payload → 渲染

两者共享同一个 `TutorialScrollyDemo` 渲染器。

---

## 5. 多阶段 AI 生成链路（v3.1 核心）

### 5.1 三阶段流程

```
阶段一：Outline（教学大纲）
  → 输入：sourceItems + teachingBrief
  → 输出：步骤大纲（每步含 teachingGoal、conceptIntroduced、estimatedLocChange）
  → 约束：每步变更 3-8 LOC，超过则拆分

阶段二：Step Fill（单步内容填充）
  → 输入：大纲 + 当前累积代码状态
  → 输出：完整的 step（paragraphs + patches + focus + marks）
  → 重试：单步失败最多重试 3 次（MAX_STEP_RETRIES = 3）
  → 降级：3 次失败后生成降级步骤
  → LOC 容差：+10 行

阶段三：Validate（全链路验证）
  → 对组装结果执行完整 validateTutorialDraft
```

### 5.2 SSE 协议

生成通过 SSE 流向客户端推送进度：

```
事件类型：
- phase     → { phase: "outline"|"step-fill"|"validate" } 阶段开始
- outline   → 大纲数据
- step      → 单步数据（含 stepIndex）
- validation → 验证结果
- error     → 错误信息（大纲生成失败、步骤填充失败等）
- done      → 成功完成
```

### 5.3 Teaching Brief（教学意图）

```
TeachingBrief {
  topic: string             // 教学主题（必填）
  audience_level: "beginner" | "intermediate" | "advanced"  // 受众水平（必填）
  core_question: string     // 核心问题（必填）
  ignore_scope: string      // 忽略范围（必填）
  output_language: string   // 输出语言（必填）
  desired_depth?: "short" | "medium" | "deep"
  target_step_count?: number
  preferred_style?: string
}
```

### 5.4 Prompt 设计要点

- **大纲阶段：** 使用"认知弧线"框架（开篇 → 发展 → 转折 → 结论），禁止模块列表式、平铺枚举式
- **填充阶段：** paragraphs 遵循"问题 → 方案 → 结论"三段结构
- **patch 规则：** find 必须是原文逐字复制（不含占位符），变更控制在 15 LOC 以内

### 5.5 生成质量评估

```
GenerationQuality {
  stepCount, avgPatchesPerStep, avgLocChangePerStep, avgParagraphsPerStep,
  proseToCodeRatio, patchValidationPassRate,
  outlineToFillConsistency,  // 关键词匹配：exact / substring / >=30% overlap
  retryCount, totalGenerationTimeMs
}
```

存储在 `DraftRecord.generationQuality`（JSONB），不阻塞发布，仅作监控。

---

## 6. 数据模型

### 6.1 DraftRecord（草稿记录）

```
DraftRecord {
  // 基本信息
  id: string (UUID)
  userId: string?        // 所有者（FK → users.id，nullable 向后兼容）
  sourceItems: SourceItem[]         // 输入的源码文件
  teachingBrief: TeachingBrief      // 教学意图

  // 教程内容
  tutorialDraft: TutorialDraft | null  // AI 生成的教程（nullable），内含 meta: { title, description }

  // 状态管理
  status: "draft" | "published"

  // 生成状态（扁平字段，非嵌套对象）
  generationState: "idle" | "running" | "succeeded" | "failed"   (pgEnum)
  generationErrorMessage: string?
  generationModel: string?
  generationLastAt: Date?

  // v3.1 新增
  generationOutline: jsonb?
  generationQuality: jsonb?

  // 同步追踪
  syncState: "empty" | "fresh" | "stale"
  inputHash: string               // sourceItems + teachingBrief 的 SHA-256
  tutorialDraftInputHash: string? // 成功生成时的 inputHash 快照

  // 发布信息
  publishedSlug: string?
  publishedTutorialId: string?
  publishedAt: Date?

  // 校验
  validationValid: boolean
  validationErrors: string[]
  validationCheckedAt: Date?

  timestamps: createdAt, updatedAt
}
```

### 6.2 SourceItem

```
SourceItem {
  id: string
  kind: "snippet"
  label: string       // 文件名或描述
  content: string     // 源码内容
  language?: string
}
```

### 6.3 PublishedTutorial（已发布教程）

```
PublishedTutorial {
  id: string (UUID)
  draftRecordId: string (FK → drafts)
  slug: string (unique)
  tutorialDraftSnapshot: TutorialDraft   // 冻结快照
  publishedAt: Date
  createdAt: Date
}
```

### 6.4 DraftSnapshot（版本快照）

```
DraftSnapshot {
  id: string (UUID)
  draftId: string (FK → drafts, ON DELETE CASCADE)
  label: string?         // 快照标签（如 "恢复前自动备份"）
  tutorialDraftSnapshot: TutorialDraft  // 冻结的教程快照
  stepCount: number      // 快照时的步骤数
  createdAt: Date
}
```

### 6.5 同步状态规则

- `inputHash` = SHA-256(sourceItems + teachingBrief)
- `tutorialDraftInputHash` = 成功生成时捕获的 inputHash
- 不匹配 → `syncState = stale` → 不能发布
- 需要重新生成才能重新变为 `fresh`

---

## 7. API 设计

### 7.1 统一错误格式

```json
{ "message": "描述", "code": "ERROR_CODE", "details": {} }
```

错误码：`VALIDATION_ERROR`(400)、`NOT_FOUND`(404)、`CONFLICT`(409)、`PRECONDITION_FAILED`(412)、`GENERATION_FAILED`(500)

### 7.2 API 端点一览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/drafts` | 创建草稿（201 + `{ id }`） |
| GET | `/api/drafts` | 草稿列表（仅摘要：标题、状态、步骤数、更新时间） |
| GET | `/api/drafts/[id]` | 读取草稿详情 |
| PATCH | `/api/drafts/[id]` | 更新 teachingBrief、meta、intro |
| DELETE | `/api/drafts/[id]` | 删除草稿（生成中不可删、已发布不可删） |
| POST | `/api/drafts/[id]/generate` | SSE 流式生成（30-60秒，`maxDuration = 300`） |
| GET | `/api/drafts/[id]/payload` | 构建预览 payload |
| POST | `/api/drafts/[id]/publish` | 发布（检查 syncState=fresh + validation valid） |
| PATCH | `/api/drafts/[id]/steps/[stepId]` | 编辑步骤（文案 + patches/focus/marks，结构变更时触发级联校验） |
| DELETE | `/api/drafts/[id]/steps/[stepId]` | 删除步骤 |
| POST | `/api/drafts/[id]/steps` | 追加步骤 |
| PUT | `/api/drafts/[id]/steps` | 步骤重排（只接受 stepIds 顺序数组） |
| POST | `/api/drafts/[id]/steps/[stepId]/regenerate` | 重新生成单步 |
| GET | `/api/tutorials/[slug]` | 已发布教程 payload API（`route.js`） |
| POST | `/api/drafts/[id]/unpublish` | 取消发布（删除 PublishedTutorial + 重置 draft 状态） |
| GET | `/api/drafts/[id]/snapshots` | 获取草稿快照列表 |
| POST | `/api/drafts/[id]/snapshots` | 创建快照（body: `{ label? }`) |
| POST | `/api/drafts/[id]/snapshots/[snapshotId]` | 恢复快照（自动备份当前状态） |
| DELETE | `/api/drafts/[id]/snapshots/[snapshotId]` | 删除快照 |
| POST | `/api/drafts/[id]/incremental-regenerate` | 增量重新生成（比对大纲差异，只重生成受影响步骤） |
| GET | `/api/tutorials/[slug]/embed` | 嵌入式 HTML 页面（CORS header，无 AppShell） |
| GET | `/api/og/[slug]` | OG 图片生成（1200x630，nodejs runtime） |
| POST | `/api/models/probe` | 模型能力探测（可达性、延迟、response_format 支持） |
| GET/POST | `/api/auth/[...nextauth]` | NextAuth 路由处理器（GitHub OAuth） |
| GET | `/api/search?q=` | 全文搜索教程（PostgreSQL ts_vector，limit 50） |
| GET | `/api/tags` | 标签列表（含教程计数） |
| GET | `/api/tutorials/[slug]/tags` | 获取教程标签 |
| PUT | `/api/tutorials/[slug]/tags` | 设置教程标签（需认证，tags 字符串数组） |
| GET | `/api/user/profile` | 获取当前用户档案（需认证） |
| PATCH | `/api/user/profile` | 更新用户档案（name/bio，需认证） |
| POST | `/api/user/username` | 设置用户名（首次设置，已设置返回 409，需认证） |
| POST | `/api/events` | 事件追踪（fire-and-forget 埋点） |
| GET | `/api/tutorials/[slug]/export-markdown` | 导出教程为 Markdown 文件 |
| GET | `/api/tutorials/[slug]/export-html` | 导出教程为 HTML 文件 |
| GET | `/api/github/repo-tree?url=` | GitHub 仓库文件树（需认证，代理 GitHub Trees API） |
| POST | `/api/github/file-content` | GitHub 仓库文件内容批量获取（需认证，代理 Contents API，≤15 文件 ≤1500 行） |

**关键设计决策：**
- 只用 Route Handlers，不用 tRPC、不用 Server Actions
- 重排 API 只接受 `stepIds` 数组，服务端从 DB 取权威 step 对象重排
- 草稿列表用 `listDraftSummaries()` 只提取摘要字段，不返回大 JSONB
- 步骤 PATCH API 同时接受文案字段和结构字段（patches/focus/marks），结构字段仅在提交时包含；服务端对结构变更触发级联校验
- 所有写操作通过 Drizzle 事务
- 保留 slug 路径：`new`、`drafts`、`api`、`_next`、`favicon.ico` 等

---

## 8. 分层架构

```
┌─────────────────────────────────────────────┐
│  app/                    (路由层)            │
│  Next.js 页面 + Route Handlers              │
│  只做编排和协议转换                           │
├─────────────────────────────────────────────┤
│  components/             (组件层)            │
│  客户端交互组件（编辑器、表单、渲染器、AppShell）│
├─────────────────────────────────────────────┤
│  lib/services/           (服务层)            │
│  业务逻辑（创建、生成、发布、质量计算）         │
│  被 API 路由调用                              │
├─────────────────────────────────────────────┤
│  lib/repositories/       (仓储层)            │
│  Drizzle ORM 数据访问                        │
├─────────────────────────────────────────────┤
│  lib/db/                 (数据库层)          │
│  Drizzle schema + DB 连接                    │
├─────────────────────────────────────────────┤
│  lib/errors/             (错误层)            │
│  错误类型定义 + 分类                          │
├─────────────────────────────────────────────┤
│  lib/tutorial/           (渲染基础层)        │
│  patch 应用、payload 构建、registry           │
├─────────────────────────────────────────────┤
│  lib/ai/                 (AI 层)            │
│  prompt 模板 + 多阶段生成编排                  │
├─────────────────────────────────────────────┤
│  lib/schemas/            (Schema 层)        │
│  Zod schema（AI 输出 + API 校验 + DB 校验）   │
├─────────────────────────────────────────────┤
│  lib/types/              (类型层)            │
│  DTO、客户端响应类型、共享 domain type         │
├─────────────────────────────────────────────┤
│  lib/utils/              (工具层)            │
│  通用工具（校验、序列化、hash、slug、请求版本） │
├─────────────────────────────────────────────┤
│  lib/monitoring/         (监控层)            │
│  事件类型定义、埋点 helpers、计时计数工具      │
├─────────────────────────────────────────────┤
│  lib/api/                (路由工具层)        │
│  Route Handler 共用的错误处理工具             │
└─────────────────────────────────────────────┘

**其他 lib 根级文件：**
- `lib/utils.ts` — shadcn/ui 的 `cn()` Tailwind 类名合并工具
- `lib/draft-status.ts` — 草稿状态 badge 逻辑（`getDraftStatusInfo()`）
- `lib/base-path.js` — base path 规范化
```

### 8.1 导入规则

- `app/*` → 依赖 `components/*`、`lib/services/*`、`lib/utils/client-data.ts`（序列化）
- `app/api/*` → 可额外依赖 `lib/api/route-errors.ts`（错误处理）
- `app/*` 禁止直接调用 `lib/repositories/*`、`lib/db/*`、`lib/tutorial/*`
- `components/*` → `components/*`、`lib/types/*`、`lib/schemas/*`
- `lib/services/*` → 可调用 repositories、tutorial、ai、schemas、utils、types
- 服务端数据发给客户端组件前，必须通过 `lib/utils/client-data.ts` 序列化

### 8.2 客户端架构

- 客户端请求统一进入 **feature client**（如 `components/drafts/draft-client.ts`）
- 状态机、重试、竞态保护、轮询、SSE 解析放在 `use-*.ts` / `use-*-controller.ts`
- 视图组件只接收状态和回调，不直接 `fetch()`
- 请求版本化防止旧响应覆盖新（request version ref）

### 8.3 工具与类型层

| 文件 | 用途 |
|------|------|
| `lib/utils/client-data.ts` | 服务端数据序列化（发给客户端前必须经过此层） |
| `lib/utils/validation.ts` | 教程草稿全链路校验（patch 链完整性 + assembler smoke test） |
| `lib/utils/hash.ts` | SHA-256 输入哈希计算（inputHash / tutorialDraftInputHash） |
| `lib/utils/slug.ts` | Slug 生成工具 |
| `lib/utils/uuid.ts` | UUID 生成工具 |
| `lib/utils/request-version.js` | 请求版本化（防止旧响应覆盖新） |
| `lib/api/route-errors.ts` | Route Handler 共用错误处理（`getRouteErrorMessage`、`isRouteValidationError`） |
| `lib/utils.ts` | shadcn/ui 的 `cn()` Tailwind 类名合并工具 |
| `lib/draft-status.ts` | 草稿状态 badge 逻辑（`getDraftStatusInfo()`） |
| `lib/base-path.js` | base path 规范化 |
| `lib/utils/seo.ts` | OG 元数据生成、JSON-LD 结构化数据、阅读时间估算 |
| `lib/monitoring/metrics.ts` | 计时工具（`startTimer`）、事件计数器（`EventCounter`） |
| `lib/monitoring/analytics.ts` | 埋点 convenience helpers（`trackExploreViewed`、`trackProfileViewed` 等），fire-and-forget |
| `lib/monitoring/event-types.ts` | 事件类型注册表（`ALLOWED_EVENT_TYPES`），新增事件必须先在此注册 |
| `lib/types/api.ts` | API 响应类型定义（`TutorialTag`、`UserPublicProfile`、`ExploreTutorial` 等） |
| `lib/types/client.ts` | 客户端 DTO 类型定义（`ClientTutorialTag`、`ClientExploreTutorial` 等） |
| `lib/utils/html-escape.ts` | HTML 转义工具（导出 Markdown/HTML 用） |
| `lib/db/index.ts` | Drizzle DB 连接实例 |
| `lib/db/schema.ts` | Drizzle schema 定义（所有表） |
| `lib/errors/error-types.ts` | 错误类型定义（`AppError` 层级） |
| `lib/errors/classify-error.ts` | 错误分类（用户错误 vs 系统错误） |
| `lib/first-experience-template.ts` | 首次体验模板数据 |

### 8.4 仓储层

| 文件 | 用途 |
|------|------|
| `lib/repositories/draft-repository.ts` | 草稿 CRUD + `listDraftSummaries()` 摘要查询 |
| `lib/repositories/published-tutorial-repository.ts` | 已发布教程 CRUD + slug 查询 |
| `lib/repositories/draft-snapshot-repository.ts` | 版本快照 CRUD |
| `lib/repositories/tag-repository.ts` | 标签 CRUD + `getOrCreateTag()` 并发安全 |
| `lib/repositories/user-repository.ts` | 用户查询 + username 设置 |
| `lib/repositories/tutorial-search-repository.ts` | 全文搜索查询（ts_vector） |

---

## 9. 页面与路由

### 9.1 教程阅读（已有基础设施）

| 路由 | 说明 |
|------|------|
| `/` | 首页 |
| `/[slug]` | 服务端渲染教程（优先 DB published → 回退 registry） |
| `/[slug]/request` | 客户端 fetch 教程 |
| `/api/tutorials/[slug]` | 教程 payload JSON API（`route.js`） |

### 9.2 草稿创建与管理

| 路由 | 说明 |
|------|------|
| `/new` | 创建草稿页面（源码输入 + Teaching Brief 表单） |
| `/drafts` | 草稿列表页（AppShell 布局） |
| `/drafts/[id]` | 编辑工作区（AppShell 布局，侧边步骤列表 + 主编辑区） |
| `/drafts/[id]/preview` | 本地预览 |
| `/drafts/[id]/preview/request` | 远程预览 |

### 9.3 发现与用户档案（v3.7 新增）

| 路由 | 说明 |
|------|------|
| `/explore` | 探索页面（搜索 + 标签筛选 + 排序 + 分页，Server Component） |
| `/tags` | 标签页面（所有标签 + 教程计数卡片） |
| `/u/[username]` | 公开用户档案（头像、名称、简介、已发布教程列表） |

### 9.4 路由特殊处理

- `/drafts` 页面需要 `await connection()` 强制动态渲染（否则构建时冻结列表）
- `app/[slug]/page.jsx` 通过 `lib/services/tutorial-queries.ts` 中的 `cache()` 包装函数避免重复 DB 查询

### 9.5 认证与路由保护

中间件 (`middleware.ts`) 对路由实施认证保护：

**公开路由（无需登录）：**
- `/`（首页）、`/[slug]`（教程阅读）、`/[slug]/request`
- `/explore`（探索）、`/tags`（标签）、`u/`（用户档案）
- `/api/auth/*`、`/api/tutorials/*`、`/api/models/*`、`/api/og/*`
- `/api/search`、`/api/tags`

**受保护路由（需要登录）：**
- `/drafts/*`、`/new` — 页面路由 redirect 到登录页
- `/api/drafts/*`、`/api/user/*` — API 路由返回 `401 JSON`

中间件使用轻量级 NextAuth 实例（无 DB adapter，仅验证 JWT cookie），在 Edge Runtime 下运行。页面和服务端组件通过 `getCurrentUser()` 获取当前用户，API 路由通过 `auth()` 获取 session。

---

## 10. 组件清单

### 10.1 核心渲染组件

| 组件 | 说明 |
|------|------|
| `components/tutorial/tutorial-scrolly-demo.jsx` | 主渲染器（静态、远程、预览共用） |
| `components/tutorial/scrolly-code-frame.jsx` | 代码面板 |
| `components/tutorial/scrolly-step-rail.jsx` | StepRail 侧边导航 |
| `components/tutorial/scrolly-handlers.jsx` | CodeHike handler（changeIndicator、tokenTransitions、animateLineDiff） |
| `components/remote-tutorial-page.jsx` | 远程加载容器 |
| `components/remote-preview-page.tsx` | 预览远程加载容器（泛型，fetchUrl 为 prop） |

### 10.2 编辑器组件

| 组件 | 说明 |
|------|------|
| `components/code-mirror-editor.tsx` | CodeMirror 6 封装（多语言、只读模式） |
| `components/markdown-editor.tsx` | Markdown 编辑器（工具栏 + 编辑/预览切换） |
| `components/app-shell.tsx` | 应用外壳（桌面侧边栏 + 移动端抽屉，`lg` 断点统一） |

### 10.3 草稿编辑组件

| 组件 | 说明 |
|------|------|
| `components/create-draft-form.tsx` | 创建草稿表单（多文件源码输入 + Teaching Brief 表单） |
| `components/draft-workspace.tsx` | 编辑工作区主容器 |
| `components/draft-meta-editor.tsx` | meta 信息编辑器 |
| `components/step-editor.tsx` | 单步编辑器（文案 + patches + focus + marks + 交互式行选择 + 代码预览 + 结构变更检测） |
| `components/step-list.tsx` | 步骤列表（含删除/重排） |
| `components/generation-progress.tsx` | 生成进度展示 |
| `components/drafts-page.tsx` | 草稿列表页视图 |
| `components/tutorial-scrolly-demo.jsx` | 渲染器兼容导出（re-export `components/tutorial/tutorial-scrolly-demo.jsx`） |

### 10.4 认证组件

| 组件 | 说明 |
|------|------|
| `components/auth/login-button.tsx` | GitHub OAuth 登录按钮 |
| `components/auth/user-menu.tsx` | 用户头像 + 名称 + 登出菜单 |

### 10.5 分享组件

| 组件 | 说明 |
|------|------|
| `components/tutorial/share-dialog.tsx` | 分享对话框（公开 URL + embed snippet + 社交分享 + Markdown/HTML 导出按钮） |

### 10.6 发现与标签组件（v3.7 新增）

| 组件 | 说明 |
|------|------|
| `components/explore/explore-client.tsx` | 探索页客户端交互（搜索输入、标签筛选 chips、排序切换） |
| `components/tutorial/tag-editor.tsx` | 标签编辑器（添加/删除标签 + 自动补全） |
| `components/tutorial/tags-client.ts` | 标签 API 调用封装 |

### 10.7 用户档案组件（v3.7 新增）

| 组件 | 说明 |
|------|------|
| `components/profile/profile-editor.tsx` | 档案编辑器（name + bio） |
| `components/profile/username-setup.tsx` | 首次用户名设置（带可用性验证） |
| `components/profile/profile-client.ts` | 档案 API 调用封装 |

### 10.8 Feature 分解

草稿相关：
- `components/drafts/draft-client.ts` — API 调用封装
- `components/drafts/use-create-draft-form-controller.ts` — 创建表单状态管理
- `components/drafts/create-draft-form-utils.ts` — 创建表单工具函数
- `components/drafts/use-draft-workspace-controller.ts` — 编辑工作区状态管理
- `components/drafts/draft-workspace-utils.ts` — 工作区工具函数
- `components/drafts/use-drafts-page-controller.ts` — 草稿列表页状态管理
- `components/drafts/draft-workspace-content.tsx` — 工作区主内容视图
- `components/drafts/draft-workspace-sidebar.tsx` — 工作区侧边栏

GitHub 导入（v3.9 新增）：
- `components/create-draft/github-client.ts` — GitHub API 客户端调用封装
- `components/create-draft/use-github-import-controller.ts` — 导入状态机（idle → loading-tree → selecting → loading-content → done）
- `components/create-draft/file-tree-browser.tsx` — 文件树多选 UI（递归渲染 + 目录全选 + 文件统计）
- `components/create-draft/github-import-tab.tsx` — GitHub 导入 Tab 视图

教程相关：
- `components/tutorial/tutorial-client.ts` — 教程 API 调用封装
- `components/tutorial/use-generation-progress.ts` — SSE 解析 + 状态机
- `components/tutorial/generation-progress-types.ts` — 生成进度类型定义
- `components/tutorial/generation-progress-utils.ts` — 生成进度工具函数
- `components/tutorial/generation-progress-view.tsx` — 生成进度视图组件
- `components/tutorial/use-remote-resource.ts` — 远程加载 + 请求版本化

步骤编辑器子组件：
- `components/step-editor/types.ts` — 步骤编辑器类型定义（DiffLine、SelectionMode、FocusRange、PatchDraft、MarkDraft）
- `components/step-editor/diff-utils.ts` — Diff 计算工具
- `components/step-editor/diff-line.tsx` — Diff 行渲染（支持交互点击和 focus/mark 高亮样式）
- `components/step-editor/code-diff-view.tsx` — 代码差异视图（支持 interactive 模式：行点击、focus/mark 选区高亮）
- `components/step-editor/code-preview-panel.tsx` — 代码预览面板（选择模式切换、diff 统计、文件切换）
- `components/step-editor/patch-item.tsx` — 单个 Patch 编辑卡片（find/replace textarea + 校验状态 + 文件选择）
- `components/step-editor/focus-marks-panel.tsx` — Focus/Marks 折叠面板（focus 文本输入 + marks 列表编辑）
- `components/step-editor/use-patch-validation.ts` — Patch 校验 hook
- `components/step-editor/intermediate-preview.tsx` — 中间代码预览（多 patch 逐步展开）
- `components/step-editor/code-selection-menu.tsx` — 代码文本选择菜单（选中代码快速设为 patch find 或 focus）

---

## 11. 数据库设计

### 11.1 PostgreSQL + Drizzle ORM

**`drafts` 表（核心表）：**
- `id` uuid PK
- `userId` text FK → users.id（草稿所有者）
- `sourceItems` jsonb（源码文件数组）
- `teachingBrief` jsonb（教学意图）
- `tutorialDraft` jsonb (nullable)（AI 生成的教程 DSL）
- `status` pgEnum `draft_status` ("draft"|"published")
- `syncState` pgEnum `sync_state` ("empty"|"fresh"|"stale")
- `inputHash` varchar(64)（sourceItems + teachingBrief 的 SHA-256）
- `tutorialDraftInputHash` varchar(64)（成功生成时的 inputHash 快照）
- `generationState` pgEnum `generation_state` ("idle"|"running"|"succeeded"|"failed")
- `generationErrorMessage` text
- `generationModel` varchar(64)
- `generationLastAt` timestamp
- `generationOutline` jsonb (v3.1，大纲数据)
- `generationQuality` jsonb (v3.1，质量指标)
- `validationValid` boolean (default false)
- `validationErrors` jsonb (default [])
- `validationCheckedAt` timestamp
- `publishedSlug` varchar(256)（唯一 slug）
- `publishedTutorialId` uuid（FK → published_tutorials.id）
- `publishedAt` timestamp
- `createdAt`、`updatedAt` timestamp

**`published_tutorials` 表：**
- `id` uuid PK
- `draftRecordId` uuid FK → drafts.id
- `slug` varchar(256) (unique)
- `tutorialDraftSnapshot` jsonb（冻结的教程 DSL 快照）
- `publishedAt` timestamp
- `createdAt` timestamp

**`users` 表（NextAuth + v3.7 用户档案）：**
- `id` text PK（auto UUID）
- `name` text
- `email` text (unique)
- `emailVerified` timestamp
- `image` text
- `username` varchar(64) (unique, nullable) — v3.7 用户名（首次设置后不可更改）
- `bio` text — v3.7 个人简介

**`accounts` 表（NextAuth OAuth）：**
- `userId` text FK → users.id (cascade)
- `type` text、`provider` text、`providerAccountId` text
- Token 字段：`refresh_token`、`access_token`、`expires_at`、`token_type`、`scope`、`id_token`、`session_state`
- PK: compound(provider, providerAccountId)

**`sessions` 表（NextAuth）：**
- `sessionToken` text PK
- `userId` text FK → users.id (cascade)
- `expires` timestamp

**`verification_tokens` 表（NextAuth）：**
- `identifier` text、`token` text、`expires` timestamp
- PK: compound(identifier, token)

**`draft_snapshots` 表（v3.5 版本快照）：**
- `id` uuid PK
- `draftId` uuid FK → drafts.id (cascade)
- `label` varchar(256)
- `tutorialDraftSnapshot` jsonb（冻结的 TutorialDraft）
- `stepCount` integer (default 0)
- `createdAt` timestamp

**`tutorial_tags` 表（v3.7 教程标签）：**
- `id` uuid PK (auto gen_random_uuid)
- `name` varchar(64) (unique)
- `slug` varchar(64) (unique)
- `createdAt` timestamp with time zone (default now)

**`tutorial_tag_relations` 表（v3.7 标签关联）：**
- `tutorialId` uuid FK → published_tutorials.id (cascade)
- `tagId` uuid FK → tutorial_tags.id (cascade)
- PK: compound(tutorialId, tagId)

**`events` 表（v3.6 事件追踪）：**
- `id` uuid PK
- `eventType` varchar(64)
- `payload` jsonb (default `{}`)
- `userId` text
- `sessionId` varchar(128)
- `slug` varchar(256)
- `createdAt` timestamp with time zone

### 11.2 设计决策

- 用 Drizzle 不用 Prisma（Drizzle schema 直接写 TS）
- 用 PostgreSQL 不用 SQLite（兼容 serverless 部署如 Vercel）
- 生成状态用**扁平字段**而非嵌套 JSON 对象
- slug 通过 unique index 保证唯一性
- 保留 slug 路径：`new`、`drafts`、`api`、`_next`、`explore`、`tags`、`u`、`admin`、`dashboard`、`settings`、`notifications` 等

---

## 12. UI 规格

### 12.1 AppShell（应用外壳）

- 桌面端：左侧固定侧边栏（导航链接：首页、新建、草稿列表）
- 移动端：抽屉式导航（汉堡按钮触发）
- 断点统一使用 `lg`（1024px），侧边栏和抽屉按钮必须在同一断点切换

### 12.2 草稿列表页

- 卡片式布局
- 每张卡片：标题（或"新草稿"）、状态 badge、步骤数、更新时间、操作按钮
- 状态 badge 映射：idle/empty → "待生成"、running → "生成中..."（带 spinner）、succeeded/fresh → "就绪"、succeeded/stale → "已过期"、failed → "生成失败"、published → "已发布"
- 删除需确认对话框；生成中/已发布状态不可删除

### 12.3 创建草稿页面

- 多文件源码输入（至少一个文件，每个有 label、language selector、CodeMirror 编辑器）
- Teaching Brief 表单（topic、audience_level、core_question、ignore_scope、output_language 均为必填）
- 提交后跳转到编辑工作区

### 12.4 编辑工作区

- 左侧：步骤列表（可删除、可重排、显示当前选中）
- 右侧：主编辑区
  - 顶部：meta 编辑器（标题、描述）
  - 中部：步骤编辑器（完整编辑能力，见下方）
  - 底部：生成/重新生成按钮
- 生成进度面板：实时 SSE 进度（阶段 → 步骤进度 → 验证），`max-height + overflow-y-auto + overscroll-contain` 防止撑爆布局

#### 步骤编辑器详细规格

**文案编辑：**
- `eyebrow`、`title`、`lead` — 文本输入
- `paragraphs` — Markdown 编辑器（工具栏 + 编辑/预览切换）

**代码变更编辑（patches）：**
- 每个 patch 有 `find` 和 `replace` 两个 textarea
- 多文件模式下有文件选择器下拉（指定 patch 目标文件）
- 支持新增 / 删除 patch
- 保存时校验 find 的精确唯一匹配

**高亮区域编辑（focus）：**
- textarea 输入 `find` 字符串（内容锚定定位）
- 多文件模式下有文件选择器
- 清除按钮可将 focus 设为空

**行标记编辑（marks）：**
- 每个 mark 有 `find` textarea 和 `color` 输入
- 多文件模式下有文件选择器
- 支持新增 / 删除 mark

**代码预览：**
- 展示"上一步代码 → 应用当前步骤 patches → 当前代码"的预览
- 调用 `getStepCodePreview()` 获取 `previousFiles` / `currentFiles` 和 diff 摘要
- 多文件时有文件选择器切换预览目标
- 修改 patches 后实时刷新预览
- **交互式行选择模式**（v3.9 新增）：
  - 三种模式切换：关闭 / Focus / Mark
  - Focus 模式：点击行选择高亮范围（Shift+点击扩展范围），自动填充 focus find 文本
  - Mark 模式：点击行切换标记，自动生成 mark 条目
  - 选中行有视觉高亮（蓝色=focus，紫色=mark）
  - 切换模式或 patches 变更时自动重置选区

**结构变更检测：**
- `getStructureSignature()` 将 patches/focus/marks 序列化为 JSON，与原始值比对
- 有结构变更时显示"结构改动待保存"标记
- 结构变更的保存会在服务端触发 `validateTutorialDraftThroughStep`（只校验到当前步骤）
- 预览出错时阻止保存

### 12.5 教程阅读页

- 左侧（桌面端）：固定代码面板
  - 顶部：文件标签栏（多文件时显示）
  - 代码内容：语法高亮 + focus 高亮 + 行标记 + 变更指示器
  - StepRail：竖线导航，点击跳转，hover 显示步骤标题和变更信息
- 右侧：滚动文章（引言 → 各步骤文字）
- 滚动联动：IntersectionObserver 驱动 selectedIndex，切换左侧代码
- 移动端：每步文字后紧跟内嵌代码块（交替布局）

### 12.6 UI Primitive

使用 Radix UI + Tailwind CSS 实现：
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/badge.tsx`
- `components/ui/input.tsx`
- `components/ui/textarea.tsx`
- `components/ui/select.tsx`
- `components/ui/tabs.tsx`
- `components/ui/label.tsx`
- `components/ui/scroll-area.tsx`
- `components/ui/separator.tsx`
- `components/ui/sheet.tsx`（移动端抽屉）
- `components/ui/dialog.tsx`（模态对话框，基于 React Portal）

---

## 13. 服务层清单

| 服务文件 | 职责 |
|----------|------|
| `lib/services/create-draft.ts` | 创建草稿（含 inputHash 计算） |
| `lib/services/generate-tutorial-draft.ts` | 生成入口（v1/v2 分发 + 异步持久化） |
| `lib/services/update-draft.ts` | 更新草稿基本信息 |
| `lib/services/update-draft-meta.ts` | 更新 meta |
| `lib/services/update-draft-step.ts` | 更新单步内容 |
| `lib/services/append-draft-step.ts` | 追加步骤 |
| `lib/services/replace-draft-steps.ts` | 步骤重排 |
| `lib/services/delete-draft.ts` | 删除草稿 |
| `lib/services/delete-draft-step.ts` | 删除单步 |
| `lib/services/regenerate-draft-step.ts` | 重新生成单步 |
| `lib/services/publish-draft.ts` | 发布（前置检查 + 事务：创建 PublishedTutorial + 更新 DraftRecord） |
| `lib/services/build-draft-preview-payload.ts` | 构建预览 payload |
| `lib/services/draft-queries.ts` | 草稿查询 |
| `lib/services/tutorial-queries.ts` | 教程查询 |
| `lib/services/compute-generation-quality.ts` | 生成质量指标计算 |
| `lib/services/unpublish-draft.ts` | 取消发布（事务：删除 PublishedTutorial + 重置 draft） |
| `lib/services/draft-snapshots.ts` | 版本快照创建/恢复/列表/删除（含所有权验证和自动备份） |
| `lib/services/incremental-regenerate.ts` | 增量重新生成（比对大纲差异，只重生成受影响步骤） |
| `lib/services/explore-service.ts` | 探索页数据查询（搜索 + 标签筛选 + 排序 + 分页） |
| `lib/services/tag-service.ts` | 标签管理（AI 生成 + 手动设置 + 名称规范化） |
| `lib/services/user-profile-service.ts` | 用户档案（公开 profile + username 设置 + profile 更新） |
| `lib/services/export-markdown.ts` | 教程导出为 Markdown |
| `lib/services/export-html.ts` | 教程导出为 HTML |
| `lib/services/github-repo-service.ts` | GitHub 仓库导入（文件树获取 + 文件内容拉取 + OAuth token 检索） |

---

## 14. AI 层结构

| 文件 | 职责 |
|------|------|
| `lib/ai/prompt-templates.ts` | v1 单次生成的 prompt 模板 |
| `lib/ai/outline-prompt.ts` | 阶段一：教学大纲生成 prompt |
| `lib/ai/step-fill-prompt.ts` | 阶段二：单步内容填充 prompt |
| `lib/ai/tutorial-generator.ts` | v1 生成器封装 |
| `lib/ai/multi-phase-generator.ts` | v2 多阶段生成 SSE 流编排 |
| `lib/ai/tag-generator.ts` | AI 标签生成（generateText + 语言回退 fallback map） |
| `lib/ai/provider-registry.ts` | AI provider 注册表（DeepSeek + OpenAI 多 provider 支持） |
| `lib/ai/prompt-adapters.ts` | Prompt 适配器（根据 provider 能力调整输出格式） |
| `lib/ai/model-probe.ts` | 模型能力探测（可达性、延迟、response_format 支持） |
| `lib/ai/style-templates.ts` | 教学风格模板 |
| `lib/ai/source-preprocessor.ts` | 源码预处理（压缩、注释清理） |
| `lib/ai/patch-auto-fix.ts` | Patch 自动修复（常见 AI 输出错误的自动纠正） |

---

## 15. Schema 层

| Schema 文件 | 用途 |
|-------------|------|
| `lib/schemas/source-item.ts` | SourceItem 校验 |
| `lib/schemas/teaching-brief.ts` | TeachingBrief 校验 |
| `lib/schemas/tutorial-draft.ts` | TutorialDraft 校验（核心：AI 输出 + API + DB 三用） |
| `lib/schemas/tutorial-outline.ts` | 教学大纲校验 |
| `lib/schemas/generation-quality.ts` | GenerationQuality 校验 |
| `lib/schemas/api.ts` | API 请求校验 |
| `lib/schemas/model-config.ts` | 模型配置校验 |
| `lib/schemas/index.ts` | Barrel 导出 |

---

## 16. 关键实现注意事项

### 16.1 已知陷阱

1. **AI SDK v6 stream 消耗问题：** `partialOutputStream` 和 `toTextStreamResponse()` 共享底层流，消耗一个会耗尽另一个。必须手动从 `textStream` 构建 SSE
2. **步骤编辑级联验证：** 修改某步骤的 patch 后，后续所有步骤的 patch 可能失效。解决方案：保存时先调用 `validateTutorialDraftThroughStep` 校验到当前步骤，通过后再同步调用 `validateTutorialDraft` 对整份草稿做全量校验并更新 `validationValid`/`validationErrors`
3. **重排 API 安全：** 只接受 `stepIds` 顺序数组，服务端从 DB 取权威 step 对象重排，不信任客户端提交的完整 step 对象
4. **草稿列表性能：** 使用 `listDraftSummaries()` 在 SQL 层提取摘要，不返回大 JSONB
5. **生成失败恢复：** 区分 outline 失败 vs step 失败，提供"重新生成大纲"和"从失败步骤重试"
6. **AI 输出 meta 遗漏：** `normalizeTutorialMeta()` 在 AI 生成后从 baseCode 推导缺失的 lang/fileName
7. **Patch 文件名大小写：** `applyContentPatches` 支持大小写不敏感回退
8. **生成轮询上限：** `MAX_POLL_ATTEMPTS = 30`（约 3 分钟超时），防止 DB 卡住时无限轮询
9. **Assembler 性能优化：** 跳过未变更且非 activeFile 且无 focus/marks 的文件的高亮计算
10. **Tailwind v4 source 检测：** 必须在 globals.css 中显式声明 `@source` 指令
11. **Patch 编辑保存策略：** step-editor 将文案字段和结构字段（patches/focus/marks）分开处理——文案变更直接保存，结构变更时才包含 patches/focus/marks 并触发级联校验，避免无变更时的冗余校验开销
12. **Edge Runtime 限制：** middleware 必须使用轻量级 NextAuth 实例（`providers: []`，无 adapter），因为 Edge Runtime 不支持 Node.js `crypto` 和 `pg` 模块。主 `auth.ts` 带 Drizzle adapter 只能在 Node.js runtime 使用
13. **OG 图片 runtime：** `/api/og/[slug]` 必须声明 `runtime = 'nodejs'`，因为 `getTutorialMetadata()` 依赖 Drizzle（Node.js only）。`next/og` 的 `ImageResponse` 在 nodejs runtime 下工作
14. **Auth middleware 路由区分：** API 路由返回 401 JSON（`{ message: "请先登录" }`），页面路由 redirect 到 `/api/auth/signin`，避免 API 请求被重定向到 HTML 登录页
15. **Drizzle JSONB 查询陷阱：** `sql` 模板不支持 `->` / `->>` JSONB 操作符与 `${columnRef}` 插值混用。全文搜索等需要 JSONB 字段访问的场景，必须使用原始 SQL 列名（如 `"published_tutorials"."tutorial_draft_snapshot"`）
16. **leftJoin(users) 必须：** 探索/搜索查询中 `drafts.userId` 可能为 NULL（未关联用户的草稿），必须用 `leftJoin(users)` 而非 `innerJoin`，否则会过滤掉无作者的教程
17. **全文搜索配置：** 使用 PostgreSQL `simple` 配置（不分词、不词干化），适合中英混合场景。搜索 `ts_vector` 基于 `tutorialDraftSnapshot->meta->title` 和 `slug`
18. **AI 标签生成 fire-and-forget：** `tag-generator.ts` 在教程发布后异步调用，失败不阻塞发布主流程。`getOrCreateTag` 处理并发竞争（unique constraint catch + fallback select）

### 16.2 发布前置条件

1. `syncState === "fresh"`（输入未变更）
2. `validationValid === true`
3. 发布事务：创建 PublishedTutorial（冻结 snapshot）+ 更新 DraftRecord 状态
4. 发布后教程通过 `/[slug]` 访问，优先查 DB published_tutorials，回退到 registry

### 16.3 静态数据源

- `content/sample-tutorial.js` — 示例教程 DSL 数据
- `lib/tutorial/registry.js` — 静态 slug 注册表
- 扩展模式：创建 DSL 文件 → 注册到 registry → 自动获得 `/slug`、`/slug/request`、`/api/tutorials/slug` 三条路由

### 16.4 环境变量

```
DATABASE_URL=postgresql://...       # PostgreSQL 连接
DEEPSEEK_API_KEY=...                # DeepSeek API Key
DEEPSEEK_BASE_URL=https://api.deepseek.com  # DeepSeek API 端点
DEEPSEEK_MODEL=deepseek-chat        # 默认模型
OPENAI_API_KEY=...                  # OpenAI API Key（可选，多 provider 支持）
OPENAI_BASE_URL=...                 # OpenAI API 端点（可选）
DEFAULT_AI_MODEL=...                # 默认 AI 模型（可选，覆盖 DEEPSEEK_MODEL）
AUTH_SECRET=...                     # NextAuth v5 密钥（生产环境必须更换）
GITHUB_ID=...                       # GitHub OAuth App Client ID
GITHUB_SECRET=...                   # GitHub OAuth App Client Secret
NEXT_PUBLIC_BASE_URL=https://...    # 公开访问基础 URL（SEO 生成用）
```

---

## 17. 实施阶段记录

### Phase 1：渲染基础层 ✅ 已完成
- TutorialData DSL 定义
- Assembler（patch 应用、高亮、payload 构建）
- 静态教程页面 + 远程加载页面
- TutorialScrollyDemo 渲染器 + StepRail + MobileCodeFrame
- 示例教程数据 + Registry

### Phase 2：数据库 + 创建 ✅ 已完成
- Drizzle schema + DB 连接
- DraftRecord CRUD repository
- 创建草稿页面（多文件输入 + Teaching Brief 表单）
- `POST /api/drafts` + `POST /api/drafts/[id]/generate`

### Phase 3：AI 生成 ✅ 已完成
- v1 单次生成（prompt + streamObject）
- v2 多阶段生成（outline → step-fill → validate）
- SSE 协议 + 前端 GenerationProgress 解析
- 生成质量评估

### Phase 4：编辑工作区 ✅ 已完成
- AppShell 布局
- 草稿列表页 + 删除
- 步骤编辑器（文案 + patches/focus/marks 全量编辑 + 代码预览 + 结构变更检测）
- 步骤删除/重排
- 单步重新生成
- 多文件源码输入

### Phase 5：预览 + 发布 ✅ 已完成
- 预览页面（本地 + 远程）
- 发布流程（前置检查 + 事务）
- `/[slug]` 页面集成 DB 查询
- 首页更新（已发布列表 + 创建入口）

### Phase 6：v3.5 产品化 ✅ 已完成
- NextAuth v5 认证（GitHub OAuth + JWT sessions + Drizzle adapter）
- 用户系统（users/accounts/sessions/verification_tokens 表 + userId 草稿所有权）
- 中间件路由保护（公开 vs 受保护路由）
- 取消发布流程
- 版本快照（draft_snapshots 表 + 创建/恢复/删除 API）
- SEO 工具（OG 元数据、JSON-LD 结构化数据、阅读时间估算）
- OG 图片生成（`/api/og/[slug]`）
- 教程分享（ShareDialog + embed 端点 + 社交分享）
- 取消生成按钮（暴露 AbortController + 取消状态处理）
- 增量重新生成服务
- 模型能力探测端点
- CI/CD 自动化（GitHub Actions）
- 监控工具（计时 + 计数）

### Phase 7：v3.6 分析与增长基础 ✅ 已完成
- 事件追踪系统（events 表 + event_types 注册 + 埋点 helpers）
- 监控工具完善（analytics.ts convenience helpers + metrics.ts 计时计数）
- 测试覆盖率提升（分层边界 + 纯函数 smoke tests）
- CI/CD 部署自动化（GitHub Actions）

### Phase 8：v3.7 发现、标签与创作者身份 ✅ 已完成
- 探索页面（/explore — 全文搜索 + 标签筛选 + 排序 + 分页）
- 标签系统（tutorial_tags + tutorial_tag_relations 表、AI 自动生成 + 手动编辑）
- 用户档案（users 增加 username/bio、公开 profile 页面 /u/[username]）
- 标签页面（/tags — 所有标签 + 教程计数）
- API 扩展（/api/search、/api/tags、/api/tutorials/[slug]/tags、/api/user/*）
- 导航更新（AppShell 新增"探索"和"标签"入口）
- 保留 slug 扩展（explore、tags、u、admin、dashboard 等）

### Phase 9：v3.8 导出与体验优化 ✅ 已完成
- Markdown/HTML 导出（`/api/tutorials/[slug]/export-markdown`、`export-html`）
- AI 多 provider 支持（DeepSeek + OpenAI，`provider-registry.ts`）
- Patch 自动修复（`patch-auto-fix.ts`）
- 步骤编辑器子组件拆分（diff 视图、代码选择菜单、中间预览）
- 错误分类层（`lib/errors/`）

### Phase 10：v3.9 GitHub 仓库导入 + 编辑器增强 ✅ 已完成
- GitHub 仓库文件树浏览（`/api/github/repo-tree`，代理 GitHub Trees API）
- GitHub 仓库文件内容批量获取（`/api/github/file-content`，代理 Contents API）
- OAuth token 复用（从 accounts 表取已存储的 GitHub token）
- 文件树多选 UI（递归树渲染 + 目录全选 + 文件大小显示）
- 导入状态机（URL 输入 → 树加载 → 文件选择 → 内容拉取 → 映射 SourceItem[]）
- 创建表单 Tab 切换（手动粘贴 / GitHub 导入）
- 导入限制（≤15 文件、≤1500 行）前端 + 后端双重校验
- 步骤编辑器子组件重构：CodePreviewPanel、PatchItem、FocusMarksPanel 独立拆分
- 交互式行选择：focus/mark 模式下点击 diff 行自动填充 find 文本（Shift+点击扩展范围）
- diff 视图 memo 化 + useCallback 优化，避免不必要的重渲染
- 工作区侧边栏宽度从 16rem 调整到 20rem
- 步骤列表操作按钮改为 hover 浮层样式



---

## 18. 测试策略

- `npm test` 使用 `node:test`（tsx --test）
- 优先覆盖：**分层边界**（app → service 导入规则）、**patch 链**（多步 patch 应用正确性）、**纯函数**（assembler 核心算法）
- 不要求完整测试框架，结构约束测试 + 纯函数测试即可
- `npm run build` 验证路由图和类型边界

---

## 19. 混合 JS/TS 策略

- 已有 `.js`/`.jsx` 文件（渲染链路）保持不变
- 新增功能默认用 `.ts`/`.tsx`
- `tsconfig.json` 设置 `allowJs: true`
- 不要强行统一为全 TS

---

*本文档基于 VibeDocs v3.9 实现状态编写。v3.9 在 v3.8 之上完成了 GitHub 公开仓库导入 MVP 和步骤编辑器增强（交互式行选择、子组件拆分、性能优化）。*
