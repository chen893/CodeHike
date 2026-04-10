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

**解决**：切换到 DeepSeek，其 API 完整支持 `response_format: json_object` + 流式输出。

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

| 供应商 | Provider 包 | 端点 | response_format | SSE 流式 |
|---|---|---|---|---|
| DeepSeek | `@ai-sdk/openai-compatible` | `/chat/completions` | 支持 | 支持 |
| MiniMax | `@ai-sdk/openai-compatible` | `/chat/completions` | 不支持 | 不确定 |
| OpenAI | `@ai-sdk/openai` | `/responses` 或 `/chat/completions` | 支持 | 支持 |

**推荐**：使用 DeepSeek + `@ai-sdk/openai-compatible`，兼容性最好。

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
