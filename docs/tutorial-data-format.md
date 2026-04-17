# Scrollytelling Tutorial Structured Data Format

> 本文档定义了一套面向 AI 生成的增量式代码教程数据格式。AI 只需输出 JSON，前端根据 JSON 渲染出 scrollytelling 交互页面——左侧代码随滚动切换高亮，右侧正文逐段推进。

---

## 目录

1. [设计目标](#1-设计目标)
2. [整体架构](#2-整体架构)
3. [数据结构定义](#3-数据结构定义)
4. [Patch 机制详解](#4-patch-机制详解)
5. [代码组装算法](#5-代码组装算法)
6. [行号计算与注解映射](#6-行号计算与注解映射)
7. [前端渲染流程](#7-前端渲染流程)
8. [AI 生成指南](#8-ai-生成指南)
9. [错误处理与校验](#9-错误处理与校验)
10. [方案对比与选型依据](#10-方案对比与选型依据)
11. [完整示例](#11-完整示例)
12. [多文件支持](#12-多文件支持)

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| **AI 友好** | AI 不需要数行号、不需要跟踪多步偏移，只需 "找到旧代码 → 写出新代码" |
| **Token 经济** | 第一步给完整代码，后续步骤只描述变化部分，节省约 60% token |
| **可校验** | 每一步 patch 都能在运行时验证——找不到匹配直接报错，不会静默错位 |
| **通用** | 不绑定特定教程主题或编程语言，同一套结构可用于任何代码教学场景 |

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────┐
│  AI 输出                                            │
│  structured-tutorial.json                           │
│  (baseCode + steps × patches)                       │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  组装层 (buildTutorial)                             │
│                                                     │
│  1. 取 baseCode 作为 step[0] 的完整代码             │
│  2. 逐步应用 patches，产出每一步的完整代码快照      │
│  3. 用 focus/marks 的内容锚定计算实际行号            │
│  4. 调用 codehike highlight() 语法高亮               │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  渲染层 (ScrollyTutorial)                           │
│                                                     │
│  ┌──────────────┬─────────────────────┐             │
│  │  code-column │   article-column    │             │
│  │  (sticky)    │   (scrollable)      │             │
│  │              │                     │             │
│  │  当前步骤的  │  intro              │             │
│  │  高亮代码    │  step 0 (Selectable)│             │
│  │              │  step 1 (Selectable)│             │
│  │              │  ...                │             │
│  │              │  step N (Selectable)│             │
│  └──────────────┴─────────────────────┘             │
│                                                     │
│  IntersectionObserver 驱动 selectedIndex             │
│  切换左侧代码显示                                    │
└─────────────────────────────────────────────────────┘
```

---

## 3. 数据结构定义

### 3.1 顶层结构

```typescript
interface TutorialData {
  /** 教程元信息 */
  meta: TutorialMeta

  /** 滚动前的引言区 */
  intro: TutorialIntro

  /**
   * 第一步的完整代码。支持两种格式：
   * - 单文件：string — 传统格式，整个教程只涉及一个文件
   * - 多文件：Record<string, string> — 文件名 → 代码内容
   *   例如：{ "store.js": "...", "helpers.js": "..." }
   */
  baseCode: string | Record<string, string>

  /** 教程步骤序列 */
  steps: TutorialStep[]
}
```

### 3.2 TutorialMeta

```typescript
interface TutorialMeta {
  /** 教程标题 */
  title: string

  /**
   * 语法高亮语言，如 "js", "python", "rust"。
   * 单文件模式必填；多文件模式下可选（系统从 fileName 推导）。
   */
  lang?: string

  /**
   * 主文件名，用于代码区右上角显示和单文件高亮。
   * 单文件模式必填；多文件模式下可选（默认取 baseCode 第一个键）。
   */
  fileName?: string

  /** 教程简介（必填） */
  description: string
}
```

> **多文件约定**：当 `baseCode` 为 `Record` 时，`lang` 和 `fileName` 可省略。系统通过 `normalizeBaseCode()` 从文件名推导语言，并取第一个键作为主文件。AI 生成后由 `normalizeTutorialMeta()` 自动补全。

### 3.3 TutorialIntro

```typescript
interface TutorialIntro {
  /** 引言段落数组，每段是一个字符串 */
  paragraphs: string[]
}
```

### 3.4 TutorialStep

```typescript
interface TutorialStep {
  /** 步骤唯一标识，用于 URL 锚点跳转 */
  id: string

  /** 步骤眉标，如 "State", "Read", "Dispatch" */
  eyebrow?: string

  /** 步骤标题 */
  title: string

  /** 导语（紧跟标题后的段落） */
  lead?: string

  /** 正文段落数组 */
  paragraphs: string[]

  /** 代码变更 patches（可选——无变更时省略） */
  patches?: ContentPatch[]

  /** 高亮区域（用内容锚定，组装时计算行号） */
  focus?: ContentRange | null

  /** 标记行（用内容锚定，组装时计算行号） */
  marks?: ContentMark[]

  /** 教学目标（v3.1 大纲阶段生成） */
  teachingGoal?: string

  /** 引入的概念（v3.1 大纲阶段生成） */
  conceptIntroduced?: string
}
```

### 3.5 ContentPatch

```typescript
interface ContentPatch {
  /**
   * 要在代码中查找的文本片段。
   * 必须在当前步骤的完整代码中唯一匹配。
   * 足够长的上下文可以避免歧义。
   */
  find: string

  /**
   * 替换后的文本。
   * 为空字符串时等效于删除。
   */
  replace: string

  /**
   * 多文件模式下，指定此 patch 操作的目标文件名。
   * 省略时默认操作主文件（primaryFile）。
   * 单文件模式下忽略此字段。
   */
  file?: string
}
```

### 3.6 ContentRange（内容锚定的行范围）

```typescript
interface ContentRange {
  /**
   * 要高亮的代码片段。
   * 系统会在组装后的完整代码中搜索这段文本，
   * 自动计算起止行号。
   */
  find: string

  /**
   * 多文件模式下，指定此 focus 所属的文件名。
   * 省略时默认指向主文件。
   */
  file?: string
}
```

### 3.7 ContentMark（内容锚定的标记行）

```typescript
interface ContentMark {
  /**
   * 要标记的代码行文本。
   * 必须在完整代码中唯一匹配。
   */
  find: string

  /** 标记颜色，CSS 合法颜色值 */
  color: string

  /**
   * 多文件模式下，指定此 mark 所属的文件名。
   * 省略时默认指向主文件。
   */
  file?: string
}
```

---

## 4. Patch 机制详解

### 4.1 核心原则

Patch 的本质是 **内容定位的 find/replace**：

- **`find`**: 在当前步骤的完整代码中搜索这段文本
- **`replace`**: 用这段文本替换找到的内容

AI 不需要知道行号。AI 只需要做两件事：
1. 看着当前代码，定位要修改的区域
2. 写出修改后的样子

### 4.2 操作语义

| 意图 | find | replace |
|------|------|---------|
| **插入** | 锚点位置的代码 | 原代码 + 新代码 |
| **替换** | 要改掉的代码 | 改完的代码 |
| **删除** | 要删掉的代码 | `""`（空字符串） |

### 4.3 插入的写法

插入不是独立的操作，而是 **扩写 find 的上下文，把新代码拼进 replace**。

```
插入前:
  let state = reducer(undefined, { type: "@@INIT" })

  return {}

插入后:
  let state = reducer(undefined, { type: "@@INIT" })

  function getState() {       ← 新增
    return state              ← 新增
  }                           ← 新增

  return {
    getState,                 ← 新增
  }
```

对应的 patch：

```json
{
  "find": "  let state = reducer(undefined, { type: \"@@INIT\" })\n\n  return {}",
  "replace": "  let state = reducer(undefined, { type: \"@@INIT\" })\n\n  function getState() {\n    return state\n  }\n\n  return {\n    getState,\n  }"
}
```

**关键**：`find` 包含了插入点前后的上下文，`replace` 把原内容原样保留，只在中间插入新代码。

### 4.4 同一步多个 Patch

一个步骤可以有多个 patch，按数组顺序依次应用。

```json
{
  "patches": [
    {
      "find": "  function getState() {\n    return state\n  }\n\n  return {",
      "replace": "  function getState() {\n    return state\n  }\n\n  function subscribe(listener) {\n    listeners.push(listener)\n\n    return () => {\n      listeners = listeners.filter((item) => item !== listener)\n    }\n  }\n\n  return {"
    },
    {
      "find": "    getState,\n  }",
      "replace": "    getState,\n    subscribe,\n  }"
    }
  ]
}
```

**规则**：多个 patch 按顺序执行。后一个 patch 的 `find` 必须在前一个 patch 应用后的代码中查找。因此，如果前面的 patch 影响了后面的 `find` 区域，需要确保 `find` 内容与更新后的代码一致。

### 4.5 无代码变更的步骤

有些步骤只改变高亮区域，不改变代码内容。此时省略 `patches` 字段即可。

```json
{
  "id": "state-highlight",
  "eyebrow": "State",
  "title": "注意这行初始化代码",
  "lead": "...",
  "paragraphs": ["..."],
  "focus": { "find": "let state = reducer(undefined, { type: \"@@INIT\" })" }
}
```

---

## 5. 代码组装算法

### 5.1 主流程

```
输入: baseCode, steps[]
输出: steps[]（每步附带 fullCode 和计算后的行号）

1. currentCode = baseCode
2. 对每个 step:
   a. 如果 step.patches 存在:
      - 按顺序应用每个 patch (find → replace)
      - 更新 currentCode
   b. step.fullCode = currentCode
   c. 如果 step.focus 存在:
      - 在 currentCode 中搜索 focus.find
      - 计算 startLine, endLine
   d. 如果 step.marks 存在:
      - 对每个 mark，在 currentCode 中搜索 mark.find
      - 计算 line 行号
3. 返回组装后的 steps
```

### 5.2 applyContentPatches 实现

```javascript
function applyContentPatches(code, patches) {
  let result = code
  for (const patch of patches) {
    const firstIndex = result.indexOf(patch.find)

    if (firstIndex === -1) {
      throw new Error(
        `Patch 匹配失败: 找不到以下代码片段:\n${patch.find}`
      )
    }

    // 检查是否有多处匹配（歧义检测）
    const secondIndex = result.indexOf(patch.find, firstIndex + 1)
    if (secondIndex !== -1) {
      throw new Error(
        `Patch 匹配歧义: 以下代码片段出现了多次，请提供更长的上下文:\n${patch.find}`
      )
    }

    result =
      result.slice(0, firstIndex) +
      patch.replace +
      result.slice(firstIndex + patch.find.length)
  }
  return result
}
```

### 5.3 行号计算

```javascript
function findLineRange(code, searchText) {
  const lines = code.split("\n")
  const index = code.indexOf(searchText)

  if (index === -1) {
    throw new Error(`找不到高亮目标: ${searchText}`)
  }

  // 计算起始行号（1-indexed）
  let startLine = 1
  for (let i = 0; i < index; i++) {
    if (code[i] === "\n") startLine++
  }

  // 计算结束行号
  let endLine = startLine
  for (let i = 0; i < searchText.length; i++) {
    if (searchText[i] === "\n") endLine++
  }

  return { startLine, endLine }
}

function findLineNumber(code, searchText) {
  const { startLine } = findLineRange(code, searchText)
  return startLine
}
```

### 5.4 完整组装函数

```javascript
function assembleTutorial(data) {
  const steps = []
  let currentCode = data.baseCode

  for (const step of data.steps) {
    // 应用 patches
    if (step.patches && step.patches.length > 0) {
      currentCode = applyContentPatches(currentCode, step.patches)
    }

    const assembled = { ...step, fullCode: currentCode }

    // 计算 focus 行号
    if (step.focus) {
      assembled.focusRange = findLineRange(currentCode, step.focus.find)
    }

    // 计算 marks 行号
    if (step.marks) {
      assembled.markLines = step.marks.map((mark) => ({
        line: findLineNumber(currentCode, mark.find),
        color: mark.color,
      }))
    }

    steps.push(assembled)
  }

  return { ...data, steps }
}
```

---

## 6. 行号计算与注解映射

### 6.1 两种注解类型

| 注解 | 作用 | 数据来源 |
|------|------|----------|
| **focus** | 滚动到某一步时，高亮指定代码区域，其余区域变暗 | `step.focus.find` → 计算起止行号。编辑器支持交互式行选择（点击/Shift+点击确定范围）自动填充 find 文本 |
| **mark** | 在指定行左侧画竖线标记 | `step.marks[].find` → 计算行号。编辑器支持 mark 模式下点击行自动生成 mark 条目 |

### 6.2 映射为 codehike 注解

组装完成后，将行号注解注入到代码字符串中，供 codehike 的 `highlight()` 解析：

```javascript
function injectAnnotations(code, focusRange, markLines) {
  const lines = code.split("\n")

  // 注入 focus 标记
  if (focusRange) {
    const before = "  // !focus(start)\n"
    const after = "  // !focus(end)\n"
    lines.splice(focusRange.startLine - 1, 0, before.trimEnd())
    lines.splice(focusRange.endLine + 1, 0, after.trimEnd())
  }

  // 注入 mark 标记
  if (markLines) {
    for (const mark of markLines) {
      const line = lines[mark.line - 1]
      lines[mark.line - 1] = line + `  // !mark(1) ${mark.color}`
    }
  }

  return lines.join("\n")
}
```

> 注：具体注入格式取决于 codehike 版本。此处的 `!focus`/`!mark` 是示意，实际可能需要用 codehike 的 annotation API 直接构建注解对象，而非注入注释。

---

## 7. 前端渲染流程

### 7.1 组件树

```
<ScrollyTutorial data={tutorialData} />
  └─ <SelectionProvider className="editorial-grid">
       ├─ <aside className="code-column">
       │    └─ <SelectedCodeFrame steps={assembledSteps} />
       │         └─ <CodeFrame title={step.eyebrow} code={step.highlighted} />
       │              └─ <Pre handlers={[focus, mark, tokenTransitions]} />
       │
       └─ <div className="article-column">
            ├─ <section className="article-intro">
            │    ├─ <h1>{meta.title}</h1>
            │    └─ <p>× N  (intro.paragraphs)
            │
            └─ <Selectable className="article-step"> × N
                 └─ <article className="article-step-inner">
                      ├─ <p className="article-step-kicker">{step.eyebrow}</p>
                      ├─ <h2>{step.title}</h2>
                      ├─ <p>{step.lead}</p>
                      └─ <p>× N  (step.paragraphs)
```

### 7.2 数据流

```
                    服务端
                      │
    ┌─────────────────┼─────────────────┐
    │                 │                 │
    ▼                 ▼                 ▼
 assembleTutorial  highlight()      引用 steps
 (patch → 完整代码) (语法高亮)      (文字内容)
    │                 │                 │
    └─────────────────┼─────────────────┘
                      │
                      ▼
                 客户端组件
                      │
           ┌──────────┴──────────┐
           ▼                     ▼
     code-column           article-column
     (selectedIndex 切换    (Selectable × N
      显示哪步的代码)        驱动 selectedIndex)
```

### 7.3 服务端与客户端的分工

| 阶段 | 执行环境 | 职责 |
|------|----------|------|
| 组装 | 服务端 | patch 应用、行号计算、注解注入 |
| 高亮 | 服务端 | codehike `highlight()` 生成 token 树 |
| 渲染 | 服务端 | 文字内容、HTML 结构 |
| 交互 | 客户端 | scroll 检测、代码切换、过渡动画 |

---

## 8. AI 生成指南

### 8.1 Prompt 模板

```
你是一个代码教程生成器。请根据主题生成一个 JSON 格式的代码教程。

输出格式要求：
{
  "meta": {
    "title": "教程标题",
    "lang": "js",
    "fileName": "index.js",
    "description": "一句话简介"
  },
  "intro": {
    "paragraphs": ["引言段落1", "引言段落2"]
  },
  "baseCode": "第一步的完整代码（是一个合法的可运行文件）",
  "steps": [
    {
      "id": "唯一英文标识",
      "eyebrow": "步骤标签",
      "title": "步骤标题",
      "lead": "导语段落",
      "paragraphs": ["正文段落1", "正文段落2"],
      "patches": [
        {
          "find": "当前代码中要修改的那段文本（必须唯一匹配）",
          "replace": "修改后的文本"
        }
      ],
      "focus": {
        "find": "要高亮的代码片段"
      },
      "marks": [
        { "find": "要标记的代码行", "color": "rgb(143 210 193)" }
      ]
    }
  ]
}

规则：
1. baseCode 必须是第一步的完整可运行代码
2. 每个步骤的 patches 是相对上一步代码的增量变更
3. find 必须在当前代码中唯一匹配。如果代码中有重复片段，
   用更长的上下文来区分
4. patches 按数组顺序依次应用
5. focus.find 指定本步要高亮的代码区域
6. marks 标记特殊行（如新增行、关键变化行）
7. 如果某步没有代码变更，省略 patches
8. 每步只引入一个概念，保持变化最小化
```

### 8.2 AI 生成时的注意事项

**find 唯一性**

`find` 必须在当前步骤的完整代码中只出现一次。如果出现多次，系统会报错。AI 应该通过包含更多上下文来消除歧义。

```
# 错误 — "return state" 在代码中可能出现多次
{ "find": "return state", ... }

# 正确 — 包含足够的上下文使匹配唯一
{ "find": "function getState() {\n    return state\n  }", ... }
```

**多 patch 顺序**

同一步内的多个 patch 按数组顺序依次应用。如果第一个 patch 修改了第二个 patch 的 `find` 区域，第二个 patch 的 `find` 必须使用修改后的内容。

```
# Step 内有两个 patches:
# Patch 1: 在 getState 后面插入 subscribe 函数
# Patch 2: 在 return 对象里加上 subscribe

# Patch 2 的 find 必须反映 Patch 1 之前的状态
# （因为 patches 是依次应用的）
#
# 注意：更安全的做法是让多个 patches 修改不重叠的区域
```

**建议**：尽量让同一步内的多个 patches 操作不同的代码区域，避免相互依赖。

**空行处理**

`find` 中的换行符 `\n` 必须与代码中的实际换行完全匹配。空行就是两个连续的 `\n`。

---

## 9. 错误处理与校验

### 9.1 运行时校验

组装层在应用每个 patch 时执行以下校验：

| 校验项 | 条件 | 错误信息 |
|--------|------|----------|
| **匹配失败** | `find` 在代码中找不到 | "Patch 匹配失败: 找不到以下代码片段" |
| **匹配歧义** | `find` 在代码中出现多次 | "Patch 匹配歧义: 请提供更长的上下文" |
| **focus 找不到** | `focus.find` 在代码中找不到 | "找不到高亮目标" |
| **mark 找不到** | `mark.find` 在代码中找不到 | "找不到标记目标" |

### 9.2 校验函数

```javascript
function validateTutorial(data) {
  const errors = []

  // 基础校验
  if (!data.meta?.title) errors.push("meta.title 缺失")
  if (!data.meta?.lang) errors.push("meta.lang 缺失")
  if (!data.baseCode) errors.push("baseCode 缺失")
  if (!data.steps?.length) errors.push("steps 为空")

  // 逐步校验 patch 可应用性
  let currentCode = data.baseCode
  for (let i = 0; i < data.steps.length; i++) {
    const step = data.steps[i]

    if (!step.id) errors.push(`steps[${i}].id 缺失`)
    if (!step.title) errors.push(`steps[${i}].title 缺失`)

    // 校验 patches
    if (step.patches) {
      for (let j = 0; j < step.patches.length; j++) {
        const patch = step.patches[j]
        const count = countOccurrences(currentCode, patch.find)

        if (count === 0) {
          errors.push(
            `steps[${i}].patches[${j}]: find 在代码中找不到\n` +
            `  find: ${patch.find.slice(0, 80)}...`
          )
        } else if (count > 1) {
          errors.push(
            `steps[${i}].patches[${j}]: find 匹配了 ${count} 处，存在歧义\n` +
            `  find: ${patch.find.slice(0, 80)}...`
          )
        }
      }

      // 模拟应用（不改变 currentCode，用于后续校验）
      try {
        currentCode = applyContentPatches(currentCode, step.patches)
      } catch (e) {
        errors.push(`steps[${i}]: patch 应用失败 — ${e.message}`)
      }
    }

    // 校验 focus
    if (step.focus) {
      const idx = currentCode.indexOf(step.focus.find)
      if (idx === -1) {
        errors.push(`steps[${i}].focus: find 在代码中找不到`)
      }
    }

    // 校验 marks
    if (step.marks) {
      for (const mark of step.marks) {
        const idx = currentCode.indexOf(mark.find)
        if (idx === -1) {
          errors.push(`steps[${i}].marks: "${mark.find.slice(0, 40)}" 在代码中找不到`)
        }
      }
    }
  }

  return errors
}

function countOccurrences(text, search) {
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++
    pos += search.length
  }
  return count
}
```

### 9.3 运行时生成状态不属于 Tutorial DSL

- `TutorialData` / `TutorialDraft` 只描述教程内容本身，不承载运行时生成任务状态。
- 生成过程中的 `status / phase / heartbeat / retry / errorCode / modelId` 持久化在 `draft_generation_jobs` 表；`drafts.activeGenerationJobId` 只负责指向当前 active job。
- `modelId` 使用 provider 前缀区分模型来源（如 `deepseek/deepseek-chat`、`minimax/MiniMax-M2.7`），仅影响生成时 provider 选择和 token 预算，不进入 DSL 语义；当前默认值为 `minimax/MiniMax-M2.7`。
- 生成服务在开始时创建唯一 job；大纲、步骤填充、校验和持久化阶段只通过 job 记录推进运行态，进程内 cancel token 仅作为当前请求内的协作优化。
- 这意味着“教程内容格式”和“生成恢复协议”是解耦的：即使后续增加重连、取消、stale recovery，也不需要修改 DSL 结构。

### 9.4 失败占位内容不是合法教程内容

- 任何 step 的 `paragraphs` 如果出现如下占位文本，必须视为**无效教程数据**：
  - `⚠️ 此步骤自动生成失败`
  - `请手动编辑`
  - `Failed to parse JSON from model response`
- 这类文本只允许存在于调试日志、SSE 错误事件或实验报告中，不能进入最终 `TutorialDraft`
- validation 需要把这类 step 视为失败，而不是把它当作普通“无 patch 的说明步骤”
- 多阶段生成如果某一步耗尽重试，应优先停止后续生成并保留已有 partial draft，而不是继续在错误快照上生成剩余步骤

---

## 10. 方案对比与选型依据

### 10.1 三种方案对比

| 维度 | 完整代码快照 | 行号 Patch | 内容定位 Patch |
|------|-------------|-----------|---------------|
| **Token 消耗** | 高（每步完整代码） | 低（只输出变化 + 行号） | 低（只输出变化 + 上下文） |
| **AI 准确性** | 高（无增量计算） | 低（行号偏移易出错） | 高（AI 擅长代码匹配） |
| **运行时校验** | 不需要 | 行号越界可能静默错误 | 匹配失败立即报错 |
| **实现复杂度** | 最低 | 中等 | 中等 |
| **典型错误模式** | 几乎不会错 | 第 3 步行号错 → 后面全错 | find 太短导致歧义 |

### 10.2 为什么不用行号

行号方案的核心问题是**每一步的行号依赖上一步 patch 后的代码状态**。AI 在生成第 N 步的行号时，需要在内部模拟前 N-1 步所有 patch 的结果。这对 LLM 的上下文追踪能力要求极高，实践中错误率很高。

实测：即便由方案设计者手写行号，6 步 Redux 教程中仍出现了 2 处行号错误。

### 10.3 为什么不用标准 Diff

标准 unified diff 格式（`--- a/file +++ b/file @@ -l,s +l,s @@`）虽然工具链成熟，但：

1. AI 生成 diff 的准确性不如直接写 find/replace（diff 格式更严格，行首 `+`/`-`/` ` 标记容易出错）
2. diff 的行号和偏移量与行号 patch 方案有相同的问题
3. 解析 diff 需要额外依赖库，增加复杂度

内容定位 patch 本质上是 diff 的简化版——只保留 "旧内容 → 新内容" 的映射，省去格式化开销。

---

## 11. 完整示例

以下是一个完整的 3 步教程 JSON，主题是 "给函数添加缓存"：

```json
{
  "meta": {
    "title": "Build your own memoize",
    "lang": "js",
    "fileName": "memoize.js",
    "description": "从零实现一个函数记忆化工具"
  },
  "intro": {
    "paragraphs": [
      "这个教程会从零开始构建一个 memoize 函数。每一步只引入一个概念。",
      "左侧代码随滚动变化，右侧正文解释每一步的设计意图。"
    ]
  },
  "baseCode": "export function memoize(fn) {\n  return fn\n}",
  "steps": [
    {
      "id": "cache-object",
      "eyebrow": "Cache",
      "title": "先准备一个缓存容器。",
      "lead": "memoize 的核心是缓存。第一步，在闭包中创建一个空对象来存储计算结果。",
      "paragraphs": [
        "这个 cache 对象被关在 memoize 的闭包里，外部无法直接访问。",
        "键是参数的序列化形式，值是对应的计算结果。"
      ],
      "patches": [
        {
          "find": "export function memoize(fn) {\n  return fn\n}",
          "replace": "export function memoize(fn) {\n  const cache = {}\n\n  return fn\n}"
        }
      ],
      "focus": {
        "find": "const cache = {}"
      }
    },
    {
      "id": "cache-key",
      "eyebrow": "Key",
      "title": "把参数变成缓存键。",
      "lead": "对象只能用字符串做键。我们用 JSON.stringify 把参数序列化为缓存键。",
      "paragraphs": [
        "这种做法简单但不完美——如果参数包含循环引用就会报错。对于教程来说够用了。",
        "生产环境中更常见的做法是用 Map，它可以用任意值做键。"
      ],
      "patches": [
        {
          "find": "  const cache = {}\n\n  return fn",
          "replace": "  const cache = {}\n\n  return function (...args) {\n    const key = JSON.stringify(args)\n    return fn(...args)\n  }"
        }
      ],
      "focus": {
        "find": "const key = JSON.stringify(args)"
      }
    },
    {
      "id": "hit-miss",
      "eyebrow": "Hit",
      "title": "命中就返回，没命中就存起来。",
      "lead": "最后一步：检查缓存。命中直接返回，否则计算后存入缓存。",
      "paragraphs": [
        "这就是 memoize 的完整实现。它只有 4 行核心逻辑，但已经可以大幅减少重复计算。",
        "实际使用中，你还可以加缓存大小限制、TTL 过期等策略。"
      ],
      "patches": [
        {
          "find": "    const key = JSON.stringify(args)\n    return fn(...args)",
          "replace": "    const key = JSON.stringify(args)\n\n    if (key in cache) {\n      return cache[key]\n    }\n\n    cache[key] = fn(...args)\n    return cache[key]"
        }
      ],
      "focus": {
        "find": "if (key in cache) {\n      return cache[key]\n    }\n\n    cache[key] = fn(...args)\n    return cache[key]"
      },
      "marks": [
        {
          "find": "cache[key] = fn(...args)",
          "color": "rgb(143 210 193)"
        }
      ]
    }
  ]
}
```

### 组装结果验证

```
Step 0 (baseCode):
  export function memoize(fn) {
    return fn
  }

Step 1 (cache-object):
  export function memoize(fn) {
    const cache = {}        ← focus 高亮

    return fn
  }

Step 2 (cache-key):
  export function memoize(fn) {
    const cache = {}

    return function (...args) {
      const key = JSON.stringify(args)    ← focus 高亮
      return fn(...args)
    }
  }

Step 3 (hit-miss):
  export function memoize(fn) {
    const cache = {}

    return function (...args) {
      const key = JSON.stringify(args)

      if (key in cache) {           ← focus 高亮开始
        return cache[key]
      }

      cache[key] = fn(...args)      ← mark 标记
      return cache[key]             ← focus 高亮结束
    }
  }
```

---

## 附录: Token 消耗实测数据

以 7 步 Redux 教程为例：

| 方案 | 总字符数 | 相对值 |
|------|---------|--------|
| 7 份完整代码快照 | ~3,120 | 100% |
| 内容定位 patch | ~1,325 | 42% |
| 节省 | — | **58%** |

代码越长、步骤越多，节省比例越高。

---

## 12. 多文件支持

> v3.2 引入。允许教程跨多个源码文件（如 `store.js` + `helpers.js`），单文件格式完全向后兼容。

### 12.1 baseCode 双模式

| 模式 | baseCode 类型 | 示例 | 使用场景 |
|------|--------------|------|---------|
| **单文件** | `string` | `"const x = 1;"` | 教程只涉及一个文件（默认） |
| **多文件** | `Record<string, string>` | `{ "store.js": "...", "helpers.js": "..." }` | 教程跨多个文件 |

系统内部通过 `normalizeBaseCode()` 统一处理：单文件 string 自动包装为 `{ [fileName]: string }` Record，下游代码只需处理 Record 一种格式。

在创建草稿阶段，多文件 `baseCode` 也可能来自 GitHub 仓库导入。导入器保留仓库相对路径作为 Record key，因此后续 patch / focus / marks 的 `file` 字段必须继续引用这些相对路径，而不是仅写裸文件名。

### 12.2 主文件 (primaryFile)

多文件模式下，系统从 `meta.fileName` 或 `baseCode` 的第一个键确定主文件。主文件的作用：

- 作为 patch / focus / marks 中未指定 `file` 时的默认目标
- 代码区首次显示时默认展示主文件

### 12.3 多文件 Patch 路由

patch 的 `file` 字段决定操作目标：

```json
{
  "patches": [
    { "find": "const x = 1", "replace": "const x = 2", "file": "store.js" },
    { "find": "export const y = 2", "replace": "export const y = 20", "file": "helpers.js" }
  ]
}
```

规则：
- `file` 省略 → 操作主文件
- `file` 指定 → 精确匹配文件名（case-insensitive fallback）
- 每个文件维护独立的 patch 链，互不干扰

### 12.4 多文件 Focus / Marks

与 patch 相同，`file` 字段指定所属文件。省略时默认指向主文件。

```json
{
  "focus": { "find": "createStore(reducer)", "file": "store.js" },
  "marks": [
    { "find": "export function combineReducers", "color": "#4CAF50", "file": "helpers.js" }
  ]
}
```

### 12.5 多文件组装算法

```
输入: baseCode (Record), steps[]
输出: steps[]（每步包含 highlightedFiles, activeFile）

1. currentFiles = normalizeBaseCode(baseCode) → Record<string, string>
2. 对每个 step:
   a. prevFiles = currentFiles
   b. 如果 step.patches 存在:
      - 按 file 字段路由到目标文件
      - 按顺序应用每个 patch
      - 更新 currentFiles[targetFile]
   c. 确定 activeFile:
      - 有 patches → 取第一个 patch 的 file
      - 有 focus.file → 取 focus.file
      - 否则 → primaryFile
   d. 对每个文件:
      - 如未变化且非 activeFile 且无 focus/marks → 复用上步高亮（性能优化）
      - 否则 → 计算行变化、注入注解、CodeHike highlight()
   e. step.highlighted = highlightedFiles[primaryFile]  // 向后兼容
      step.highlightedFiles = { ... }                    // 全文件高亮
      step.activeFile = activeFile
3. 返回组装后的 steps
```

补充说明：
- `applyContentPatches()` 会根据 `patch.file` 路由到目标文件；`patch.file` 为空时默认操作 `primaryFile`
- 若目标文件不存在，运行时会直接报错，防止 patch 静默落到错误文件
- 对多文件输入，生成阶段允许在内部快照中为后续 `targetFiles` 预植入 placeholder stub，使 step-fill 可以把 patch 落到尚未进入 `baseCode` 的目标文件；最终 `tutorialDraft.baseCode` 只 materialize 原始 baseCode 文件和实际被 patch 过的这些 placeholder 文件

### 12.6 多文件渲染

前端渲染层（`CodeFrame` / `MobileCodeFrame`）接收 `highlightedFiles` 和 `activeFile`：

- **文件 Tab 栏**：当 `highlightedFiles` 包含 >1 个文件时显示，可点击切换
- **默认显示**：取 `activeFile` 对应的高亮结果
- **向后兼容**：单文件教程只传 `code`（string），无 Tab 栏

```
┌─────────────────────────────┐
│  STORE.JS │ HELPERS.JS      │  ← FileTabs（多文件时显示）
├─────────────────────────────┤
│  export function            │
│  createStore(reducer) {     │  ← activeFile 的高亮代码
│    ...                      │
│  }                          │
└─────────────────────────────┘
```

### 12.7 多文件 AI 生成 Prompt 差异

当 `sourceItems` 包含多个文件时，prompt 自动调整：

| 维度 | 单文件 | 多文件 |
|------|--------|--------|
| baseCode 格式 | `"最小可运行代码"` | `{ "file1.js": "代码", "utils.js": "代码" }` |
| meta 格式 | 含 `lang` + `fileName` | 只需 `title` + `description` |
| patch 格式 | `{ find, replace }` | `{ find, replace, file }` |
| focus/marks | `{ find }` | `{ find, file }` |
| 额外规则 | — | "patches/focus/marks 必须指定 file 字段" |

### 12.8 完整多文件示例

以下是一个 4 步 Redux 教程，涉及 `store.js` 和 `helpers.js` 两个文件：

```json
{
  "meta": {
    "title": "Redux 核心原理：createStore + combineReducers",
    "description": "从零实现 Redux 的两个核心 API"
  },
  "intro": {
    "paragraphs": [
      "本教程将逐步构建 Redux 的 createStore 和 combineReducers。"
    ]
  },
  "baseCode": {
    "store.js": "export function createStore(reducer) {\n  return {}\n}",
    "helpers.js": "// 初始为空，将在后续步骤引入"
  },
  "steps": [
    {
      "id": "add-dispatch",
      "eyebrow": "Store",
      "title": "添加 dispatch 方法",
      "paragraphs": ["..."],
      "patches": [
        {
          "find": "export function createStore(reducer) {\n  return {}\n}",
          "replace": "export function createStore(reducer) {\n  let state\n  function dispatch(action) {\n    state = reducer(state, action)\n  }\n  return { dispatch }\n}",
          "file": "store.js"
        }
      ],
      "focus": { "find": "function dispatch(action)", "file": "store.js" }
    },
    {
      "id": "add-getState",
      "eyebrow": "Store",
      "title": "添加 getState 方法",
      "paragraphs": ["..."],
      "patches": [
        {
          "find": "  let state\n  function dispatch",
          "replace": "  let state\n  function getState() { return state }\n  function dispatch",
          "file": "store.js"
        },
        {
          "find": "return { dispatch }",
          "replace": "return { getState, dispatch }",
          "file": "store.js"
        }
      ],
      "focus": { "find": "function getState()", "file": "store.js" }
    },
    {
      "id": "combineReducers-skeleton",
      "eyebrow": "Reducer",
      "title": "创建 combineReducers 框架",
      "paragraphs": ["..."],
      "patches": [
        {
          "find": "// 初始为空，将在后续步骤引入",
          "replace": "export function combineReducers(reducers) {\n  return function combination(state = {}, action) {\n    return state\n  }\n}",
          "file": "helpers.js"
        }
      ],
      "focus": { "find": "export function combineReducers", "file": "helpers.js" }
    },
    {
      "id": "combineReducers-loop",
      "eyebrow": "Reducer",
      "title": "遍历并应用每个 reducer",
      "paragraphs": ["..."],
      "patches": [
        {
          "find": "    return state",
          "replace": "    const nextState = {}\n    for (const key of Object.keys(reducers)) {\n      nextState[key] = reducers[key](state[key], action)\n    }\n    return nextState",
          "file": "helpers.js"
        }
      ],
      "focus": { "find": "for (const key of Object.keys(reducers))", "file": "helpers.js" }
    }
  ]
}
```

### 12.9 归一化层 (normalize.js)

所有 `baseCode` 格式差异在 `normalizeBaseCode()` 中统一处理：

```
输入 baseCode                    输出
─────────────                    ────
string "const x = 1"      →    { files: { "main.js": "const x = 1" }, primaryFile: "main.js", lang: "javascript" }
{ "a.ts": "...", "b.ts": "..." } → { files: { ... }, primaryFile: "a.ts", lang: "typescript" }
```

语言从文件扩展名推导（`.ts` → typescript, `.py` → python 等）。`normalizeTutorialMeta()` 在 AI 输出解析后补充缺失的 `meta.lang` / `meta.fileName`。
