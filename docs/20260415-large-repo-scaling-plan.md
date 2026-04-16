# VibeDocs 大仓库扩展技术方案

> 目标：从当前 30 文件 / 4000 行上限，扩展到支持 100+ 文件、10000+ 行的中大型仓库导入和教程生成。本文档基于对现有 AI 生成管线和 GitHub 导入基础设施的全面分析，给出分阶段改造方案。

---

## 1. 现状分析

### 1.1 当前架构数据流

```
用户选择文件 (30 上限)
  → 客户端 POST /api/github/file-content（一次性发送所有路径）
    → 服务端批量拉取 GitHub Contents API（batch=5，顺序执行）
      → 返回所有文件内容 JSON
  → 转换为 SourceItemDraft[]
    → 进入 AI 生成管线
      → Phase 1: buildOutlinePrompt(全部源码) → AI 生成大纲
      → Phase 2: for 每个步骤:
            buildStepFillPrompt(全部源码, 累积代码, 大纲) → AI 生成 patch
            applyContentPatches() 从 step-0 重放到 step-N
      → Phase 3: 校验完整 draft
```

### 1.2 六个核心瓶颈

| # | 瓶颈 | 影响 | 严重度 |
|---|------|------|--------|
| 1 | **每步全量注入源码** | 100 文件 × 200 行 = 每步 20K 行源码注入 prompt，质量下降、成本暴涨 | 致命 |
| 2 | **无 input token 预算** | 不检查 prompt 是否超限，直接发给 AI 可能报错或降质 | 致命 |
| 3 | **O(N²) patch 回放** | 30 步 = 435 次重放，文件多时延迟不可接受 | 严重 |
| 4 | **单次请求硬限制** | 客户端一次性发送所有路径，服务端拒绝 >30 文件 | 严重 |
| 5 | **无 rate limit 管理** | 100 文件 = 101 次 GitHub API 调用，无退避、无感知 | 中等 |
| 6 | **常量重复定义** | MAX_FILES / MAX_TOTAL_LINES 在 route.ts 和 controller.ts 各写一份 | 低 |

### 1.3 关键代码位置

| 文件 | 行 | 说明 |
|------|-----|------|
| `lib/ai/multi-phase-generator.ts:146` | step-fill 传入全量 sourceItems |
| `lib/ai/outline-prompt.ts:78-80` | 源码全量拼接进 prompt |
| `lib/ai/step-fill-prompt.ts:65-67` | 同上 |
| `lib/ai/prompt-adapters.ts` | 只管输出 LOC 预算，不管输入 token |
| `lib/ai/source-preprocessor.ts` | extractStructure() 已实现但从未接入 pipeline |
| `lib/ai/multi-phase-generator.ts:132-137` | 每步从 step-0 重放 patch |
| `app/api/github/file-content/route.ts:11-12` | 硬编码 MAX_FILES=30, MAX_TOTAL_LINES=4000 |
| `lib/services/github-repo-service.ts:303-328` | batch=5 顺序拉取文件 |

---

## 2. 改造方案

### 2.1 检索式源码注入（AI 自主阅读）

**问题**：当前把全部源码一次性塞入 prompt（"填鸭式"）。100 个文件场景下，单步 prompt 包含 2 万行源码，90% 与当前步骤无关，注意力被稀释，patch 精度下降。

**方案**：改为检索式 — 给 AI 文件目录树和结构摘要，让 AI 通过 tool call 自主决定读哪些文件。像人类开发者一样，先看目录结构，再按需打开文件阅读。

#### 核心对比

```
当前（填鸭式）：
  prompt = 100个文件全文 + 教学意图 + 规则  (~40K tokens)
  → AI 一口气读完所有代码 → 输出
  → 90% 的代码与当前步骤无关，注意力浪费

改造后（检索式）：
  prompt = 文件目录树 + 结构摘要 + 教学意图 + 规则 (~8K tokens)
  → AI 分析目录结构
  → AI 调用 readFile("src/index.ts")      ← tool call
  → AI 调用 readFile("src/router.ts")     ← tool call
  → AI 调用 readFile("src/utils/auth.ts") ← tool call
  → "OK，我理解了架构" → 输出
  → 只读了 10-15 个关键文件，token 用在刀刃上
```

#### Tool 定义

```ts
// lib/ai/source-tools.ts（新文件）
import { tool } from 'ai';
import { z } from 'zod';
import type { SourceItem } from '../schemas/source-item';
import { preprocessSource } from './source-preprocessor';

/**
 * 创建注入了 sourceItems 闭包的 tool 集合。
 * AI 通过这些 tool 自主探索源码。
 */
export function createSourceTools(sourceItems: SourceItem[]) {
  // 构建快速查找 Map
  const fileMap = new Map(sourceItems.map(item => [item.label, item]));

  return {
    readFile: tool({
      description: '读取指定源码文件的完整内容。当你需要了解某个文件的实现细节时使用。',
      inputSchema: z.object({
        path: z.string().describe('文件路径（如 src/index.ts）'),
      }),
      execute: async ({ path }) => {
        const item = fileMap.get(path);
        if (!item) return { error: `文件不存在: ${path}` };
        return {
          content: item.content,
          language: item.language ?? 'unknown',
          lineCount: item.content.split('\n').length,
        };
      },
    }),

    listStructure: tool({
      description: '获取文件的结构摘要（函数/类/导出签名列表）。用于快速了解文件内容，不读全文。',
      inputSchema: z.object({
        path: z.string().describe('文件路径'),
      }),
      execute: async ({ path }) => {
        const item = fileMap.get(path);
        if (!item) return { error: `文件不存在: ${path}` };
        const preprocessed = preprocessSource(item);
        return {
          structure: preprocessed.structure,
          lineCount: preprocessed.lineCount,
        };
      },
    }),

    searchInFiles: tool({
      description: '在所有文件中搜索包含指定关键词的文件。用于找到相关模块。',
      inputSchema: z.object({
        keyword: z.string().describe('搜索关键词（函数名、类名、import 路径等）'),
      }),
      execute: async ({ keyword }) => {
        const results: { path: string; matches: string[] }[] = [];
        for (const item of sourceItems) {
          const lines = item.content.split('\n');
          const matches = lines
            .filter(line => line.includes(keyword))
            .map(line => line.trim())
            .slice(0, 5);  // 每个文件最多 5 行匹配
          if (matches.length > 0) {
            results.push({ path: item.label, matches });
          }
          if (results.length >= 30) break; // 防止高频关键词返回过大 payload
        }
        return { results, totalFiles: results.length, truncated: results.length >= 30 };
      },
    }),
  };
}
```

#### 目录树生成

prompt 中不再注入文件全文，而是注入结构化的目录树 + 每个文件的一行摘要：

```ts
// lib/ai/source-tools.ts 续

/**
 * 生成目录树 + 结构摘要，注入 prompt 代替文件全文。
 * 示例输出：
 *   src/
 *     index.ts          (45 lines)  — export function main(), export const config
 *     router.ts         (120 lines) — export function createRouter(), class Route
 *     utils/
 *       auth.ts         (80 lines)  — export function authenticate(), export function hashPassword
 *       helpers.ts      (30 lines)  — export function formatDate()
 */
export function buildDirectorySummary(sourceItems: SourceItem[]): string {
  // 按路径组织成树状结构
  const tree: Record<string, { path: string; lineCount: number; structure: string[] }[]> = {};

  for (const item of sourceItems) {
    const preprocessed = preprocessSource(item);
    const dir = item.label.includes('/')
      ? item.label.substring(0, item.label.lastIndexOf('/'))
      : '.';
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push({
      path: item.label,
      lineCount: preprocessed.lineCount,
      structure: preprocessed.structure.slice(0, 5),  // 最多 5 条签名
    });
  }

  let output = '';
  for (const [dir, files] of Object.entries(tree)) {
    output += `\n${dir}/\n`;
    for (const file of files) {
      const name = file.path.split('/').pop();
      const sigs = file.structure.join(', ') || '(无结构信息)';
      output += `  ${name.padEnd(25)} (${file.lineCount} lines)  — ${sigs}\n`;
    }
  }
  return output;
}
```

#### Outline 阶段改造

```ts
// lib/ai/multi-phase-generator.ts（改造后 Phase 1）

const sourceTools = createSourceTools(sourceItems);
const directorySummary = buildDirectorySummary(sourceItems);

// outline prompt 不再注入文件全文，改为目录树
const outlineSystemPrompt = `你是一个教学设计师。以下是源码仓库的目录结构和每个文件的结构摘要：

${directorySummary}

你可以使用以下工具来深入了解文件：
- readFile(path)：读取文件完整内容
- listStructure(path)：查看文件结构签名（比 readFile 更省空间）
- searchInFiles(keyword)：搜索包含关键词的文件

建议流程：先浏览目录结构确定核心文件 → 精读 5-10 个关键文件 → 设计教学路径

... 其余教学规则不变 ...`;

const outlineResult = await generateText({
  model,
  system: adaptPromptForModel(outlineSystemPrompt, modelId),
  prompt: teachingBriefToPrompt(teachingBrief),
  tools: sourceTools,
  output: Output.object({ schema: tutorialOutlineSchema }),
  stopWhen: stepCountIs(20),  // structured output 本身也占一步
});
```

AI 自主决定读哪些文件。目录树 + 结构摘要给它足够的全局视野，`readFile` 让它按需深入。

> AI SDK v6 使用 `stepCountIs`，不是 `isStepCount`。`generateText + tools + Output.object()` 是官方支持的组合，但必须设置多步 `stopWhen`，因为最终结构化输出也算一步。

#### Outline 输出文件范围

为了避免 step-fill 阶段继续注入完整当前代码，outline 的每个 step 需要增加轻量文件范围：

```ts
interface TutorialOutlineStep {
  id: string;
  title: string;
  teachingGoal: string;
  conceptIntroduced: string;
  estimatedLocChange: number;
  targetFiles: string[];   // 本步可能产生 patches/focus/marks 的文件，通常 1-3 个
  contextFiles: string[];  // 只用于理解依赖关系的文件，通常 0-5 个
}
```

`targetFiles` 必须来自目录摘要中的真实路径。后续 step-fill 只默认注入这些文件的当前内容；其他文件必须通过 tool 读取摘要或全文。

#### Outline 文件范围校验

`targetFiles/contextFiles` 是 AI 输出，不能直接信任。Outline 生成后必须运行后置校验和修复：

```ts
interface SourceScopeValidationResult {
  outline: TutorialOutline;
  repaired: boolean;
  errors: string[];
}

function validateOutlineSourceScope(
  outline: TutorialOutline,
  sourceItems: SourceItem[],
  primaryFile: string,
): SourceScopeValidationResult {
  const knownPaths = new Set(sourceItems.map((item) => item.label));
  const errors: string[] = [];
  let repaired = false;

  for (const step of outline.steps) {
    step.targetFiles = dedupe(step.targetFiles ?? []).filter((path) => knownPaths.has(path)).slice(0, 3);
    step.contextFiles = dedupe(step.contextFiles ?? [])
      .filter((path) => knownPaths.has(path) && !step.targetFiles.includes(path))
      .slice(0, 5);

    if (step.targetFiles.length === 0) {
      step.targetFiles = [primaryFile];
      repaired = true;
      errors.push(`step ${step.id} missing valid targetFiles; repaired to primary file`);
    }
  }

  return { outline, repaired, errors };
}
```

如果超过 30% 的 step 需要修复，说明 outline 对文件范围理解失败，应带错误原因重试 outline；重试后仍失败则要求用户缩小源码范围或切换模型。

#### Step-fill 阶段改造

step-fill 必须看到 patch 操作对象，但不应该默认看到完整 `previousFiles`。改为“目标文件当前内容 + 当前快照读取工具 + 原始源码读取工具”：

```ts
// lib/ai/multi-phase-generator.ts（改造后 Phase 2）

for (let i = 0; i < totalSteps; i++) {
  const previousFiles = fileSnapshots.get(i - 1)!;
  const stepScope = deriveStepSourceScope(outline.steps[i], previousFiles);
  const sourceTools = createScopedSourceTools(sourceItems, previousFiles, {
    targetFiles: stepScope.targetFiles,
    contextFiles: stepScope.contextFiles,
    maxTotalReadTokens: stepFillInputBudget,
  });

  const stepResult = await generateText({
    model,
    system: adaptPromptForModel(stepFillSystemPrompt, modelId),
    prompt: `
教学目标: ${outline.steps[i].teachingGoal}

当前代码目标文件（上一步结束时）:
${formatFiles(pickFiles(previousFiles, stepScope.targetFiles))}

当前代码文件清单（摘要，不含全文）:
${buildCurrentSnapshotSummary(previousFiles)}

规则:
- patches/focus/marks 只能作用于你已经精读过的当前代码文件。
- 如果要修改未注入的文件，先调用 readCurrentFile(path) 读取当前快照。
- readOriginalFile(path) 只用于理解原始仓库实现，不能把原始文件内容当作 patch find 的依据。

步骤位置: 第 ${i + 1}/${totalSteps} 步
前一步: ${i > 0 ? outline.steps[i - 1].title : '（baseCode）'}
后一步: ${i < totalSteps - 1 ? outline.steps[i + 1].title : '（最后一步）'}
    `,
    tools: sourceTools,
    output: Output.object({ schema: legacyTutorialStepSchema }),
    stopWhen: stepCountIs(6),  // 允许读取当前文件/原始文件 + 最终结构化输出
  });
}
```

大多数步骤只需要 1-3 个目标文件的当前内容。完整当前快照不进入 prompt，只以 `readCurrentFile(path)` 的形式按需读取。这样同时解决“原始源码全量注入”和“当前代码快照全量注入”两个 token 瓶颈。

#### Current snapshot tools

```ts
export function createScopedSourceTools(
  originalSourceItems: SourceItem[],
  currentFiles: Record<string, string>,
  options: SourceToolBudgetOptions,
) {
  return {
    readCurrentFile: tool({
      description: '读取上一步结束时某个文件的当前代码。生成 patch 前必须读取目标文件。',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => readBudgetedFile(currentFiles, path, options),
    }),
    listCurrentStructure: tool({
      description: '查看当前代码文件结构摘要，不读取全文。',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => summarizeCurrentFile(currentFiles, path),
    }),
    readOriginalFile: tool({
      description: '读取原始仓库文件，仅用于理解完整实现或对齐最终目标。',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => readBudgetedOriginalFile(originalSourceItems, path, options),
    }),
    searchOriginalFiles: tool({
      description: '在原始仓库中搜索关键词，返回受限数量的匹配文件和片段。',
      inputSchema: z.object({ keyword: z.string() }),
      execute: async ({ keyword }) => searchOriginalFiles(originalSourceItems, keyword, options),
    }),
  };
}
```

#### 兼容性兜底与能力探测

不能默认认为未知模型支持 `tools + structured output`。当前 provider registry 同时包含 DeepSeek、OpenAI、Zhipu；它们对 tool calling、JSON output、严格 schema 的组合支持不完全等价。改造时需要显式能力配置 + 启动期/首次使用时的 smoke probe：

```ts
// lib/ai/model-capabilities.ts（新文件）
interface ModelCapabilities {
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsToolStructuredOutput: boolean | 'probe';
}

const STATIC_CAPABILITIES: Record<string, ModelCapabilities> = {
  'deepseek-chat': {
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsToolStructuredOutput: 'probe',
  },
  'deepseek-reasoner': {
    supportsTools: false, // 未验证前不走检索式生成
    supportsStructuredOutput: true,
    supportsToolStructuredOutput: false,
  },
  'gpt-4o': {
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsToolStructuredOutput: true,
  },
  'glm-5.1': {
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsToolStructuredOutput: 'probe',
  },
};

const modelSupportsRetrieval = await supportsRetrievalGeneration(modelId);

if (modelSupportsRetrieval) {
  // 检索式：目录树 + tool call
  const sourceTools = createSourceTools(sourceItems);
  const directorySummary = buildDirectorySummary(sourceItems);
  // ... 检索式逻辑
} else {
  const fullPromptEstimate = estimateFullGenerationPromptTokens(sourceItems, teachingBrief, modelId);

  if (fullPromptEstimate > getMaxInputTokens(modelId)) {
    throw new RetrievalModelRequiredError({
      modelId,
      fileCount: sourceItems.length,
      estimatedTokens: fullPromptEstimate,
      message: '当前模型不支持大仓库检索式生成。请切换到支持 tools + structured output 的模型，或减少源码范围。',
    });
  }

  // 小仓库兜底：全量注入（当前行为）
  const { systemPrompt, userPrompt } = buildOutlinePrompt(sourceItems, teachingBrief);
  // ... 当前逻辑
}
```

`supportsRetrievalGeneration()` 做一次很小的 `generateText({ tools, output: Output.object(...), stopWhen: stepCountIs(2) })` 探测，并缓存结果。探测失败时：

- 小仓库：可回退全量注入。
- 大仓库或全量 prompt 估算超过安全输入预算：明确失败，要求用户切换到支持检索式生成的模型。

API/SSE 错误使用稳定 code，方便前端展示：

```ts
{
  code: 'RETRIEVAL_MODEL_REQUIRED',
  message: '当前模型不支持大仓库检索式生成，请切换模型或减少源码范围。',
  modelId,
  fileCount,
  estimatedTokens,
}
```

### 2.2 Input Token 预算管理

**问题**：检索式方案下，AI 通过 tool call 自主读取文件，单次 `generateText` 调用的总 token 量 = system prompt + tool calls 历史 + structured output。仍需防止 AI 读太多文件导致超限。同时，导入阶段和创建草稿阶段也必须有服务端硬限制，不能只依赖前端选择器。

**方案**：分三层控制：

1. **导入入口限制**：GitHub 单批接口限制每批文件数；草稿创建服务最终校验总文件数、总行数、单文件大小。
2. **prompt 初始预算**：目录摘要、当前目标文件、教学意图进入 prompt 前先估算 token。
3. **tool 执行预算**：AI 每次读取当前文件/原始文件时扣减剩余预算。

```ts
// lib/ai/token-budget.ts（新文件）

interface ProviderTokenLimits {
  contextWindow: number;
  maxOutputTokens: number;
  inputSafetyMargin: number;
}

const PROVIDER_LIMITS: Record<string, ProviderTokenLimits> = {
  'deepseek-chat':     { contextWindow: 128000, maxOutputTokens: 8192,  inputSafetyMargin: 12000 },
  'deepseek-reasoner': { contextWindow: 128000, maxOutputTokens: 8192,  inputSafetyMargin: 12000 },
  'gpt-4o':            { contextWindow: 128000, maxOutputTokens: 16384, inputSafetyMargin: 20000 },
  'gpt-4o-mini':       { contextWindow: 128000, maxOutputTokens: 16384, inputSafetyMargin: 20000 },
};

// 粗略估算：中文 ~1.5 token/字，代码 ~4 token/行
export function estimateTokens(text: string): number {
  const codeLines = text.split('\n').length;
  const cjkChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - cjkChars;
  return Math.ceil(codeLines * 3 + cjkChars * 1.5 + otherChars * 0.25);
}

export function getMaxInputTokens(modelId: string): number {
  const config = PROVIDER_LIMITS[modelId] ?? PROVIDER_LIMITS['deepseek-chat'];
  return config.contextWindow - config.maxOutputTokens - config.inputSafetyMargin;
}

export interface TokenBudgetSession {
  maxInputTokens: number;
  usedInputTokens: number;
  remainingInputTokens: number;
  consume(text: string, label: string): void;
}

export function createTokenBudgetSession(input: {
  modelId: string;
  basePrompt: string;
  outputReserve?: number;
}): TokenBudgetSession {
  const maxInputTokens = getMaxInputTokens(input.modelId) - (input.outputReserve ?? 0);
  const session = createMutableBudgetSession(maxInputTokens);
  session.consume(input.basePrompt, 'base-prompt');
  return session;
}
```

服务端导入限额单独放通用 helper，不放在 AI token helper 里：

```ts
// lib/utils/source-import-limits.ts（新文件）

export function assertSourceImportLimits(sourceItems: SourceItem[]): void {
  if (sourceItems.length > MAX_FILES_TOTAL) {
    throw new Error(`最多导入 ${MAX_FILES_TOTAL} 个文件`);
  }

  const oversized = sourceItems.find((item) => new TextEncoder().encode(item.content).length > MAX_FILE_BYTES);
  if (oversized) {
    throw new Error(`文件 ${oversized.label} 超过单文件大小上限 (${MAX_FILE_BYTES} bytes)`);
  }

  const totalLines = sourceItems.reduce((sum, item) => sum + item.content.split('\n').length, 0);
  if (totalLines > MAX_TOTAL_LINES) {
    throw new Error(`源码总行数 (${totalLines}) 超过上限 (${MAX_TOTAL_LINES})`);
  }
}
```

#### Tool 层面的 token 限制

检索式方案下，截断策略融入 tool 执行逻辑：

```ts
// lib/ai/source-tools.ts（改造 createSourceTools）

export function createSourceTools(
  sourceItems: SourceItem[],
  options: { maxFileReadTokens?: number; budget: TokenBudgetSession },
) {
  const maxFileTokens = options?.maxFileReadTokens ?? 15000;     // 单文件上限

  return {
    readFile: tool({
      description: '读取指定源码文件的完整内容。',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const item = fileMap.get(path);
        if (!item) return { error: `文件不存在: ${path}` };

        const tokens = estimateTokens(item.content);

        // 超过单文件上限 → 自动降级为结构摘要
        if (tokens > maxFileTokens) {
          const preprocessed = preprocessSource(item);
          return {
            content: '(文件过大，已截断为结构摘要)',
            structure: preprocessed.structure,
            lineCount: preprocessed.lineCount,
            truncated: true,
          };
        }

        // 超过剩余预算 → 拒绝读取
        if (tokens > options.budget.remainingInputTokens) {
          return { error: `token 预算已用尽，无法读取更多文件` };
        }

        options.budget.consume(item.content, `readFile:${path}`);
        return { content: item.content, language: item.language, lineCount: item.content.split('\n').length };
      },
    }),
    // ... listStructure/searchInFiles 也需要限制返回条数和片段长度，避免高频关键词刷爆上下文
  };
}
```

这比"构建 prompt 时截断"更优雅：AI 自然地学到"哪些文件值得读"，超出预算时收到明确反馈，不会盲目重试。
但它不是唯一防线：`createDraft()` 服务层仍必须调用 `assertSourceImportLimits()`，防止绕过 GitHub UI 直接 POST 超大 `sourceItems`。

预算口径必须统一：`basePrompt`、目录摘要、目标文件当前代码、tool schema/result history、结构化输出预留都从同一个 `TokenBudgetSession` 扣减。不要给 tool 单独写死 `80000` 这类与当前 prompt 无关的总预算。

### 2.3 Patch 回放优化

**问题**：step N 需要 replay step 0..N-1 的所有 patch，总复杂度 O(N²)。

**方案**：缓存每步结束时的代码状态快照。

```ts
// lib/ai/multi-phase-generator.ts（改造后）

// 替换原来的 per-step 重放逻辑
const fileSnapshots: Map<number, Record<string, string>> = new Map();
fileSnapshots.set(-1, initialFiles);  // 初始状态

for (let i = 0; i < outline.steps.length; i++) {
  // 直接从上一步快照开始，无需重放
  const previousFiles = fileSnapshots.get(i - 1)!;
  const stepScope = deriveStepSourceScope(outline.steps[i], previousFiles);
  const { systemPrompt, userPrompt, tools } = buildStepFillPromptWithRetrieval(
    sourceItems,
    teachingBrief,
    outline,
    i,
    previousFiles,
    stepScope,
    lastError ?? undefined,
  );

  // ... AI 调用、patch 应用 ...

  if (filledStep.patches) {
    const newFiles = applyContentPatches(previousFiles, filledStep.patches, primaryFile);
    fileSnapshots.set(i, newFiles);  // 缓存快照
  } else {
    fileSnapshots.set(i, previousFiles);  // 无 patch，状态不变
  }
}
```

**优化效果**：从 O(N²) patch 回放降为 O(N) 的 Map 查找 + 单次 patch 应用。

**内存考虑**：每个快照是 `Record<string, string>`，100 个文件 × 平均 200 行 × 约 30 bytes/行，约 600KB/快照。30 步约 18MB，仍可接受；实现时可以复用未变更文件的 string 引用，只复制变更后的 `Record`。如果步数更多，可保留最近 5 步快照 + 需要时从最近快照重放。

### 2.4 分批文件获取与服务端最终校验

**问题**：客户端一次 POST 发送所有路径，服务端拒绝 >30 个文件。

**方案**：客户端分批提升体验，服务端保留单批限制，并在创建草稿入口做最终总量校验。

```ts
// components/create-draft/github-client.ts（改造后）

function packFileContentBatches(
  paths: string[],
  tree: GitHubTreeNode[],
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let estimatedLines = 0;

  for (const path of paths) {
    const fileLines = getEstimatedLinesFromTree(tree, path);
    const wouldExceedFiles = current.length >= MAX_FILES_PER_REQUEST;
    const wouldExceedLines = current.length > 0 && estimatedLines + fileLines > MAX_LINES_PER_REQUEST;

    if (wouldExceedFiles || wouldExceedLines) {
      batches.push(current);
      current = [];
      estimatedLines = 0;
    }

    current.push(path);
    estimatedLines += fileLines;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

export async function fetchFileContentsBatched(
  repoUrl: string,
  paths: string[],
  tree: GitHubTreeNode[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<GitHubImportResult> {
  const allFiles: GitHubFileResult[] = [];
  const failures: GitHubFileFailure[] = [];
  let totalLines = 0;
  let owner = '';
  let repo = '';
  let loaded = 0;

  for (const batch of packFileContentBatches(paths, tree)) {
    const result = await fetchFileContents(repoUrl, batch);
    allFiles.push(...result.files);
    failures.push(...(result.failures ?? []));
    totalLines += result.totalLines;
    owner = result.owner;
    repo = result.repo;
    loaded += batch.length;
    onProgress?.(loaded, paths.length);
  }

  if (failures.length > 0) {
    throw new GitHubImportPartialFailureError(failures);
  }

  return { owner, repo, totalLines, files: allFiles };
}
```

#### 服务端改造

`route.ts` 保持单次请求 ≤30 文件的限制不变。它可以返回单批实际行数，但不负责跨批持久化聚合状态；跨批聚合只用于前端展示。

```ts
// app/api/github/file-content/route.ts
// 单次请求限制：paths.length <= MAX_FILES_PER_REQUEST
// 单批行数限制：batchTotalLines <= MAX_LINES_PER_REQUEST，防止单批返回过大 JSON
// 返回：{ totalLines, files, failures, rateLimit? }
```

`getMultipleFileContents()` 不再静默吞掉 `Promise.allSettled()` 的 rejected 项。它返回 failures：

```ts
interface GitHubFileFailure {
  path: string;
  message: string;
  code: 'NOT_FOUND' | 'RATE_LIMITED' | 'DECODE_ERROR' | 'UNKNOWN';
}

interface GitHubFileBatchResult {
  files: Map<string, GitHubFileContent>;
  failures: GitHubFileFailure[];
  rateLimit: RateLimitInfo | null;
}
```

默认策略：只要 `failures.length > 0`，前端阻断导入并展示失败文件列表；后续可以再加“忽略失败文件继续”的显式确认，但不能默认成功。

最终限制放在 `lib/services/create-draft.ts`：

```ts
export async function createDraft(input: CreateDraftInput) {
  const parsed = createDraftRequestSchema.parse(input);
  assertSourceImportLimits(parsed.sourceItems);
  // compute hash + persist
}
```

这样无论来源是 GitHub 导入、手工粘贴还是脚本调用，都会走同一套服务端上限。

### 2.5 GitHub API Rate Limit 管理

**问题**：无 rate limit 感知，100+ 文件可能导致 403。

**方案**：从响应头读取剩余额度，把 rate limit 信息作为本次请求的返回值或错误元数据向上传递。不要用模块级全局变量保存 `lastRateLimitInfo`，否则并发请求会串用户、串仓库。

```ts
// lib/services/github-repo-service.ts（改造后）

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

// 从 GitHub API 响应头提取 rate limit 信息
function extractRateLimitInfo(headers: Headers): RateLimitInfo {
  return {
    remaining: parseInt(headers.get('X-RateLimit-Remaining') ?? '5000'),
    limit: parseInt(headers.get('X-RateLimit-Limit') ?? '5000'),
    resetAt: new Date(parseInt(headers.get('X-RateLimit-Reset') ?? '0') * 1000),
  };
}

export interface GitHubFileBatchResult {
  files: Map<string, GitHubFileContent>;
  failures: GitHubFileFailure[];
  rateLimit: RateLimitInfo | null;
}

// 在 getMultipleFileContents 中，每批完成后检查剩余额度。
// 如果 reset 等待时间很短，可服务端等待；否则返回 RATE_LIMITED，让前端暂停并显示 resetAt。
async function maybeWaitForRateLimitReset(resetAt: Date): Promise<boolean> {
  const waitMs = resetAt.getTime() - Date.now() + 1000; // +1s 安全余量
  if (waitMs > 0 && waitMs < 60000) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return true;
  }
  return false;
}
```

route handler 返回：

```ts
return NextResponse.json({
  owner,
  repo,
  totalLines,
  files,
  rateLimit, // { remaining, limit, resetAt }
});
```

如果 `remaining <= RATE_LIMIT_BUFFER` 且 `resetAt` 超过短等待阈值，返回 `429 RATE_LIMITED`，body 带 `resetAt`。前端 import controller 进入 `paused-rate-limit` 状态，保留已导入批次，允许用户稍后继续。

### 2.6 共享常量管理

**问题**：MAX_FILES 和 MAX_TOTAL_LINES 在 route.ts 和 controller.ts 各写一份。

**方案**：抽到共享常量文件。

```ts
// lib/constants/github-import.ts（新文件）

/** 单次 API 请求最大文件数（服务端校验） */
export const MAX_FILES_PER_REQUEST = 30;

/** 单次导入最大文件总数（客户端展示 + 服务端最终校验） */
export const MAX_FILES_TOTAL = 200;

/** 单次导入最大总行数（服务端最终校验） */
export const MAX_TOTAL_LINES = 15000;

/** 单次 GitHub file-content 请求最大总行数，防止单批 JSON 过大 */
export const MAX_LINES_PER_REQUEST = 5000;

/** 单文件最大字节数，超过则不允许导入全文 */
export const MAX_FILE_BYTES = 100_000;

/** 大文件行数警告阈值（75%） */
export const WARN_LINES_RATIO = 0.75;

/** 文件获取批次大小 */
export const FETCH_BATCH_SIZE = 30;

/** GitHub API 批量获取并发数 */
export const GITHUB_API_BATCH_CONCURRENCY = 5;

/** GitHub API 速率限制缓冲（保留请求数） */
export const RATE_LIMIT_BUFFER = 50;

/** 批次间延迟（毫秒） */
export const BATCH_DELAY_MS = 500;

/** 失败重试次数 */
export const RETRY_ATTEMPTS = 3;
```

消费方改为 import：

```ts
// app/api/github/file-content/route.ts
import { MAX_FILES_PER_REQUEST } from '@/lib/constants/github-import';

// components/create-draft/use-github-import-controller.ts
import { MAX_FILES_TOTAL, MAX_TOTAL_LINES, WARN_LINES_RATIO } from '@/lib/constants/github-import';
```

### 2.7 大仓库树截断处理

**问题**：GitHub Trees API `recursive=1` 返回 `truncated: true` 时，当前静默丢弃未返回的文件。

**方案**：混合模式 — 优先完整树，截断时按需展开。这里涉及 API 契约变化，必须同步 route handler 和 client types，不能只改 service。

```ts
// lib/services/github-repo-service.ts（改造后）

export async function getRepoTree(owner: string, repo: string, token?: string | null) {
  // 先尝试完整树
  const result = await fetchTreeRecursive(owner, repo, token);

  if (!result.truncated) {
    return { tree: buildFileTree(result.tree), truncated: false, lazyNodes: [] };
  }

  // 截断时：只保留顶层结构，标记大目录为 lazy
  const topLevel = result.tree.filter(item => {
    const depth = item.path.split('/').length;
    return depth <= 2;
  });
  const lazyNodes = result.tree
    .filter(item => item.type === 'tree' && item.path.split('/').length === 1)
    .map(item => ({ path: item.path, sha: item.sha }));

  return { tree: buildFileTree(topLevel), truncated: true, lazyNodes };
}

// 按需加载子目录
export async function fetchSubdirectory(
  owner: string, repo: string, treeSha: string, token?: string | null,
): Promise<GitHubTreeNode[]> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
  const response = await fetch(url, { headers: githubHeaders(token) });
  const data = await handleGitHubResponse(response);
  return buildFileTree(data.tree);
}
```

新增/修改 API：

```text
GET /api/github/repo-tree?url=...
  → { owner, repo, tree, truncated, lazyNodes: [{ path, sha }] }

GET /api/github/repo-tree/subdirectory?url=...&path=src/lib&sha=<treeSha>
  → { owner, repo, path, sha, tree, truncated, lazyNodes }
```

前端 `FileTreeBrowser` 中标记 lazy 目录，展开时通过 `components/create-draft/github-client.ts` 调用子目录 route。组件仍不直接调用 service，保持 client fetch 集中在 feature client。lazy 节点必须保存 `sha`，不要只保存 path；GitHub Trees API 用 tree SHA 加载子树更稳定。

### 2.8 行数估算校准

**问题**：客户端用 `size / 30` 估算行数，服务端用实际 `split('\n').length` 计数，可能偏差较大。

**方案**：在 `buildFileTree` 阶段预计算 `estimatedLines` 并缓存到树节点。

```ts
// github-repo-service.ts 中 buildFileTree 改造
if (item.type === 'blob') {
  currentLevel.push({
    name: part,
    path: currentPath,
    type: 'file',
    size: item.size,
    estimatedLines: Math.ceil((item.size ?? 0) / 30),  // 预计算
    children: [],
  });
}
```

客户端优先使用 `node.estimatedLines`，不再每次重新计算。

---

## 3. 章节感知的增量生成（远期）

> 注：本节为远期优化，依赖章节系统的成熟落地。Phase 1-3 改造完成后即可支持 100+ 文件。

### 3.1 按章节分批生成

当前生成是连续的 SSE 流。改造为按章节分批，每章完成后 checkpoint：

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Ch1 生成 │────→│ Ch2 生成 │────→│ Ch3 生成 │
│ (outline │     │ (outline │     │ (outline │
│  + steps)│     │  + steps)│     │  + steps)│
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │ checkpoint      │ checkpoint      │ done
     ▼                 ▼                 ▼
   DB save           DB save           DB save
```

每章生成只注入本章涉及的源码文件，大幅降低单次 prompt 的输入量。

### 3.2 与章节方案的 GenerationRun 对齐

章节增量生成不在本方案里另建一套模型。`20260415-chapter-scaling-refactor-plan.md` 已经定义：

- `createChapteredGenerationRun()`，不要把章节逻辑继续塞进 `createMultiPhaseGenerationStream()`
- generation run state：`queued | running | succeeded | failed | cancelled`
- SSE v3：`chapter-plan`、`chapter-start`、`step-start`、`chapter-complete`、可重连 events route
- 失败策略：章节 degraded 后停止后续章节，保存 partial draft

本方案只补充“大仓库源码检索”如何接入 chaptered generation：

```ts
interface ChapterSourceScope {
  chapterId: string;
  targetFiles: string[];   // 本章会逐步构建的主要文件
  contextFiles: string[];  // 本章需要理解但通常不修改的文件
  ignoredFiles: string[];  // 明确不进入本章上下文
}
```

`ChapterSourceScope` 由 chapter plan 阶段产生，后续每章的 step-fill 再细化到 step 级 `targetFiles/contextFiles`。
GenerationRun 需要持久化章节源码范围映射，供断点续跑使用：

```ts
interface GenerationRunSourceMetadata {
  chapterSourceScopes: Record<string, ChapterSourceScope>;
}
```

### 3.3 ChapterCheckpoint 补充字段

```ts
// 仅作为章节方案 GenerationRun 的 metadata 扩展，不单独定义另一套 run 协议
interface ChapterCheckpoint {
  chapterId: string;
  chapterIndex: number;
  globalStepIndex: number;          // 本章第一步的全局索引

  filesSnapshot: Record<string, string>;  // 本章开始时的代码快照
  completedSteps: TutorialStep[];   // 本章已完成的步骤
  sourceScope: ChapterSourceScope;

  timestamp: number;
  retryCount: number;
}
```

### 3.4 断点续跑补充

```ts
// lib/services/resume-chaptered-generation.ts（新文件）
async function resumeGeneration(runId: string, fromChapterId: string): Promise<void> {
  const run = await getGenerationRun(runId);

  // 从 checkpoint 恢复代码状态
  const checkpoint = run.checkpoints.find(cp => cp.chapterId === fromChapterId);
  if (!checkpoint) throw new Error(`检查点不存在: ${fromChapterId}`);

  let currentFiles = checkpoint.filesSnapshot;
  const chapters = deriveChapterSections(draft.chapters, draft.steps);

  // 从中断的章节继续
  for (let i = checkpoint.chapterIndex; i < chapters.length; i++) {
    const chapter = chapters[i];
    const scope = run.chapterSourceScopes[chapter.id];
    if (!scope) throw new Error(`缺少章节源码范围: ${chapter.id}`);

    const scopedSource = filterSourceByLabels(run.sourceItems, [
      ...scope.targetFiles,
      ...scope.contextFiles,
    ]);

    const chapterSteps = await generateChapterSteps(
      scopedSource, chapter, currentFiles, run.teachingBrief,
    );

    // 应用 patches 更新代码状态
    for (const step of chapterSteps) {
      if (step.patches) currentFiles = applyContentPatches(currentFiles, step.patches, run.primaryFile);
    }

    // 创建 checkpoint
    await saveCheckpoint(run.id, {
      chapterId: chapter.id,
      chapterIndex: i,
      globalStepIndex: checkpoint.globalStepIndex + chapterSteps.length,
      filesSnapshot: currentFiles,
      completedSteps: chapterSteps,
      sourceScope: scope,
    });

    await updateGenerationRun(run.id, { currentChapterIndex: i + 1 });
  }
}
```

### 3.5 SSE 事件扩展

沿用章节方案的 SSE v3 事件，并新增用户可见的源码检索状态。`source-read` 不是调试日志，前端必须展示，让用户知道 AI 当前在阅读哪些文件、是否读取当前快照或原始源码：

```
event: chapter-start    { chapterId, chapterIndex, totalChapters, sourceScope }
event: step-start        { chapterId, globalStepIndex, stepIndexInChapter, targetFiles }
event: source-read       { phase, chapterId?, stepIndex?, path, kind: 'current'|'original'|'structure', tokenBudgetRemaining? }
event: chapter-complete  { chapterId, stepCount, checkpointId }
```

前端 `generation-progress-view.tsx` 需要展示：

- 当前章节 / 总章节 + 章节内步骤进度
- 最近读取的文件路径列表
- 读取类型：当前快照、原始源码、结构摘要
- 遇到 `RETRIEVAL_MODEL_REQUIRED` 时，展示“请切换到支持检索式生成的模型”的明确操作提示

---

## 4. 分阶段实施路径

### Phase 1 — 快速解锁（消除硬限制）

**目标**：支持 100+ 文件导入，暂不优化生成质量。

| 任务 | 涉及文件 | 预估工作量 |
|------|----------|-----------|
| 共享常量文件 | 新建 `lib/constants/github-import.ts` | 小 |
| 客户端分批获取 | `github-client.ts`, `use-github-import-controller.ts` | 中 |
| 服务端单批限制 + 创建草稿最终限额 | `route.ts`, `create-draft.ts`, `schemas/api.ts` | 中 |
| 进度条支持分批 | `file-tree-browser.tsx`, `github-import-tab.tsx` | 小 |
| Rate limit 感知 + 暂停/继续状态 | `github-repo-service.ts`, import controller | 中 |

**完成后**：能导入 100+ 文件，且任何来源的 `sourceItems` 都会被服务端总量限制兜底；生成质量仍可能因 prompt 过长而下降。

### Phase 2 — 检索式生成（核心改造）

**目标**：100+ 文件场景下保持生成质量，token 成本降低 60%+。

| 任务 | 涉及文件 | 预估工作量 |
|------|----------|-----------|
| source tools 定义 | 新建 `lib/ai/source-tools.ts` | 中 |
| current snapshot tools 定义 | `lib/ai/source-tools.ts` | 中 |
| 目录树摘要生成 | `source-tools.ts` 中 `buildDirectorySummary` | 中 |
| source-preprocessor 接入 | `source-preprocessor.ts`（已有，接入 pipeline） | 小 |
| token 预算管理 | 新建 `lib/ai/token-budget.ts` | 中 |
| outline step 增加 `targetFiles/contextFiles` | `schemas/tutorial-outline.ts`, prompts | 中 |
| outline 文件范围后置校验 | `multi-phase-generator.ts`, 新 helper | 中 |
| outline 改为检索式 | `outline-prompt.ts`, `multi-phase-generator.ts` | 大 |
| step-fill 改为目标文件 + 按需读取当前快照 | `step-fill-prompt.ts`, `multi-phase-generator.ts` | 大 |
| 模型能力探测 | 新建 `lib/ai/model-capabilities.ts`, `model-probe.ts` | 中 |

**完成后**：100+ 文件导入 + 生成质量有保障 + token 成本显著降低。未知模型若探测失败，会自动回退旧链路。

### Phase 3 — 性能优化

**目标**：降低生成延迟和成本。

| 任务 | 涉及文件 | 预估工作量 |
|------|----------|-----------|
| Patch 快照缓存 | `multi-phase-generator.ts` | 中 |
| 大仓库树截断补全 + SHA 子目录 route | `github-repo-service.ts`, `app/api/github/*`, `github-client.ts` | 中 |
| 行数估算校准 | `github-client.ts` | 小 |

### Phase 4 — 章节增量生成（远期）

**目标**：支持 200+ 文件超大型仓库，按章节分批生成。

| 任务 | 涉及文件 | 预估工作量 |
|------|----------|-----------|
| 复用章节方案 GenerationRun | 章节方案 schema + migration | 大 |
| 章节级源码分配 | `createChapteredGenerationRun()` | 大 |
| 断点续跑源码 scope 恢复 | 新增 service 层 | 大 |
| 前端进度展示改造（含 source-read） | `generation-progress-view.tsx` | 中 |

### 验收与测试清单

| 测试 | 覆盖点 |
|------|--------|
| `tests/source-import-limits.test.js` | `createDraft()` 服务层拒绝超文件数、超总行数、超单文件大小 |
| `tests/source-tools.test.js` | `readCurrentFile/readOriginalFile/searchOriginalFiles` 的预算扣减、截断、错误返回 |
| `tests/model-capabilities.test.js` | 未知模型默认不启用检索式；probe 成功/失败路径可控 |
| `tests/outline-source-scope.test.js` | `targetFiles/contextFiles` 路径校验、去重、修复、重试阈值 |
| `tests/patch-snapshot-cache.test.js` | 快照缓存结果与从 step-0 重放结果完全一致 |
| `tests/github-import.test.js` | 按文件数+估算行数装箱、failures 阻断导入、rate-limit 暂停态、已导入批次不丢失 |
| `tests/github-tree-contract.test.js` | repo-tree 返回 `truncated/lazyNodes`，subdirectory route 使用 SHA 并保持 feature client 访问边界 |
| `tests/generation-progress-events.test.js` | `source-read` 事件解析和前端展示状态 |

---

## 5. 新增文件总览

```
lib/
  constants/
    github-import.ts          ← 共享常量（Phase 1）
  ai/
    source-tools.ts           ← readFile / listStructure / searchInFiles tool 定义（Phase 2）
    token-budget.ts           ← token 估算 + tool 级预算控制（Phase 2）
    model-capabilities.ts     ← 模型 tool + structured output 能力探测（Phase 2）
  utils/
    source-import-limits.ts   ← sourceItems 总文件数/总行数/单文件大小校验（Phase 1）
  services/
    resume-chaptered-generation.ts  ← 断点续跑服务（Phase 4）
```

## 6. 改动文件总览

```
Phase 1:
  components/create-draft/github-client.ts       ← 分批获取
  components/create-draft/use-github-import-controller.ts  ← 导入共享常量
  app/api/github/file-content/route.ts           ← 单批限制 + rate-limit metadata
  lib/services/create-draft.ts                   ← 服务端最终 sourceItems 限额
  lib/utils/source-import-limits.ts              ← 共享 sourceItems 限额 helper
  lib/schemas/api.ts                             ← create draft 输入约束
  components/create-draft/file-tree-browser.tsx  ← 进度条适配
  components/create-draft/github-import-tab.tsx  ← 进度展示
  lib/services/github-repo-service.ts            ← rate limit 感知

Phase 2:
  lib/ai/source-tools.ts          ← 新增：tool 定义 + 目录树生成
  lib/ai/token-budget.ts          ← 新增：token 估算 + tool 级预算
  lib/ai/model-capabilities.ts    ← 新增：模型能力配置 + smoke probe
  lib/ai/source-preprocessor.ts   ← 接入 pipeline（已有 extractStructure）
  lib/schemas/tutorial-outline.ts ← 新增 step targetFiles/contextFiles
  lib/ai/outline-source-scope.ts  ← 新增：文件范围校验/修复/重试判定
  lib/ai/outline-prompt.ts        ← 改为目录树注入，不再注入文件全文
  lib/ai/step-fill-prompt.ts      ← 注入目标文件当前代码，其他文件按需 tool call
  lib/ai/multi-phase-generator.ts ← 检索式 generateText + tools + stopWhen

Phase 3:
  lib/ai/multi-phase-generator.ts ← 快照缓存
  lib/services/github-repo-service.ts ← 树截断补全
  app/api/github/repo-tree/route.ts ← 返回 truncated/lazyNodes
  app/api/github/repo-tree/subdirectory/route.ts ← 基于 SHA 的 lazy 子目录加载

Phase 4:
  复用章节方案 generation-run schema
  lib/ai/create-chaptered-generation-run.ts ← 章节分批 + source scope
  components/tutorial/generation-progress-view.tsx ← 章节进度 + source-read 展示
```

---

## 7. 性能预期

| 场景 | 当前（全量注入） | Phase 2（检索式） | 变化 |
|------|-----------------|-------------------|------|
| Outline input tokens (100 文件) | ~40K | ~23K（目录 8K + AI 自主读 10 文件 15K） | **-43%** |
| 单步 step-fill tokens | ~40K | ~8-14K（目标文件当前代码 3-6K + 按需读 2-3 文件） | **-65%~80%** |
| 40 步总 input tokens | ~1.6M | ~420K-560K | **-65%~74%** |
| Outline 生成时间 | 5-10 秒 | 15-30 秒（多了 tool call 轮次） | +10-20s |
| 单步 step-fill 时间 | 5-10 秒 | 5-12 秒（大部分步骤不额外读文件） | 持平 |
| Patch 回放 (40 步) | O(N²) ≈ 820 次 | O(N) ≈ 40 次（Phase 3 缓存） | **-95%** |
| 40 步中断后重跑 | 40 步全量 | 从失败章节继续（Phase 4） | **-75%** |
| 100 文件导入耗时 | 不支持 | ~10 秒（Phase 1 分批获取） | 从不可能到可能 |

**总结**：检索式方案牺牲了 outline 阶段 10-20 秒的延迟（AI 多轮 tool call），换取约 65%-74% 的总 input token 成本下降和更好的生成质量（AI 只关注相关文件，注意力更集中）。

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| AI 读错文件或遗漏关键文件 | outline 质量下降 | 目录树 + 结构摘要提供全局视野；system prompt 引导"先读入口文件" |
| 部分 provider 不支持 tool call 或不支持 tools + structured output 组合 | 检索式无法工作 | `model-capabilities` 显式配置 + smoke probe；大仓库明确要求切换支持检索式的模型，小仓库才允许回退全量注入 |
| AI 输出无效 targetFiles/contextFiles | step-fill 读错文件或 patch 目标错误 | outline 后置校验、自动修复、超过阈值重试 outline |
| AI 过度调用 readFile 导致 token 超限 | 成本失控 | 初始 prompt 预算 + tool 内置 token 预算，超限后返回错误提示 |
| 客户端限额被绕过 | DB/AI 输入被超大源码拖垮 | `createDraft()` 服务层最终校验文件数、总行数、单文件大小 |
| tool call 多轮增加延迟 | outline 生成慢 10-20s | 前端展示"AI 正在分析代码..."进度；step-fill 阶段大部分步骤不额外读文件 |
| Token 估算不够精确 | 预算控制偏差 | 保守估算（系数偏大），实际使用中校准 |
| 分批获取中途中断或部分文件失败 | 用户已导入部分文件或误以为导入完整 | 每批结果追加到 state，已获取的不丢失；failures 默认阻断并展示失败文件 |
| Rate limit 在低认证额度下被触发 | 导入失败 | per-request rate-limit metadata，显示剩余额度和重置时间，支持暂停/继续 |
| 大仓库 tree lazy loading 找不到子目录 | 用户无法选择未展开文件 | lazy node 持久保存 Git tree SHA，子目录 route 用 SHA 加载 |
| Phase 4 与章节方案重复建模 | 协议分裂、实现冲突 | 复用章节方案 GenerationRun，只扩展 source scope metadata |

---

## 9. 与章节重构计划的关系

本方案依赖 `20260415-chapter-scaling-refactor-plan.md` 中的章节系统：

- **Phase 1-3** 不依赖章节系统，可独立推进
- **Phase 4**（章节增量生成）依赖章节系统中的 `chapters[]` + `steps[].chapterId` 模型已落地
- 两个计划的 `steps[]` 数据模型兼容，不会冲突

---

## 10. 技术选型决策记录

### Q: 是否需要自建 Agent 替换 Vercel AI SDK？

**结论：不需要。**

| 维度 | 分析 |
|------|------|
| AI SDK 提供的能力 | SDK 层支持 `generateText` + `tools` + `Output.object()` + `stopWhen`，可承载检索式生成 |
| AI SDK 不提供的 | input token 管理、模型组合能力探测、step 间状态管理、checkpoint — 这些无论用什么 SDK 都要自己写 |
| 自建的成本 | 需要重写 structured output 解析、多 provider 适配、流式处理、错误重试 |
| 实际改动范围 | 主要改动在 `source-tools.ts`（tool 定义）、`model-capabilities.ts`（能力探测）、`outline-prompt.ts` / `step-fill-prompt.ts`（prompt 改造）、`multi-phase-generator.ts`（调用方式）— 全在 SDK 之外 |

Vercel AI SDK 是工具层，不是架构瓶颈。检索式改造改的是"AI 怎么获取信息"，不是"怎么调 AI"。
