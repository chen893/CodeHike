# UI Review Workflow

这份文档定义 VibeDocs 项目的可重复 UI Review 流程，目标不是复述某一次审查，而是为下一次和后续每一次审查提供同一套执行框架。

适用场景：

- 大规模 UI 重构前，先做基线截图与问题盘点
- 一轮修复完成后，做回归截图与前后对比
- 新增页面、状态流或交互层后，补一次 focused review

这份流程默认继续使用：

- 本地 Next.js 站点
- Playwright CLI 截图
- Gemini CLI 做逐页视觉审查

如果后续换成别的截图工具或图像模型，这份文档的目录结构、审查粒度、输出格式和任务拆分原则仍然适用。

## 1. 核心原则

1. 每次 review 先定义清楚范围，再截图，不要边看边补路由。
2. 截图直接使用原始图，无需额外缩小处理。
3. 审查结果要按运行批次沉淀，避免把多轮结论混在一个文件里。
4. 先做逐页问题记录，再做跨页总结，不要一开始就直接下“统一改造结论”。
5. 修复任务必须按文件所有权拆分，避免共享文件冲突。
6. 同一轮前后对比必须复用同一组路由、同一组数据、同一组 viewport。

## 2. 本次 Review 先定义什么

开始前先写下这 5 个参数：

- `run_id`
  - 建议格式：`YYYY-MM-DD-主题`
  - 例：`2026-04-10-baseline`
- `base_url`
  - 默认：`http://localhost:3100`
- `scope`
  - 例：`shell`、`draft-workspace`、`preview`、`full`
- `viewport_set`
  - 至少 1 套桌面；需要检查抽屉、移动代码块或小屏断点时，加 1 套移动端
- `output_doc`
  - 建议：`docs/ui-reviews/<run_id>.md`

推荐目录结构：

```text
tmp/ui-review/<run_id>/
  screenshots/  # 截图（直接用于审查）
  prompts/      # 审查 prompt / 修复 prompt
  manifest.md   # 本轮路由清单、数据来源、viewport

docs/ui-reviews/<run_id>.md
```

历史上已有的 `docs/ui-issus` 可以继续保留为样例输出，但新一轮 review 更推荐单独落到 `docs/ui-reviews/<run_id>.md`。

## 3. 选择 Review 范围

本项目当前页面可按 4 类分组：

| 组 | 路由模板 | 说明 | 是否需要动态数据 |
|----|----------|------|------------------|
| 公共壳层 | `/`, `/new`, `/drafts` | 首页、创建页、草稿列表 | `/drafts` 需要 DB |
| 教程消费 | `/<slug>`, `/<slug>/request` | 静态直出与远程加载教程页 | 否，registry slug 即可 |
| 草稿工作区 | `/drafts/<draftId>` | 编辑器、步骤列表、生成状态 | 是 |
| 草稿预览 | `/drafts/<draftId>/preview`, `/drafts/<draftId>/preview/request` | 直出预览与远程预览 | 是 |

推荐使用下面 4 种 review 级别之一：

### `shell`

用于检查导航、首页、列表、创建页等整体视觉语言：

- `/`
- `/new`
- `/drafts`

### `tutorial`

用于检查教程展示与 scrollytelling 阅读体验：

- `/<slug>`
- `/<slug>/request`

### `creator`

用于检查从草稿编辑到预览的完整作者工作流：

- `/drafts/<draftId>`
- `/drafts/<draftId>/preview`
- `/drafts/<draftId>/preview/request`

### `full`

把上面三组全部跑一遍，适合：

- 设计 token 大改
- 全局导航、卡片、按钮、字体体系重做
- 共享渲染器或共享壳层改造后做回归

## 4. 启动本地站点

在仓库根目录执行：

```bash
PORT=3100 npm run dev
```

默认使用：

- `base_url=http://localhost:3100`

环境要求按范围区分：

- 只看 `/<slug>` 和 `/<slug>/request`：不依赖草稿 DB 数据
- 看 `/drafts*`：需要可用的 `DATABASE_URL`
- 需要生成新草稿并进入预览：还需要 `DEEPSEEK_API_KEY`

## 5. 准备动态数据

如果本轮只看 registry 教程页，可以跳过这一节。  
如果本轮包含 `/drafts*`，先准备一个可用 `draftId`。

### 5.1 优先复用已有草稿

先查现有草稿：

```bash
curl -s http://localhost:3100/api/drafts
```

如果返回里已经有合适草稿，直接取其中一个 `id`。  
如果需要可预览的页面，优先选择：

- `hasTutorialDraft = true`
- 或者已经完成生成、能打开 `/preview`

### 5.2 没有可用草稿时，新建一个

下面是最小示例。源码和教学意图可以替换成当前要 review 的真实内容。

```bash
curl -s -X POST http://localhost:3100/api/drafts \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'EOF'
{
  "sourceItems": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "kind": "snippet",
      "label": "counter.js",
      "content": "export function counter(state = 0, action) {\n  switch (action.type) {\n    case 'increment':\n      return state + 1\n    default:\n      return state\n  }\n}\n",
      "language": "javascript"
    }
  ],
  "teachingBrief": {
    "topic": "Redux counter",
    "audience_level": "beginner",
    "core_question": "How does a reducer evolve into a tiny tutorial?",
    "ignore_scope": "",
    "output_language": "中文"
  }
}
EOF
```

记下返回的 `draft.id`。

### 5.3 需要预览页时，触发生成

```bash
node <<'EOF'
const draftId = 'YOUR_DRAFT_ID';
const url = `http://localhost:3100/api/drafts/${draftId}/generate`;

(async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ generationVersion: 'v2' }),
  });

  if (!res.body) return;
  const reader = res.body.getReader();
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
})();
EOF
```

生成完成后，以下页面应可访问：

- `/drafts/<draftId>`
- `/drafts/<draftId>/preview`
- `/drafts/<draftId>/preview/request`

## 6. 建立本轮 Manifest

每一轮 review 都先写一个路由清单，不要直接口头记忆。

建议在 `tmp/ui-review/<run_id>/manifest.md` 里记录：

- `run_id`
- `base_url`
- 当前 git commit / branch
- 这轮使用的 `draftId`
- 这轮使用的 `slug`
- viewport 参数
- 路由与截图文件名映射

推荐表格模板：

```markdown
| key | route | requires | state | note |
|-----|-------|----------|-------|------|
| home | / | none | default | 首页 |
| new | /new | none | default | 创建页 |
| drafts | /drafts | db | default | 草稿列表 |
| tutorial-static | /sample | none | default | registry 教程 |
| tutorial-remote | /sample/request | none | loading/success | 远程加载教程 |
| draft-workspace | /drafts/<draftId> | draft | success | 编辑器主视图 |
| draft-preview | /drafts/<draftId>/preview | draft | success | 草稿直出预览 |
| draft-preview-remote | /drafts/<draftId>/preview/request | draft | success | 草稿远程预览 |
```

如果某一轮要审查特定状态，也把状态写清楚，例如：

- `default`
- `loading`
- `error`
- `empty`
- `drawer-open`
- `validation-error`
- `generation-running`

## 7. 截图

### 7.1 创建目录

```bash
RUN_ID=2026-04-10-baseline
BASE_URL=http://localhost:3100
SCREENSHOT_DIR=tmp/ui-review/$RUN_ID/screenshots

mkdir -p "$SCREENSHOT_DIR" "tmp/ui-review/$RUN_ID/prompts"
```

### 7.2 推荐的 Playwright 截图函数

桌面端：

```bash
capture_desktop() {
  local path="$1"
  local name="$2"

  npx -y playwright@latest screenshot \
    --browser=chromium \
    --device='Desktop Chrome' \
    --viewport-size='1440,1100' \
    --wait-for-timeout=1800 \
    --full-page \
    "${BASE_URL}${path}" \
    "${SCREENSHOT_DIR}/${name}.png"
}
```

移动端：

```bash
capture_mobile() {
  local path="$1"
  local name="$2"

  npx -y playwright@latest screenshot \
    --browser=chromium \
    --device='iPhone 13' \
    --wait-for-timeout=1800 \
    --full-page \
    "${BASE_URL}${path}" \
    "${SCREENSHOT_DIR}/${name}.png"
}
```

如果本机 Playwright 设备预设或浏览器依赖不完整，移动端截图可退回到固定 viewport，保持同一轮前后对比一致即可：

```bash
capture_mobile() {
  local path="$1"
  local name="$2"

  npx -y playwright@latest screenshot \
    --browser=chromium \
    --viewport-size='390,844' \
    --wait-for-timeout=1800 \
    --full-page \
    "${BASE_URL}${path}" \
    "${SCREENSHOT_DIR}/${name}.png"
}
```

示例：

```bash
capture_desktop "/" "home-desktop"
capture_desktop "/new" "new-desktop"
capture_desktop "/sample" "tutorial-static-desktop"
capture_mobile "/sample" "tutorial-static-mobile"
capture_desktop "/drafts/$DRAFT_ID" "draft-workspace-desktop"
```

### 7.3 状态截图建议

默认全页截图不够时，额外补下列状态：

- 抽屉打开态
- Hover/Active 明显影响布局或视觉时
- 表单报错态
- 空列表态
- 加载态
- 远程请求失败态
- 生成进行中态

状态截图命名建议：

- `new-validation-error-desktop.png`
- `draft-workspace-generation-running-desktop.png`
- `tutorial-static-mobile-drawer-open.png`

## 8. 用模型做视觉审查

### 8.1 项目默认做法

当前仓库默认沿用 Gemini CLI，规则如下：

- 不显式传 `-m`
- 不并行跑多张截图
- 一次只审一张图
- 每拿到一页结果就立刻写入结果文档

如果后续换模型，也保留这几个流程约束：

- 单图审查
- 单页落盘
- 先局部、后汇总

### 8.2 单页 prompt 模板

把下面模板存成 `tmp/ui-review/<run_id>/prompts/<key>.md`：

```markdown
请读取并审查这张截图：@{<screenshot_path>}。

补充上下文：
- 项目：VibeDocs
- 路由：<route>
- 页面状态：<state>
- 设备：<viewport>

你的任务：
1. 用中文 markdown 输出。
2. 先给一句总评。
3. 再给 4-6 条尖锐问题。
4. 再给 4-6 条可执行优化建议。
5. 问题与建议优先关注：
   - 信息层级
   - 间距密度
   - 品牌色与视觉系统
   - 组件一致性
   - 交互反馈与状态表达
   - 响应式/可读性
6. 不讨论代码实现。
7. 只基于截图发言，不猜测未展示区域。
```

### 8.3 Gemini CLI 命令模板

```bash
gemini -p "$(cat tmp/ui-review/$RUN_ID/prompts/<key>.md)" --output-format text
```

推荐顺序：

1. 先看公共壳层
2. 再看教程消费页
3. 再看草稿工作区
4. 最后看预览页和远程页

### 8.4 网络或认证异常

如果 Gemini 没进入图片审查，而是重新触发认证或明显卡死：

1. 取消当前任务
2. 杀掉残留 Gemini 进程
3. 等 30 到 40 秒
4. 只重试当前这张图，不要顺手开下一张

可用命令：

```bash
pkill -9 -f '/Users/chen/.volta/tools/image/node/24.14.1/bin/gemini' || true
pkill -9 -f '/Users/chen/.nvm/versions/node/v24.14.1/bin/gemini' || true
sleep 35
```

## 9. 沉淀结果

推荐新建本轮结果文件：

- `docs/ui-reviews/<run_id>.md`

建议结构：

```markdown
# UI Review - <run_id>

## Review Setup
- base_url:
- commit:
- scope:
- viewport_set:
- draftId:
- slug:

## Route Findings

### `<route>`
- screenshot:
- state:
- total:

#### 问题
1. ...
2. ...

#### 优化建议
1. ...
2. ...

## Cross-Page Themes
1. ...
2. ...

## Priority
1. P0
2. P1

## Fix Plan
1. ...
2. ...
```

如果只是一次快速补充，也可以继续写到 `docs/ui-issus`，但要注明：

- 日期
- 运行范围
- 截图目录
- 对应 commit

## 10. 从审查结果变成修复任务

### 10.1 拆分原则

修复任务必须按文件所有权拆，而不是按“页面看起来差不多”拆。

规则：

- 共享样式文件只给一个任务
- 共享渲染器只给一个任务
- 只要有交叉写文件，就不要并行
- 每个任务都要写清楚允许修改哪些文件
- 每个任务的 prompt 尽量做到“只读指定文件就能完成”，不要让模型自己全仓库搜索
- 如果任务需要改共享组件，prompt 必须列出所有已知消费路径和需要人工验证的路由
- 如果一个任务同时包含视觉改造、交互状态和数据流变化，先拆开；Gemini 一次只处理其中一个小目标

### 10.2 当前项目的常见拆分面

| 修复面 | 常见文件 |
|--------|----------|
| 设计 token / UI 原语 | `app/globals.css`, `components/ui/*` |
| 应用壳层 / 导航 | `components/app-shell.tsx`, `app/page.jsx`, `app/new/page.tsx`, `app/drafts/page.tsx` |
| 创建页表单 | `components/create-draft-form.tsx`, `components/code-mirror-editor.tsx` |
| 草稿列表 | `components/drafts-page.tsx`, `lib/draft-status.ts` |
| 草稿工作区 | `components/draft-workspace.tsx`, `components/step-list.tsx`, `components/step-editor.tsx`, `components/draft-meta-editor.tsx`, `components/markdown-editor.tsx`, `components/generation-progress.tsx` |
| 教程展示 | `components/tutorial/tutorial-scrolly-demo.jsx`, `components/tutorial/scrolly-code-frame.jsx`, `components/tutorial/scrolly-step-rail.jsx`, `components/tutorial/create-cta.tsx`, `components/remote-tutorial-page.jsx`, `components/remote-preview-page.tsx`, `app/[slug]/page.jsx`, `app/[slug]/request/page.jsx` |

### 10.3 先生成迭代计划

不要把完整 review 结果一次性丢给 Gemini 改。先人工整理成 sprint 级计划，再逐个小任务执行。

每个 sprint 至少写清楚：

- `scope`：本轮只收敛哪一组页面或交互，例如 `tutorial`、`shell`、`creator`
- `goal`：本轮结束时用户能感知到的变化
- `included_findings`：来自 review 结果的具体问题编号或原文摘要
- `task_order`：任务顺序，按共享文件优先、依赖关系优先排列
- `allowed_files`：每个任务的文件所有权
- `verification_routes`：本轮必须复测的路由、viewport、页面状态
- `acceptance`：截图、构建、测试和人工检查标准

示例：

```markdown
## Sprint 1: 教程阅读页收尾

目标：改善教程消费页的定位感、结束反馈、代码可操作性和代码宽度。

任务：
1. 面包屑与顶部上下文
   - allowed_files: `components/tutorial/tutorial-scrolly-demo.jsx`, `components/remote-tutorial-page.jsx`
   - verify: `/sample`, `/sample/request`
2. 教程完成区和底部 CTA
   - allowed_files: `components/tutorial/tutorial-scrolly-demo.jsx`, `components/tutorial/create-cta.tsx`
   - verify: `/sample`, `/sample/request`, draft preview if available
3. 代码复制反馈
   - allowed_files: `components/tutorial/scrolly-code-frame.jsx`
   - verify: desktop code frame, mobile code block
4. 代码宽度微调
   - allowed_files: `components/tutorial/scrolly-code-frame.jsx`, `app/globals.css`
   - verify: code focus/mark/change indicators still visible
```

经验规则：

- 先改共享渲染器，再改入口页 wrapper，避免同一逻辑在静态页和远程页重复出现。
- 对 `components/tutorial/tutorial-scrolly-demo.jsx` 这类共享渲染器，必须同时考虑静态直出、远程加载和草稿预览。
- 对底部 CTA、面包屑这类“看起来像页面 chrome”的内容，要确认是否应该由共享渲染器负责，还是由入口页负责；不能两边都渲染。
- 对“隐藏/透明/减少占位”的用户反馈，要明确写进任务目标，例如不要恢复左侧状态栏、不要重新挤压正文宽度。

### 10.4 修复 prompt 模板

每个任务一份 prompt，建议放到：

- `tmp/ui-review/<run_id>/prompts/fix-<task>.md`

模板：

```markdown
你是 UI/UX 修复专家。本仓库是 Next.js + Tailwind CSS 项目。

## 只阅读这些文件
@{<source_file_1>}
@{<source_file_2>}

## 目标
修复 <route/group> 的 UI 问题。

## 必须解决的问题
1. ...
2. ...

## 允许修改的文件
- ...
- ...

## 约束
- 只修改上面列出的文件
- 不要阅读或修改未列出的文件
- 不要运行 shell/npm/git 命令
- 不改变业务逻辑
- 保持 Tailwind 方案
- 不回退不相关页面
- 不使用 `tracking-*`、`text-[clamp(...)]`、大圆角（超过 `rounded-lg`）或大面积深色卡片
- 输出简短说明：改了哪些文件，解决了哪些问题
```

如果任务需要 review 背景，不要让 Gemini 阅读整份 `docs/ui-reviews/<run_id>.md`。优先把相关 finding 摘要直接写入 prompt，减少模型误改范围。

### 10.5 分配给 Gemini 执行

推荐命令：

```bash
gemini --approval-mode auto_edit \
  -p "$(cat tmp/ui-review/$RUN_ID/prompts/fix-<task>.md)" \
  --output-format text
```

执行规则：

- 一次只跑一个修复 prompt。
- Gemini 返回网络错误、`ECONNRESET` 或 MCP warning 时，只重试当前任务，不顺手扩大范围。
- Gemini 完成后先看 `git diff -- <allowed_files>`，确认没有越界修改。
- 如果 Gemini 新增了 helper 但没有接入调用点，人工补齐接入，而不是继续把同一任务扩大重跑。
- 如果 Gemini 改到了共享渲染器，人工检查所有入口是否出现重复 UI，例如重复面包屑、重复 CTA、重复 loading header。
- 对带可选数据的 UI，例如 `slug`、`title`、`highlighted.code`，人工确认空值路径；需要时让 UI 条件渲染，不要让预览页出现无意义 CTA。
- 对教程代码块，复制内容优先使用干净源码字段；如果只能拿到带注释或标注的 highlighted 值，宁可禁用复制按钮，也不要复制污染后的代码。
- 每个任务结束后再进入下一个 prompt。不要让多个 Gemini 任务同时写同一文件。

## 11. 修复后验证

每轮修复结束后，至少做这 4 件事：

1. 用同一份 manifest 再截图一轮。
2. 用同一类 prompt 再做一轮 focused review。
3. 人工对比修复前后截图，确认不是“换了风格但没解决问题”。
4. 如果改到了共享组件或共享样式，跑一次 `npm run build`。

建议加一条快速 diff 检查：

```bash
git diff --stat
git diff -- <allowed_file_1> <allowed_file_2>
rg "tracking-|text-\\[clamp|rounded-2xl|rounded-3xl|bg-blue-" app components
```

再次截图时必须保持：

- 同一个 `draftId`
- 同一个 `slug`
- 同一个 viewport
- 同一个页面状态

否则前后对比没有意义。

教程阅读页专项验收清单：

- `/sample` 静态直出和 `/sample/request` 远程加载的阅读 UI 一致。
- 草稿预览页如果没有 `slug`，不显示依赖 published slug 的 CTA。
- 右侧章节切换栏保持透明，不重新占用正文宽度。
- 文章步骤左侧不恢复粗色条状态栏。
- 桌面代码面板和移动端代码块都有可用的复制反馈，且复制内容不是带 CodeHike 标注的展示文本。
- focus、mark、change 指示仍可识别，没有为了省宽度把语义状态删掉。

## 12. 项目级提醒

1. `components/tutorial/tutorial-scrolly-demo.jsx` 同时服务于静态直出、远程加载、草稿预览，改它时必须把这三条消费链路一起审。
2. `/drafts`、`/drafts/<id>`、`/drafts/<id>/preview*` 都依赖草稿数据，review 前先确认数据库和样例数据状态。
3. 草稿 review 不只看“成功态”，还要至少覆盖一个失败态、一个空态或一个 loading 态。
4. 如果某次 review 的目标是全局视觉系统，必须同时截图桌面端和移动端，否则抽屉导航、移动代码块、长列表折叠等问题会漏掉。
5. 本文档描述的是流程基线，不是固定页面清单。每一轮都先写 manifest，再执行截图和审查。
