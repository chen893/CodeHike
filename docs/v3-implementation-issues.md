# VibeDocs v3.0 实施问题记录

> 记录实施过程中遇到的问题、根因分析和解决方案。

---

## 问题 1：Zod v4 UUID 校验更严格

**现象**：`POST /api/drafts` 返回 `Invalid UUID` 错误，传入的 `00000000-0000-0000-0000-000000000001` 被拒绝。

**根因**：项目安装了 Zod v4（4.3.6），其 `z.string().uuid()` 严格遵循 RFC 4122，只接受 v1-v8 版本的 UUID，拒绝全零等非标准 UUID。

**解决**：使用标准 v4 UUID（如 `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d`）。前端 `create-draft-form.tsx` 使用 `crypto.randomUUID()` 生成，不会有此问题。

---

## 问题 2：`@ai-sdk/openai` v3 使用 Responses API（非 Chat Completions）

**现象**：调用 DeepSeek API 时返回 404，请求 URL 为 `https://api.deepseek.com/responses`。

**根因**：`@ai-sdk/openai` v3.x 默认使用 OpenAI 的 **Responses API**（`/responses` 端点），而非 Chat Completions API（`/chat/completions`）。DeepSeek 等 OpenAI 兼容供应商只支持 Chat Completions API。

**解决**：使用 `@ai-sdk/openai-compatible` 替代 `@ai-sdk/openai`。前者走 `/chat/completions` 端点，兼容所有 OpenAI 兼容供应商。

**影响文件**：`lib/ai/tutorial-generator.ts`

---

## 问题 3：MiniMax 不支持 `response_format`

**现象**：MiniMax M2.7 的 `partialOutputStream` 无数据产出，`Output.object` 无法工作。

**根因**：MiniMax API 不支持 `response_format: { type: "json_object" }` 参数（社区已确认的已知限制）。AI SDK 的 `Output.object` 依赖此参数约束 JSON 输出。

**解决**：MiniMax 接入时不得走 `Output.object()`；在 `model-capabilities.ts` 中标记为 `manual` 结构化输出策略，统一用 `generateText()` + `parseJsonFromText()` 解析，并在解析器中兼容 `<think>...</think>` 推理标签。Provider 仍通过 `@ai-sdk/openai-compatible` 访问 `https://api.minimax.io/v1`。

**参考**：[MiniMax M2.5 response_format 限制](https://github.com/MiniMax-AI/MiniMax-M2.5/issues/4)

---

## 问题 4：DeepSeek `max_tokens` 上限为 8192

**现象**：DeepSeek API 返回 `Invalid max_tokens value, the valid range of max_tokens is [1, 8192]`。

**根因**：DeepSeek Chat 模型的 `max_tokens` 上限是 8192，而代码中设置了 16000。

**解决**：将 `maxOutputTokens` 改为 8192。

**注意**：如果生成的教程 JSON 超过 8192 tokens，会被截断。后续可考虑使用 DeepSeek 的更大上下文模型（如 deepseek-reasoner）或分段生成。

**影响文件**：`lib/ai/tutorial-generator.ts`

---

## 问题 5：`partialOutputStream` 与 `toTextStreamResponse()` 不能同时消费

**现象**：使用 `toTextStreamResponse()` 返回的 SSE 流客户端收到空数据。

**根因**：AI SDK 的 `streamText` 返回的 `StreamTextResult` 中，`partialOutputStream`、`textStream`、`toTextStreamResponse()` 共享同一个底层流。先消费 `partialOutputStream`（后台持久化）会耗尽数据，导致 `toTextStreamResponse()` 的 body 为空。

**解决**：改用 `result.textStream` 手动构建 SSE Response：
1. 遍历 `textStream`，每个 chunk 包装为 `data: {text: "..."}\n\n` SSE 事件
2. 流结束后在后台解析完整 JSON 并持久化
3. 客户端 `GenerationProgress` 组件用 `fetch` + `ReadableStream` 消费 SSE

**影响文件**：
- `lib/services/generate-tutorial-draft.ts` — 手动构建 ReadableStream
- `components/generation-progress.tsx` — 从 useObject 改为原生 SSE 消费
- `app/api/drafts/[id]/generate/route.ts` — 返回自定义 SSE Response

---

## 问题 6：AI SDK v6 参数名变化

| 旧参数（v4/v5） | 新参数（v6） | 说明 |
|---|---|---|
| `maxTokens` | `maxOutputTokens` | 最大输出 token 数 |

---

## 当前可用的 AI 供应商配置

| 供应商 | Provider 包 | 端点 | 结构化输出 | SSE 流式 |
|---|---|---|---|---|
| DeepSeek | `@ai-sdk/deepseek` | `/chat/completions` | `json_object` 模式（需 prompt 含 "json"），不支持 `json_schema` | 支持 |
| OpenAI | `@ai-sdk/openai` | `/chat/completions` | 原生 `json_schema`（`Output.object()`） | 支持 |
| MiniMax M2.7 | `@ai-sdk/openai-compatible` | `/chat/completions` | 不走 `Output.object()`，按 manual 处理 | 支持 tools，结构化输出手动解析 |
| 智谱 GLM | `@ai-sdk/openai-compatible`（兜底） | `/chat/completions` | 不确定，按 manual 处理 | 支持 |

**推荐**：OpenAI 走原生结构化输出，DeepSeek / MiniMax / 未知 provider 走手动解析，未知 provider 走 `openai-compatible` 兜底。

---

## 问题 7：AI 生成的 patch find 文本与代码不精确匹配

**现象**：生成校验失败 `Patch 匹配失败: 找不到: ...`。AI 在 baseCode 中放置了占位函数（如 `dispatch: () => {}`），patch 的 find 文本与实际代码存在空白/格式差异。

**根因**：原始 prompt 对 patch 精确匹配的约束不够强。AI 倾向于：
1. 在 baseCode 中写占位符而非真实代码
2. find 字段凭想象编写而非从上一步代码逐字复制
3. 空格、缩进、换行与实际代码不一致

**解决**：大幅强化 prompt 中的 patch 规则：
- 明确禁止在 baseCode 中使用占位符
- 要求 baseCode 必须是真实可运行的代码
- 要求 find 从上一步代码中"逐字复制"
- 增加"每步代码变化不超过 15 行"的约束
- 用醒目的分隔线和警告符号突出关键规则

**验证**：优化 prompt 后，Redux 300 行源码教程生成成功，6 步全部通过可执行校验。

**影响文件**：`lib/ai/prompt-templates.ts`

---

## 问题 8：步骤结构编辑误把“整份草稿全量校验”当成保存门槛

**现象**：删除或重排中间步骤后，后续步骤的 patch 链会暂时失效。此时尝试修复第一个失效步骤，`PATCH /api/drafts/[id]/steps/[stepId]` 仍然返回校验失败，用户必须一次性修完所有后续步骤才能保存任何一个步骤。

**根因**：`updateDraftStep()` 在请求包含 `patches/focus/marks` 时直接对整份 `tutorialDraft` 做全量校验。删除/重排服务本身允许草稿以“后续步骤待修复”的状态落库，但步骤保存服务却要求整份草稿立刻恢复全绿，两个策略冲突。

**解决**：结构编辑保存时只校验“从 baseCode 到当前步骤”为止的链路是否成立；当前步骤可保存后，再对整份草稿重新计算 `validationValid / validationErrors`，把仍然存在的后续问题继续暴露给 UI。

**影响文件**：
- `lib/services/update-draft-step.ts`
- `lib/utils/validation.ts`

---

## 问题 9：步骤重排接口信任客户端完整步骤对象，存在越权修改入口

**现象**：`PUT /api/drafts/[id]/steps` 本应只用于重排，但客户端如果提交修改过的完整 `steps` 数组，也会被服务端直接持久化，从而绕过单步编辑接口里的 patch 校验。

**根因**：重排服务只校验步骤数量和 ID 集合是否一致，然后直接把客户端提供的步骤对象整体写回数据库，没有把“顺序调整”和“内容编辑”两个职责分离。

**解决**：将重排接口收口为只接收 `stepIds` 顺序数组。服务端基于数据库里的权威步骤对象重新组装 `steps`，这样客户端无法借重排接口修改标题、段落或 patch 内容。

**影响文件**：
- `lib/schemas/api.ts`
- `lib/services/replace-draft-steps.ts`
- `components/draft-workspace.tsx`

---

## 问题 10：草稿列表页把整份源码和教程 JSON 传进客户端，负载过重

**现象**：`/drafts` 页面只显示卡片摘要，但服务端查询和传输的是完整 `DraftRecord[]`，其中包含 `sourceItems.content`、`tutorialDraft.baseCode`、步骤数组和生成质量等大字段。草稿一多，页面数据量会迅速膨胀。

**根因**：列表查询复用了详情页仓储方法，直接 `select * from drafts`，没有为列表页单独抽取摘要 DTO。

**解决**：新增 `listDraftSummaries()`，通过 SQL 从 `jsonb` 中只抽取标题、描述、步骤数和状态所需字段；`app/drafts/page.tsx` 与 `GET /api/drafts` 都改为返回轻量 summary 数据。

**影响文件**：
- `lib/repositories/draft-repository.ts`
- `app/drafts/page.tsx`
- `app/api/drafts/route.ts`
- `components/drafts-page.tsx`

---

## 问题 11：生成失败后缺少“按失败原因恢复”的入口

**现象**：当前系统只能展示失败文本，不能根据失败原因直接给出下一步操作。目录生成失败时，用户只能手动重开整条流程；步骤编排或删除导致 patch 链断开时，用户只能逐步手动点“重新生成”。

**根因**：失败状态只以 `generationErrorMessage` 和 `validationErrors` 的文本形式暴露，UI 没有把“无大纲可用的生成失败”和“已有草稿但后续步骤坏链”区分开，也没有提供批量恢复动作。

**解决**：
- 在生成页里识别 outline 阶段失败，直接提供“重新生成目录”入口，复用现有 `/api/drafts/[id]/generate` 流。
- 在工作区里顺序分析 patch 链，定位首个失效步骤；当步骤编排、删除或 patch 链断开时，提供“从失败步骤开始重新生成后续步骤”的批量修复入口。
- 校验错误统一补充成“第几步失效”的格式，便于 UI 和用户定位。

**影响文件**：
- `components/generation-progress.tsx`
- `components/draft-workspace.tsx`
- `lib/tutorial-draft-code.js`
- `lib/utils/validation.ts`

---

## 问题 12：Tailwind CSS v4 + shadcn/ui 在当前环境下不能直接沿用旧式初始化方式

**现象**：
1. 项目虽然已经安装了 `tailwindcss`、`postcss`、`autoprefixer`，但没有可用的 Tailwind 样式输出，页面上的 Tailwind class 不生效。
2. `npx shadcn@latest init` 在当前终端环境中长时间停留在 spinner 状态，无法作为稳定的初始化方式接入。

**根因**：
1. Tailwind CSS v4 不再使用旧的 `tailwindcss` PostCSS plugin 配置，必须改为 `@tailwindcss/postcss`，并在全局样式里通过 `@import "tailwindcss";` 引入。
2. 当前仓库是已有项目、且在 agent 终端里运行 CLI，`shadcn` 初始化流程对交互和环境探测更敏感，直接 CLI 初始化不稳定。

**解决**：
1. 安装 `@tailwindcss/postcss`，新增 `postcss.config.mjs`，把 PostCSS 配置切到 v4 推荐方式。
2. 手动创建 `components.json`、`lib/utils.ts` 和 `components/ui/*` 基础原语，按 shadcn/ui 的目录约定接入，而不是依赖交互式 CLI。
3. 将 `app/globals.css` 重写为 Tailwind v4 入口，并只保留 CodeHike / CodeMirror 必需的少量全局样式，其余页面样式迁到组件内的 Tailwind class。

**影响文件**：
- `postcss.config.mjs`
- `components.json`
- `app/globals.css`
- `lib/utils.ts`
- `components/ui/*`

---

## 问题 13：Tailwind CSS v4 在 Next.js dev 模式下未自动发现模板源，导致页面看起来“完全无样式”

**现象**：
- `npm run build` 和 `npm start` 后样式正常。
- 但 `npm run dev` 时，页面 HTML 已经输出了大量 Tailwind class，`/_next/static/css/app/layout.css` 也成功加载，却缺少 `bg-slate-50`、`text-slate-900`、`.relative` 等 utility 规则，导致页面在浏览器里看起来接近无样式。

**根因**：
- 仅依赖 Tailwind v4 的自动 source detection 在当前 Next.js + webpack dev 流程里不稳定，`app/`、`components/`、`lib/` 下的模板文件没有被 dev 模式稳定纳入扫描范围。
- 结果是 dev 下只生成了基础层和部分样式，utility 层没有完整产出。

**解决**：
- 在 `app/globals.css` 里显式声明 source：
  - `@source "../app";`
  - `@source "../components";`
  - `@source "../lib";`
- 然后重启 dev server，使 Tailwind 重新建立扫描结果。

**验证**：

---

## 问题 14：GitHub 公开仓库导入把“登录态、限流、部分成功、大仓库树截断”混成同一个失败面

**现象**：
- 未登录用户导入公开 GitHub 仓库时直接返回 401，无法完成基础试用。
- 用户已登录但 token 失效、权限不足或 GitHub secondary rate limit 触发时，前端统一看到“速率限制”，定位困难。
- `POST /api/github/file-content` 某些文件失败时返回 207，但响应体没有携带成功文件，client 的 partial-success 聚合逻辑无法真正保留成功结果。
- 大仓库 `git/trees?recursive=1` 返回 `truncated=true` 后，服务端虽然暴露了 `lazyNodes` 和子目录 API，前端文件树却没有继续加载完整子树，用户看到的是不完整目录。

**根因**：
1. route handler 先强制 `auth()`，把“获取 OAuth token”错误地实现成了“没有登录就禁止访问公开仓库”。
2. GitHub 错误分类过粗，代码把所有 `403` 都归并成 `GitHubRateLimitError`，没有区分真实 rate limit、forbidden、token 问题和 secondary limit。
3. file-content route 的 207 协议只回传 `failures`，没有把成功文件、总代码行数和 rate-limit 信息一起返回。
4. client 侧的文件树只消费了初始 `repo-tree` 响应，没有把 `repo-tree/subdirectory` 真正接到目录展开交互里。

**解决**：
1. GitHub 导入改为“公开仓库免登录”，如果当前 session 有 GitHub OAuth token，则仅作为增强配额的可选能力。
2. 新增更细的 GitHub 错误分类和重试/降级逻辑：
   - `403 + rate-limit headers/message` → `GitHubRateLimitError`
   - 非限流 `403` → `GitHubForbiddenError`
   - token 导致的 `401/403/404` 自动回退到匿名 public-repo 请求
3. `serializeGitHubFileBatchResult()` 统一组装 file-content 响应，207 partial success 必须带回成功文件、`totalLines` 和 `rateLimit`。
4. `use-github-import-controller` + `file-tree-browser` 接通 lazy subtree loading：目录展开时按 `sha` 请求完整子树并 merge 回现有 tree。

**影响文件**：
- `lib/services/github-repo-service.ts`
- `app/api/github/repo-tree/route.ts`
- `app/api/github/repo-tree/subdirectory/route.ts`
- `app/api/github/file-content/route.ts`
- `components/create-draft/github-client.ts`
- `components/create-draft/use-github-import-controller.ts`
- `components/create-draft/file-tree-browser.tsx`
- `components/create-draft/github-import-tab.tsx`
- `tests/github-import.test.js`

---

## 问题 14：生成步骤列表过长时撑高整个页面，打断工作区布局

**现象**：
- 教程步骤较多时，`GenerationProgress` 右侧“生成进度 / 即时预览”里的步骤列表会无限增高。
- 在创建页和草稿工作区里，用户会被迫滚动整个页面才能继续查看当前阶段信息，生成态不再是一个稳定的局部工作区。

**根因**：
- `components/generation-progress.tsx` 里的 v1 / v2 进度视图都直接把步骤项渲染在普通块级容器里，没有给列表设置内部滚动边界。
- 一旦 outline 或解析出的步骤数变多，列表高度会直接参与页面整体文档流计算，最终把整个页面撑长。

**解决**：
- 为进度步骤列表增加统一的限高滚动容器，使用 `max-height + overflow-y-auto + overscroll-contain`，把滚动收口在组件内部。
- v1 兼容流和 v2 多阶段流共用同一套滚动策略，避免回退模式再次出现相同问题。

**影响文件**：
- `components/generation-progress.tsx`

---

## 问题 15：公共 AppShell 侧边栏可见但无法点击，且在部分桌面宽度下导航直接消失

**现象**：
- 首页、创建页、草稿列表页共用的 `AppShell` 中，桌面侧边栏虽然可见，但点击导航项没有反应。
- 浏览器宽度处于 `lg` 到 `xl` 之间时，桌面侧边栏还未显示，移动端抽屉按钮却已经隐藏，导致整套导航入口不可达。

**根因**：
- `components/app-shell.tsx` 把侧边栏设为 `fixed`，但没有显式 `z-index`；同层级下后渲染的 `main` 覆盖了左侧区域，点击事件落到主内容层而不是侧边栏。
- 侧边栏使用 `xl:*` 断点显示，而抽屉按钮使用 `lg:hidden`，两个断点不一致，造成 `1024px-1279px` 区间没有任何导航入口。

**解决**：
- 给 `AppShell` 建立独立 stacking context，并为桌面侧边栏补上明确层级，让它稳定浮在主内容层之上。
- 将公共壳层的桌面侧边栏和主内容偏移统一到 `lg` 断点，和抽屉按钮的隐藏时机保持一致，避免中间断点出现“无导航”状态。

**影响文件**：
- `components/app-shell.tsx`

---

## 问题 16：教程展示页的分支内 UI 重构误伤阅读链路，需要回收为单一 classic 渲染实现

**现象**：
- 教程展示组件曾同时维护 classic / modern 两套分支样式。
- 结果是草稿预览、发布页和特定 slug 页面之间出现视觉不一致，用户还需要额外判断当前看到的是哪一套阅读体验。

**根因**：
- `components/tutorial-scrolly-demo.jsx` 是静态直出、草稿预览、远程预览共用的核心渲染器；在同一个组件里长期并存两套视觉分支，会让预览与发布不再天然同态。
- `app/[slug]/page.jsx` 还需要额外按 slug 注入变体，进一步放大了共享渲染链路的维护成本。

**解决**：
- 删除 `TutorialScrollyDemo` 中的 modern 分支，只保留 classic 这一套 Tailwind 实现。
- 同时移除 `app/[slug]/page.jsx` 里按 slug 传入 `variant` 的逻辑，让草稿预览、发布页和远程页都直接复用同一个阅读组件实现。

**影响文件**：
- `app/[slug]/page.jsx`
- `components/tutorial-scrolly-demo.jsx`

---

## 问题 17：`/drafts` 直接查数据库却被构建期预渲染，草稿列表会冻结在部署时刻

**现象**：
- `app/drafts/page.tsx` 直接调用 Drizzle 仓储读取草稿摘要，但新部署后访问 `/drafts` 看到的是构建时快照。
- 新增草稿、删除草稿、发布状态变化不会在首次访问时反映出来；同时构建阶段也被迫依赖数据库可用。

**根因**：
- Next.js 16 App Router 会尽量预渲染无请求边界的页面。
- 该页面虽然读了数据库，但没有显式建立动态渲染边界，结果被当成可静态产出的路由处理。

**解决**：
- 在 `app/drafts/page.tsx` 中调用 `await connection()`，让页面只在真实请求到来时执行数据库查询，避免构建期预渲染。

**影响文件**：
- `app/drafts/page.tsx`

---

## 问题 18：远程教程/预览容器缺少请求版本保护，旧响应会覆盖新内容

**现象**：
- 用户在远程教程页连续点击“刷新数据”，或在远程预览页切换 `fetchUrl` 后立刻重试时，较早发出的请求可能晚于新请求返回。
- 一旦旧请求最后落地，页面会被回滚到过期教程、过期草稿 payload，或者展示已经失效的错误态。

**根因**：
- `components/remote-tutorial-page.jsx` 和 `components/remote-preview-page.tsx` 在异步请求完成后直接 `setState`，没有校验当前响应是否仍属于最新一次加载。
- effect 清理阶段也没有让挂起请求失效，导致路由切换或组件卸载后，旧请求仍可能继续提交状态。

**解决**：
- 两个远程容器统一引入请求版本号 `ref`。
- 每次触发加载时递增版本号，只允许当前版本对应的响应更新状态；在 `useEffect` 清理时再次递增版本号，使切换路由和卸载后的挂起请求自动失效。

**影响文件**：
- `components/remote-tutorial-page.jsx`
- `components/remote-preview-page.tsx`

---

## 问题 19：多文件 baseCode 导致 `applyContentPatches` 类型不安全

**现象**：
- `multi-phase-generator.ts` 中 `applyContentPatches(previousFiles, step.patches, primaryFile)` 返回类型被 TS 推断为 `string | Record<string, string>`，调用方需要 `as Record<string, string>` 强制断言。

**根因**：
- `applyContentPatches` 用联合参数 `codeOrFiles: string | Record<string, string>` 同时服务单文件和多文件模式，返回类型也是联合类型。
- TS 无法从调用签名推断"传入 Record 必返回 Record"。

**解决**：
- 为 `applyContentPatches` 添加两组 JSDoc `@overload` 注释（单文件→string，多文件→Record），让 TS 在不同参数组合下推断出正确的返回类型。
- 移除调用方的 `as Record<string, string>` 断言。

**影响文件**：
- `lib/tutorial/draft-code.js`
- `lib/ai/multi-phase-generator.ts`

---

## 问题 20：`step-editor.tsx` 内重复实现了 `summarizeCodeDiff`，与 `draft-code.js` 逻辑冗余

**现象**：
- `step-editor.tsx` 内部定义了 `summarizeCodeDiffLocal`，逻辑与 `draft-code.js` 已有的 `summarizeCodeDiff` 几乎完全一致。

**根因**：
- 多文件改造时，编辑器需要 per-file diff 统计，开发者图方便就地重写了一个简化版，没有复用已有导出。

**解决**：
- 删除 `summarizeCodeDiffLocal`，改为从 `draft-code.js` 导入 `summarizeCodeDiff`。多文件场景下传入 per-file string 即可。

**影响文件**：
- `components/step-editor.tsx`

---

## 问题 21：生成完成后的轮询无上限，数据库卡住时前端永远轮询

**现象**：
- SSE 流结束后前端用指数退避轮询 DB 状态，但退避到 8s 上限后恒定轮询，无最大次数限制。如果 DB 持久化卡住，轮询会无限持续。

**根因**：
- 轮询逻辑只设了 `MAX_POLL_MS = 8000` 上限，没有 `MAX_POLL_ATTEMPTS`。

**解决**：
- 添加 `MAX_POLL_ATTEMPTS = 30`（约 3 分钟），超时后展示"保存确认超时"错误提示。

**影响文件**：
- `components/tutorial/use-generation-progress.ts`

---

## 问题 22：`normalizeBaseCode` 已经能推导 lang，但 AI 输出后 `meta.lang`/`meta.fileName` 仍可能缺失

**现象**：
- 多文件模式下 AI 生成的 outline 可能省略 `meta.lang` 和 `meta.fileName`，导致下游代码需要散落的 `meta.lang || ''` fallback。

**根因**：
- Schema 将 `lang`/`fileName` 设为 optional 是正确的（AI 不一定输出），但解析后没有集中补全。

**解决**：
- 在 `normalize.js` 新增 `normalizeTutorialMeta(meta, baseCode)` 函数，从 baseCode 推导 lang/fileName 填充缺失字段。
- 在 AI outline 解析后和 assembler 入口统一调用此函数，消除散落 fallback。

**影响文件**：
- `lib/tutorial/normalize.js`
- `lib/ai/multi-phase-generator.ts`
- `lib/tutorial/assembler.js`

---

## 问题 23：AI 生成的 patch file 字段大小写可能与实际文件名不一致

**现象**：
- AI 输出的 patch 中 `file: "Store.js"`，但 baseCode record 的键是 `"store.js"`，导致 patch 直接 throw。

**根因**：
- `applyContentPatches` 多文件模式用精确字符串匹配 `targetFile in result`，对大小写不一致无容错。

**解决**：
- 在精确匹配失败后，增加 case-insensitive fallback 查找。匹配到则使用实际键名；仍匹配不到则 throw 并列出所有可用文件名，方便调试。

**影响文件**：
- `lib/tutorial/draft-code.js`

---

## 问题 24：assembler 每步全量高亮所有文件，多文件多步时性能浪费

**现象**：
- `buildTutorialSteps` 中每一步都对所有文件执行 CodeHike `highlight()`，即使某文件在本步骤没有任何变化。

**根因**：
- 多文件改造时为简单起见对每个文件都做高亮，没有跳过不变文件的优化逻辑。

**解决**：
- 在高亮循环中检测：如果文件内容未变且不是 activeFile 且没有 focus/marks 指向它，则复用上一步的高亮结果，跳过 `highlight()` 调用。

**影响文件**：
- `lib/tutorial/assembler.js`

---

## 问题 25：CodeDiffView 代码选择功能 — 技术验证通过

**可行性评估**：完全可行。

**技术分析**：
- CodeDiffView 将代码渲染为普通 `<div>` 元素（`diff-line.tsx`），文本内容直接渲染为 `{line.content}`。
- gutter 区域已设置 `select-none`，只有代码文本可选。
- `window.getSelection().toString()` 可直接获取纯文本，不含行号或标记符号。
- 无 CodeMirror、CodeHike inline editor 或 shadow DOM 干扰。

**实现方案**：
- `code-selection-menu.tsx`：浮动菜单组件，监听 `mouseup` 事件，通过 `getSelection().getRangeAt(0).getBoundingClientRect()` 定位。
- 提供 "设为 Patch Find" / "设为 Focus" 两个快捷操作。
- 集成到 step-editor.tsx 中，用 `useRef` 关联 CodeDiffView 容器。

**影响文件**：
- `components/step-editor/code-selection-menu.tsx`
- `components/step-editor.tsx`

## v3.5.A 用户认证实施问题

### 问题 1: Edge Runtime 不兼容 Node.js crypto 模块

**现象**: 部署 middleware.ts 后，所有页面返回 500 错误。错误信息: "The edge runtime does not support Node.js 'crypto' module"。

**根因**: Next.js middleware 运行在 Edge Runtime，但 `auth.ts` 导入了 `@auth/drizzle-adapter` + `pg`，后者依赖 Node.js `crypto` 模块。即使 middleware 只是 `export { auth as middleware }`，import 链也会将 `pg` 拉入 Edge Runtime。

**解决方案**:
1. 主 `auth.ts` 使用 JWT session strategy（而非 database sessions）
2. `middleware.ts` 创建轻量级 NextAuth 实例（`providers: []`，无 adapter），仅验证 JWT cookie
3. 中间件对 API 路由返回 401 JSON，对页面路由 redirect 到登录页

### 问题 2: proxy.ts 文件名不被 Next.js 识别

**现象**: 存在 `proxy.ts`（含 middleware 逻辑）但不被 Next.js 执行。

**根因**: Next.js 要求 middleware 文件必须命名为 `middleware.ts` 或 `middleware.js`（根目录或 `src/` 下）。`proxy.ts` 不会被自动加载。

**解决方案**: 删除 `proxy.ts`，创建正确的 `middleware.ts`，并使用 `export default` 而非 `export { auth as proxy }`。

### 问题 3: DB 缺少 userId 列导致查询失败

**现象**: 草稿编辑器页面加载 500 错误。SQL 查询包含 `userId` 列但数据库表中不存在。

**根因**: Drizzle schema 已定义 `userId` 列和 NextAuth 表，但 `drizzle-kit push` 未执行（仅生成了 migration 文件但未应用）。

**解决方案**: 执行 `drizzle-kit push` 将 schema 同步到数据库。

### 问题 4: 生产库缺少 v3.6/v3.7 表导致部署构建失败

**现象**: 2026-04-14 重新部署 `vibedocs` 到 IP 服务器时，Next.js 构建在预渲染 `/tags` 阶段失败，报错 `relation "tutorial_tags" does not exist`；同时 analytics 写入 `tutorial_viewed` 时记录 `relation "events" does not exist`。

**根因**: 生产库仍只有早期的 `drafts`、`published_tutorials` 表，缺少 NextAuth 用户表、`drafts.userId`、`draft_snapshots`、v3.6 `events`、v3.7 `tutorial_tags` / `tutorial_tag_relations`。仓库 `drizzle/meta/_journal.json` 中登记了 `0001_noisy_revanche`，但对应 SQL 文件缺失，不能直接依赖迁移目录完整回放。

**解决方案**: 在生产库执行幂等 SQL 补齐缺失表、列和外键约束后重新构建；构建通过后再切换 `/srv/apps/vibedocs/current` 到新 release 并重启 systemd。后续应补齐缺失的 Drizzle migration 文件或生成新的 schema baseline，避免下次部署再次需要手工修正。

---

## 问题 26：`step-editor.tsx` 单文件膨胀至 877 行，可维护性差

**现象**：步骤编辑器组件承担了状态管理、代码预览计算、patch CRUD、focus/marks 编辑、diff 渲染等全部职责，单文件 877 行。修改任一区域都需要理解整个组件，新人上手成本高。

**根因**：
- 初始实现时所有功能内联在同一个组件，后续迭代只做加法不做拆分
- 代码预览（`getStepCodePreview`）、diff 计算（`computeDiffLines`）、结构签名（`JSON.stringify`）等昂贵运算在每次渲染时无条件执行
- `handleLineClick` 等回调在每次渲染时创建新引用，导致子组件不必要的重渲染

**解决**：

### 1. 拆分为子组件

| 组件 | 行数 | 职责 |
|---|---|---|
| `code-preview-panel.tsx` | 196 | Diff 视图 + 选择模式 + 文件选择器 |
| `patch-item.tsx` | 91 | 单个 patch 卡片 + 验证指示器 |
| `focus-marks-panel.tsx` | 202 | 可折叠 Focus/Marks 编辑 |
| `step-editor.tsx` | 480 | 状态管理 + 布局编排 |

共享类型 `PatchDraft` / `MarkDraft` 提取到 `types.ts`。

### 2. 性能优化

- **`useMemo` 包裹昂贵计算**：`getStepCodePreview`（代码预览）、`computeDiffLines`（diff）、`getStructureSignature`（结构签名）全部缓存
- **关键发现**：`getStepCodePreview` 内部只使用 `step.patches`（通过 `getFilesAfterStep`），不依赖 prose 字段。因此 code preview memo 故意排除 `eyebrow/title/lead/paragraphs`，编辑文案时不再触发代码重算
- **`useCallback` 包裹 `handleLineClick`**：稳定引用防止 `CodeDiffView` 重渲染
- **`React.memo` 包裹 `CodeDiffView`、`DiffLineComponent`、`IntermediatePatchPreview`**：父组件状态变化时跳过无关子树

### 3. DRY

- 3 个 `<input>` 的重复 class 提取为 `INPUT_CLASS` 常量
- `IntermediatePatchPreview` 内的 `computeIntermediatePatchStates` 包裹 `useMemo`

**影响文件**：
- `components/step-editor.tsx` — 主组件重写
- `components/step-editor/types.ts` — 新增 `PatchDraft`、`MarkDraft`
- `components/step-editor/code-preview-panel.tsx` — 新文件
- `components/step-editor/patch-item.tsx` — 新文件
- `components/step-editor/focus-marks-panel.tsx` — 新文件
- `components/step-editor/code-diff-view.tsx` — 添加 `React.memo`
- `components/step-editor/diff-line.tsx` — 添加 `React.memo`
- `components/step-editor/intermediate-preview.tsx` — 添加 `useMemo`

**经验**：
- React 组件超过 300 行就应考虑拆分，按 UI 区块（而非功能层）拆分最自然
- `useMemo` 的真正收益不在于"少算一次"，而在于**让子组件的 `React.memo` 生效**——如果 memo 返回的引用每次都变，子组件的 `React.memo` 等于白加
- 拆分子组件时优先选择 props 少的边界（`PatchItem` 6 个 props vs `CodePreviewPanel` 22 个 props）；props 过多说明边界选得不好或状态管理需要上提

---

## 问题 27：GitHub 重新登录后 `accounts.access_token` 仍是旧值，导入继续掉回匿名限流

**现象**：用户已经重新走过 GitHub OAuth，但 GitHub 导入仍然在 `/api/github/repo-tree` / `/api/github/file-content` 中表现为匿名请求，随后命中 `API rate limit exceeded for <IP>`。本地排查发现数据库 `accounts.access_token` 存在，但直接调用 GitHub `/rate_limit` 返回 `401 Bad credentials`。

**根因**：
- 当前项目使用 `next-auth@5.0.0-beta.30` + `@auth/drizzle-adapter@1.11.1`
- Auth.js 在 OAuth callback 中，如果 `(provider, providerAccountId)` 对应的 account 已经存在，会直接把该用户登录成功，不会再次调用 adapter 的 `linkAccount()`
- `@auth/drizzle-adapter` 的 `linkAccount()` 只有 insert，没有 update 逻辑，因此“再次登录同一个 GitHub 账号”不会刷新 `accounts.access_token`
- 结果是服务端虽然拿到了 session user，也能从 `accounts` 表查到 token，但查到的是旧 token；请求 GitHub 401 后代码 fallback 到匿名请求，最终触发 IP 级 60/h 限流

**解决方案**：
1. 在 `auth.ts` 的 `callbacks.jwt` 中捕获 `trigger === 'signIn'` 且 `account.type === 'oauth'` 的场景
2. 用 `(provider, providerAccountId)` 精确定位 `accounts` 记录
3. 显式把本次 OAuth 返回的 `access_token`、`refresh_token`、`expires_at`、`token_type`、`scope`、`id_token`、`session_state` 写回数据库
4. 保留结构化 debug log，区分“GitHub 返回了新 token”和“数据库记录已更新”

**影响文件**：
- `auth.ts`
- `docs/vibedocs-technical-handbook.md`

**经验**：
- 在 Auth.js/NextAuth 里，OAuth “登录成功”不等于 provider token 已同步刷新；只要业务依赖 `accounts.access_token` 做后续 API 调用，就不能把 token 持久化完全托付给 adapter 默认行为
- 对外部 provider token 有业务依赖时，必须把“重新授权后的 token 回写”视为显式业务逻辑，而不是隐式框架副作用

---

## 问题 28：生成任务状态依赖进程内内存，跨实例取消与重连不可靠

**现象**：
- `POST /api/drafts/[id]/cancel` 只有在请求命中启动生成的同一进程时才稳定生效。
- 页面刷新后虽然客户端会尝试根据 `draft.generationState === "running"` 进入 reconnect 流程，但如果原进程已经重启，草稿可能永久停留在 `running`。
- 多实例部署下，一个实例开启生成、另一个实例处理 cancel 或后续读取时，内存中的 `activeGenerations` 无法共享。

**根因**：
- `lib/services/generate-tutorial-draft.ts` 用模块级 `Map<string, CancelToken>` 存储活跃任务。
- 任务生命周期、取消信号、是否仍在运行都依赖进程内状态，而不是数据库中的持久化 job 记录。
- `drafts.generationState` 只能表达“上次写库时的状态”，不是当前真实运行状态。

**解决方案**：
1. 新增持久化 generation job 表，记录 `status / phase / stepIndex / heartbeatAt / leaseUntil / errorCode / modelId`。
2. `generate`、`cancel`、`reconnect`、`polling` 都基于 job 状态，而不再依赖内存 `Map`。
3. 增加 `stale-running` 回收逻辑：超过 lease 且无 heartbeat 的 job 自动标记为 `failed` 或 `abandoned`，同步修正 draft 状态。
4. `drafts.activeGenerationJobId` 只通过受控 repository 写入，要求目标 job 属于同一 draft 且仍为 `queued/running`；非空写入会在事务内锁定目标 job 行，避免和终态迁移竞态。
5. job 进入 `succeeded/failed/cancelled/abandoned` 终态时，同事务清空仍指向该 job 的 `activeGenerationJobId`。
6. 保留进程内 token 仅用于“当前请求内的协作优化”，不再作为唯一真相源。

**影响文件**：
- `lib/services/generate-tutorial-draft.ts`
- `lib/ai/multi-phase-generator.ts`
- `components/tutorial/use-generation-progress.ts`
- `app/api/drafts/[id]/generate/route.ts`
- `app/api/drafts/[id]/cancel/route.ts`

---

## 问题 29：生成失败恢复入口分散，前端依赖文本猜测失败语义

**现象**：
- 生成页有“全量重试”和“从失败步骤开始重试”，工作区里又有“单步 regenerate”和“修复失效尾部”。
- 不同页面对错误类型的判断方式不同，有的依赖 `errorPhase`，有的依赖 `message.includes(...)`，有的重新 fetch draft 后自行推断。
- 某些 persist/validation 失败场景下，用户能看到错误提示，但拿不到明确恢复动作。

**根因**：
- 当前失败协议缺少统一的 `errorCode / recoverability` 枚举。
- `components/tutorial/use-generation-progress.ts`、`components/drafts/use-draft-workspace-controller.ts`、`lib/errors/classify-error.ts` 各自维护一套恢复分支。
- 恢复动作编排分散在多个 controller，而不是由服务层统一输出建议。

**解决方案**：
1. 为生成、预览、发布等关键失败定义结构化错误码和恢复策略枚举。
2. 新增 `draft-recovery` 服务，根据 `draft + job + validation + snapshots` 输出统一恢复动作。
3. 前端只渲染有限几类动作：重连、全量重试、从失败步骤修复、回滚快照、放弃当前任务。
4. 去掉基于 message 文本的隐式分支，统一改为 code 驱动。

**影响文件**：
- `components/tutorial/use-generation-progress.ts`
- `components/drafts/use-draft-workspace-controller.ts`
- `lib/errors/classify-error.ts`
- `lib/services/*` 新增恢复编排层

---

## 问题 30：创建草稿缺少幂等保护，网络抖动或连点会制造重复草稿

**现象**：
- 在 `/new` 页面提交后，如果请求超时、浏览器卡顿或用户重复点击提交按钮，可能连续创建多个内容相同的 draft。
- 当前 UI 没有提交锁，API 也没有 `Idempotency-Key` 语义。

**根因**：
- `components/drafts/use-create-draft-form-controller.ts` 提交时虽然会设置 `generating`，但没有在请求发出前做严格的一次性提交保护。
- `POST /api/drafts` 只做普通创建，没有 request-level 去重协议。

**解决方案**：
1. client 端用 `submittingRef` 在事件处理同步阶段锁定提交，避免 React state 尚未刷新时的快速双击。
2. 每次提交尝试生成一个稳定 `Idempotency-Key`，同一次提交链路内的重试复用同一个 key，而不是每次 `fetch` 都重新生成。
3. `POST /api/drafts` 支持 `Idempotency-Key`，同 key 的已完成请求返回同一个 draft；同 key 的并发请求共享同一个 in-flight promise，避免同时 miss 后重复创建。
4. 将 `inputHash + userId + recent window` 作为服务端兜底去重辅助条件，减少重复草稿污染。

**影响文件**：
- `components/drafts/use-create-draft-form-controller.ts`
- `components/create-draft-form.tsx`
- `components/drafts/draft-client.ts`
- `app/api/drafts/route.ts`
- `lib/services/create-draft.ts`

---

## 问题 31：发布 slug 检查先读后写，冲突错误映射不稳定

**现象**：
- 两个请求同时发布同一个 slug 时，理论上都可能通过 `isSlugTaken(slug)` 检查。
- 最终由数据库唯一约束兜底，但 route handler 未必能稳定把这类冲突返回为 `409`，可能落成通用 `500`。

**根因**：
- `lib/services/publish-draft.ts` 采用“先查是否存在，再 insert”的乐观流程，不是原子操作。
- `app/api/drafts/[id]/publish/route.ts` 的错误映射主要基于 message 文本，无法稳定识别底层 unique violation。

**解决方案**：
1. 移除发布前的显式 `isSlugTaken()` 作为最终判断依据，直接依赖数据库唯一约束。
2. repository / service 层捕获 unique violation，映射为结构化 `PUBLISH_SLUG_CONFLICT`。
3. route handler 稳定返回 `409`，前端据此提示用户更换 slug。

**影响文件**：
- `lib/services/publish-draft.ts`
- `app/api/drafts/[id]/publish/route.ts`
- `lib/repositories/published-tutorial-repository.ts`

---

## 问题 32：手工修正 migration 后，Drizzle snapshot 容易与真实约束漂移

**现象**：
- `drizzle/0003_cynical_daredevil.sql` 已经补上“同 draft 复合外键”和“单 active job 部分唯一索引”，但 `drizzle/meta/0003_snapshot.json` 仍保留旧的单列外键定义。
- 如果后续继续基于这个 snapshot 生成 migration，Drizzle diff 可能错误地尝试回滚或重建约束。

**根因**：
- 当前 `0003` migration 是先手工修正 SQL，再补 schema 约束。
- Drizzle 的 snapshot 不会自动跟随手工 SQL 修改；如果不显式同步，`schema.ts`、migration SQL、snapshot 三者会失去一致性。

**解决方案**：
1. 以当前 `schema.ts` 为准，在临时目录用 `drizzle-kit generate` 生成探针快照，对齐 `draft_generation_jobs` 和 `drafts` 两段元数据。
2. 将 `0003_snapshot.json` 补齐：
   - `draft_generation_jobs_draft_id_id_unique`
   - `draft_generation_jobs_single_active_per_draft`
   - `draft_generation_jobs_draft_id_created_at_idx`
   - `draft_generation_jobs_active_lease_until_idx`
   - `drafts_active_generation_job_same_draft_fk`
3. 将 migration 中的 `(draft_id, id)` 唯一性改为 `CREATE UNIQUE INDEX`，和 schema/snapshot 的 unique index 建模保持一致。
4. 将 job 表 `created_at/updated_at` 默认值改为 `clock_timestamp()`，避免同事务连续插入时 `now()` 产生相同时间戳导致 latest 查询不稳定。
5. 增加自动化测试，直接校验 snapshot 中存在上述索引和复合外键，防止后续回归。
6. 增加可选 DB 集成测试，使用临时数据库实际验证复合外键、部分唯一索引、repository active pointer guard、终态清 pointer 和 latest 排序。

**影响文件**：
- `drizzle/meta/0003_snapshot.json`
- `tests/generation-job-schema.test.js`
- `tests/generation-job-db.test.js`

---

## 问题 33：所有 provider 统一走 openai-compatible，浪费结构化输出能力

**现象**：
- `provider-registry.ts` 对 DeepSeek、OpenAI、智谱三个 provider 全部使用 `@ai-sdk/openai-compatible`（`createOpenAICompatible`）。
- 所有 `generateText` 调用走纯文本模式，JSON 解析完全依赖手写的 `parseJsonFromText()`，没有使用 AI SDK 的 `Output.object()` 原生结构化输出。
- `parseJsonFromText()` 在 `multi-phase-generator.ts` 和 `tutorial-generator.ts` 中各复制了一份，`tag-generator.ts` 又有独立的正则解析逻辑。
- `model-capabilities.ts` 定义了 `supportsStructuredOutput` 字段但从未在生成流程中使用。

**根因**：
- 项目早期 DeepSeek 不支持 `json_schema` 结构化输出（仅支持 `json_object` 模式），当时用 `openai-compatible` 绕过了问题 2（`@ai-sdk/openai` v3 默认走 `/responses` 端点导致 DeepSeek 404）。
- 后续 OpenAI 和智谱 provider 添加时沿用了同一模式，没有按 provider 能力区分。
- DeepSeek 的 `json_object` 模式有已知限制：prompt 必须含 "json" 关键词、偶尔返回空内容、经常把 JSON 包裹在 markdown code fence 中（[vercel/ai#7913](https://github.com/vercel/ai/issues/7913)、[vercel/ai#4710](https://github.com/vercel/ai/issues/4710)）。

**解决方案**：

### 1. Provider 分流

| Provider | 包 | 结构化输出策略 |
|---|---|---|
| DeepSeek | `@ai-sdk/deepseek` | `manual`（`parseJsonFromText`，覆盖 code fence / 空响应等边界） |
| OpenAI | `@ai-sdk/openai` | `native_json_schema`（`Output.object()`，SDK 自动验证） |
| 智谱 / 其他 | `@ai-sdk/openai-compatible` | `manual`（兜底） |

### 2. 结构化输出策略枚举

`model-capabilities.ts` 新增 `StructuredOutputStrategy = 'native_json_schema' | 'json_object' | 'manual'`，每个模型标记策略，新增 `supportsNativeStructuredOutput()` 函数。

### 3. 生成流程分路径

- **Legacy outline / step-fill（不带 tools）**：如果模型策略为 `native_json_schema`，使用 `Output.object({ schema })`；否则 fallback 到 `parseJsonFromText`。
- **Retrieval outline / step-fill（带 tools）**：保持 `parseJsonFromText`（tools + Output 组合需要额外 step，暂不启用）。
- **Tag generator**：同上，支持则走 `Output.object()`，否则走 `parseJsonFromText`。

### 4. 共享解析模块

提取 `parseJsonFromText()` 到 `lib/ai/parse-json-text.ts`，消除三处重复实现。

**影响文件**：
- `lib/ai/provider-registry.ts` — DeepSeek 用 `@ai-sdk/deepseek`，OpenAI 用 `@ai-sdk/openai`
- `lib/ai/parse-json-text.ts` — 新增共享模块
- `lib/ai/model-capabilities.ts` — 新增 `structuredOutputStrategy` 和 `supportsNativeStructuredOutput()`
- `lib/ai/multi-phase-generator.ts` — legacy 路径接入 `Output.object()`，retrieval 路径保持手动解析
- `lib/ai/tutorial-generator.ts` — 引用共享 `parseJsonFromText`
- `lib/ai/tag-generator.ts` — 接入 `Output.object()` + 共享解析
- `package.json` — 新增 `@ai-sdk/deepseek` 依赖

---

## 问题 34：step-fill 失败后写入占位文案，草稿结构合法但内容不可发布

**现象**：
- 多阶段生成在单步 step-fill 重试耗尽后，会往 `tutorialDraft.steps` 中写入“`⚠️ 此步骤自动生成失败，请手动编辑补全。`”之类的占位文案。
- 这类草稿仍可能通过原有 `validateTutorialDraft()` 的结构校验，并被标记为 `generationState = succeeded`、`validationValid = true`。
- review 时，这些失败占位会直接显示在教程正文里，导致内容完整性和发布就绪度同时崩塌。

**根因**：
- 现有校验更偏向 DSL 结构正确性，没有把“模型失败元信息泄露到正文”视为非法内容。
- 生成流程在 step-fill 重试耗尽后选择“继续往后生成”，把失败步骤当作普通教程步骤持久化，导致后续步骤也建立在错误上下文上。

**解决方案**：
1. 在 `validateTutorialDraft()` 中显式拦截模型失败占位模式，例如 `Failed to parse JSON from model response`、`请手动编辑`、`⚠️ 此步骤自动生成失败`。
2. 将 step-fill 重试耗尽视为本轮生成失败，直接抛出 `MultiPhaseGenerationError`，而不是补占位步骤继续生成。
3. 允许保留“已成功生成的部分步骤”作为调试和人工恢复依据，但不要把失败占位写进可发布正文。
4. 将这类问题纳入标准 review rubric 的 `contentIntegrity` 和 `publishReadiness` 关键扣分项，确保自动评估能稳定识别。

**影响文件**：
- `lib/ai/multi-phase-generator.ts`
- `lib/utils/validation.ts`
- `lib/review/generation-quality-review.ts`
- `tests/tutorial-validation.test.js`

---

## 问题 35：渐进式源码快照被当成普通文件集合，导致教学锚点和 source coverage 崩塌

**现象**：
- 输入源是 `s01...s12 + shared.ts` 这类“逐步演进快照”时，生成结果仍倾向于把所有 patch 都堆到最早的 `s01_agent_loop.ts`。
- 大纲和步骤文案会声称覆盖工具系统、任务系统、多 Agent、工作树等后续里程碑，但 `baseCode` 和 patch 实际只锚定到 1 个文件。
- 最终 review 会出现 `SOURCE_COVERAGE_COLLAPSE`、`PATCH_FILE_CONCENTRATION` 之类高严重度问题。

**根因**：
- prompt 只看到了“多个 sourceItems”，但没有识别这些文件名本身表达的是时间顺序和教学里程碑。
- outline 和 step-fill 都缺少明确约束，模型自然会把“越早出现的文件”当成单一主文件，不再沿着 `s01 -> s12` 的快照链路推进。

**解决方案**：
1. 增加 `analyzeSourceCollectionShape()`，区分 `single_file`、`codebase_files`、`progressive_snapshots` 三种源码形态。
2. 如果识别到 `progressive_snapshots`，在 outline prompt 中明确要求：
   - 将编号文件视为按顺序演进的里程碑快照，而不是平铺模块。
   - 大纲必须尽量覆盖后续里程碑文件，不能把所有能力折叠进最早文件。
3. 在 step-fill prompt 中继续强化：
   - 当前步骤的 patch 应贴近相邻里程碑文件。
   - 不要把所有后续能力都塞回 `s01`。
   - 文案承诺不能超过当前 patch 真正实现的能力边界。
4. 将 `sourceCoverage`、`patchFileCoverageRatio`、`patchConcentrationRatio` 纳入标准评分体系，作为迭代 stop condition 的硬指标。

**影响文件**：
- `lib/utils/source-collection-shape.ts`
- `lib/ai/outline-prompt.ts`
- `lib/ai/step-fill-prompt.ts`
- `lib/review/generation-quality-review.ts`
- `tests/source-collection-shape.test.js`
- `tests/generation-quality-review.test.js`

---

## 问题 36：outline 已经分散到后续里程碑文件，但 step-fill 仍然无法真正落到这些文件上

**现象**：
- 在渐进式快照输入里，outline 阶段已经能正确产出 `targetFiles`，例如 `step-5 -> s02_tool_use.ts`、`step-8 -> s03_todo_write.ts`。
- 但 step-fill 实际生成的 patches 仍然大量回退到 `s01_agent_loop.ts`，导致 `patchFileCoverageRatio` 几乎不增长。
- 原因不是 outline 没有对齐里程碑，而是“当前代码快照”里只存在 `baseCode` 的少数文件；后续目标文件根本还没被引入，模型没有可 patch 的落点。

**根因**：
- 当前 DSL 的 patch 机制只能做“精确 find/replace”，不能凭空创建新文件。
- progressive snapshot 模式下，`baseCode` 往往只保留最早里程碑文件；后续 `targetFiles` 即使在 outline 中存在，也会在 step-fill 注入阶段因为“不在 previousFiles 里”而消失。
- 最终模型被迫退回已有主文件，出现“outline 对了，step-fill 还是塌缩”的假象。

**解决方案**：
1. 在生成阶段为后续 `targetFiles` 预植入内部 placeholder stub，仅用于 step-fill 快照和 patch 对齐。
2. 在 retrieval step-fill 增加硬校验：
   - 如果 outline 给了 `targetFiles`，step 必须至少 patch 其中一个文件。
   - 如果该目标文件当前是 placeholder，必须直接替换它，而不是改动更早文件来规避。
3. 最终 materialize `tutorialDraft.baseCode` 时，只保留“原始 baseCode 文件 + 实际被 patch 过的 placeholder 文件”，避免把未用到的占位文件泄露到最终教程。

**影响文件**：
- `lib/ai/progressive-snapshot-base-code.ts`
- `lib/ai/multi-phase-generator.ts`
- `lib/ai/step-fill-prompt.ts`
- `lib/services/generate-tutorial-draft.ts`
- `scripts/generation-quality-loop.ts`
- `tests/progressive-snapshot-base-code.test.js`

---

## 问题 37：普通多文件代码库也会因为 baseCode 太小而丢失后续 targetFiles

**现象**：
- `mini-agent-typescript` 这类普通多文件代码库不是渐进式快照，但 outline 仍会将后续步骤锚定到 `src/llm/LLMClient.ts`、`src/tools/Tool.ts`、`src/config.ts` 等文件。
- 大纲阶段是正确的，但 `baseCode` 只包含最小可运行子集，例如 `src/schema.ts`、`src/agent/Agent.ts`、`src/cli.ts`。
- step-fill 阶段通过 `deriveStepSourceScope()` 只会保留当前快照中已存在的文件，导致后续 `targetFiles` 被过滤掉，模型只能改已有主文件或在读取原始文件后输出解释性文本。

**根因**：
- “patch 不能创建新文件”不是 progressive snapshot 独有问题，而是所有多文件教程都会遇到的 DSL 约束。
- 仅对 `progressive_snapshots` 注入 placeholder，普通 `codebase_files` 仍会在后续步骤丢失目标文件落点。

**解决方案**：
1. 将生成阶段 placeholder stub 注入从 progressive snapshot 模式推广到所有多文件输入。
2. 仍然保持最终 materialize 约束：只有真正被 patch 过的 placeholder 文件才进入最终 `tutorialDraft.baseCode`。
3. 保持 step-fill 校验：如果当前 target file 是 placeholder，本步必须替换这个文件，而不是改动其他已有文件规避。

**影响文件**：
- `lib/ai/progressive-snapshot-base-code.ts`
- `tests/progressive-snapshot-base-code.test.js`
- `AGENTS.md`
- `docs/vibedocs-technical-handbook.md`
- `docs/tutorial-data-format.md`

---

## 问题 38：retrieval step-fill 带 tools 时容易输出过程性文字而不是最终 JSON

**现象**：
- `mini-agent-typescript` 样本在 step-fill 第 3、7、10、11 步多次失败，模型输出类似“现在我需要查看 xxx 文件”“让我读取目录”的过程性文字。
- 这些文本既不是 tool call，也不是最终 step JSON，最终触发 `parseJsonFromText()` 失败。
- 即使上一轮通过 placeholder 文件让 `targetFiles` 进入当前快照，模型仍会倾向于继续探索原始仓库，而不是直接产出结构化步骤。

**根因**：
- retrieval step-fill 同时提供工具、当前目标代码、摘要和重试错误，模型容易进入“继续检索/计划”的模式。
- 但 step-fill 的真实任务不是探索仓库，而是基于 outline 和当前代码产出一个严格 JSON step。
- 对每个步骤来说，真正需要的上下文通常只是当前目标文件代码和少量原始目标/上下文文件参考，不需要再让模型自主调用读取工具。

**解决方案**：
1. retrieval outline 继续使用 tools，保留源码探索能力。
2. retrieval step-fill 默认改为无工具 scoped prompt：
   - 注入当前目标文件代码。
   - 注入原始 `targetFiles/contextFiles` 作为目标形态参考。
   - 明确禁止输出“我要查看文件”这类过程性文字。
3. 通过 `VIBEDOCS_STEP_FILL_TOOLS=1` 保留回退开关，便于后续对比工具模式。

**影响文件**：
- `lib/ai/step-fill-prompt.ts`
- `lib/ai/multi-phase-generator.ts`
- `AGENTS.md`
- `docs/vibedocs-technical-handbook.md`

---

## 问题 38：生成中预览与正式预览分叉，running 草稿从草稿箱进入编辑态

**现象**：
- `/new` 创建后停留在新建页内的生成承载 UI，生成完成后再跳转草稿编辑器，页面语义和生成状态承载分离。
- 生成中“实时预览”使用独立 partial preview UI；部分生成状态下左侧代码区不是正式 CodeHike 渲染结果，而是手写占位，容易出现代码预览缺失或与发布预览不一致。
- 从 `/drafts` 打开正在生成且已写入部分 `tutorialDraft` 的草稿时，页面会进入编辑器，而不是生成进度页。

**根因**：
- `/new` 和 `/drafts/[id]` 都能承载生成进度，职责重复。
- 生成过程中 `writePartialTutorial()` 会把已完成步骤写入 `tutorialDraft`，但工作区只在 `!tutorialDraft && generationState === 'running'` 时展示 `GenerationProgress`。
- 旧 `streaming-preview` 路由和 `StreamingPreviewPanel` 绕开正式 `/payload -> TutorialScrollyDemo` 渲染链路，形成第二套预览实现。

**解决方案**：
1. `/new` 只创建 DraftRecord，成功后跳转 `/drafts/[id]?generate=1&modelId=...`。
2. `/drafts/[id]` 统一承载生成启动、重连、取消、重试和完成后进入编辑器；只要 `generationState === 'running'` 就优先展示生成进度。
3. 生成中预览改为请求 `/api/drafts/[id]/payload`，复用正式 `TutorialScrollyDemo`；无已完成步骤时只展示等待态。
4. 删除旧的 `streaming-preview` route 和手写 partial preview 组件，避免保留无用分叉代码。

**影响文件**：
- `app/drafts/[id]/page.tsx`
- `components/create-draft-form.tsx`
- `components/draft-workspace.tsx`
- `components/drafts/use-create-draft-form-controller.ts`
- `components/drafts/use-draft-workspace-controller.ts`
- `components/drafts/draft-workspace-content.tsx`
- `components/drafts-page.tsx`
- `components/tutorial/generation-progress-view.tsx`
- `components/tutorial/generation-preview-panel.tsx`
- `components/tutorial/tutorial-client.ts`
- `components/tutorial/use-generation-progress.ts`
