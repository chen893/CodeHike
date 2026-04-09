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
2. 截图必须保留原始图和缩小图，后续需要回看原始细节。
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
  raw/          # 原始截图
  small/        # 缩小后的审查图
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
RAW_DIR=tmp/ui-review/$RUN_ID/raw
SMALL_DIR=tmp/ui-review/$RUN_ID/small

mkdir -p "$RAW_DIR" "$SMALL_DIR" "tmp/ui-review/$RUN_ID/prompts"
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
    "${RAW_DIR}/${name}.png"
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
    "${RAW_DIR}/${name}.png"
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

## 8. 缩小并标准化截图

模型读图时，缩小版通常更稳定，但原图要保留。

macOS 可用：

```bash
for f in "$RAW_DIR"/*.png; do
  base=$(basename "$f")
  cp "$f" "$SMALL_DIR/$base"
  sips -Z 700 "$SMALL_DIR/$base" >/dev/null
done
```

如果不是 macOS，可用 ImageMagick：

```bash
for f in "$RAW_DIR"/*.png; do
  base=$(basename "$f")
  magick "$f" -resize 700x700\> "$SMALL_DIR/$base"
done
```

## 9. 用模型做视觉审查

### 9.1 项目默认做法

当前仓库默认沿用 Gemini CLI，规则如下：

- 不显式传 `-m`
- 不并行跑多张截图
- 一次只审一张图
- 每拿到一页结果就立刻写入结果文档

如果后续换模型，也保留这几个流程约束：

- 单图审查
- 单页落盘
- 先局部、后汇总

### 9.2 单页 prompt 模板

把下面模板存成 `tmp/ui-review/<run_id>/prompts/<key>.md`：

```markdown
请读取并审查这张截图：@{<small_png_path>}。

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

### 9.3 Gemini CLI 命令模板

```bash
gemini -p "$(cat tmp/ui-review/$RUN_ID/prompts/<key>.md)" --output-format text
```

推荐顺序：

1. 先看公共壳层
2. 再看教程消费页
3. 再看草稿工作区
4. 最后看预览页和远程页

### 9.4 网络或认证异常

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

## 10. 沉淀结果

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

## 11. 从审查结果变成修复任务

### 11.1 拆分原则

修复任务必须按文件所有权拆，而不是按“页面看起来差不多”拆。

规则：

- 共享样式文件只给一个任务
- 共享渲染器只给一个任务
- 只要有交叉写文件，就不要并行
- 每个任务都要写清楚允许修改哪些文件

### 11.2 当前项目的常见拆分面

| 修复面 | 常见文件 |
|--------|----------|
| 设计 token / UI 原语 | `app/globals.css`, `components/ui/*` |
| 应用壳层 / 导航 | `components/app-shell.tsx`, `app/page.jsx`, `app/new/page.tsx`, `app/drafts/page.tsx` |
| 创建页表单 | `components/create-draft-form.tsx`, `components/code-mirror-editor.tsx` |
| 草稿列表 | `components/drafts-page.tsx`, `lib/draft-status.ts` |
| 草稿工作区 | `components/draft-workspace.tsx`, `components/step-list.tsx`, `components/step-editor.tsx`, `components/draft-meta-editor.tsx`, `components/markdown-editor.tsx`, `components/generation-progress.tsx` |
| 教程展示 | `components/tutorial-scrolly-demo.jsx`, `components/remote-tutorial-page.jsx`, `components/remote-preview-page.tsx`, `app/[slug]/page.jsx`, `app/[slug]/request/page.jsx` |

### 11.3 修复 prompt 模板

每个任务一份 prompt，建议放到：

- `tmp/ui-review/<run_id>/prompts/fix-<task>.md`

模板：

```markdown
你是 UI/UX 修复专家。本仓库是 Next.js + Tailwind CSS 项目。

## 先阅读
@{<source_file_1>}
@{<source_file_2>}
@{docs/ui-review-workflow.md}
@{docs/ui-reviews/<run_id>.md}

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
- 不改变业务逻辑
- 保持 Tailwind 方案
- 不回退不相关页面
```

## 12. 修复后验证

每轮修复结束后，至少做这 4 件事：

1. 用同一份 manifest 再截图一轮。
2. 用同一类 prompt 再做一轮 focused review。
3. 人工对比修复前后截图，确认不是“换了风格但没解决问题”。
4. 如果改到了共享组件或共享样式，跑一次 `npm run build`。

再次截图时必须保持：

- 同一个 `draftId`
- 同一个 `slug`
- 同一个 viewport
- 同一个页面状态

否则前后对比没有意义。

## 13. 项目级提醒

1. `components/tutorial-scrolly-demo.jsx` 同时服务于静态直出、远程加载、草稿预览，改它时必须把这三条消费链路一起审。
2. `/drafts`、`/drafts/<id>`、`/drafts/<id>/preview*` 都依赖草稿数据，review 前先确认数据库和样例数据状态。
3. 草稿 review 不只看“成功态”，还要至少覆盖一个失败态、一个空态或一个 loading 态。
4. 如果某次 review 的目标是全局视觉系统，必须同时截图桌面端和移动端，否则抽屉导航、移动代码块、长列表折叠等问题会漏掉。
5. 本文档描述的是流程基线，不是固定页面清单。每一轮都先写 manifest，再执行截图和审查。
