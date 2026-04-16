import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';

// ---------------------------------------------------------------------------
// Shared prompt fragments (reused by both legacy and retrieval paths)
// ---------------------------------------------------------------------------

function buildOutlineSystemPromptCore(
  isMultiFile: boolean,
  metaExample: string,
  baseCodeExample: string,
): string {
  return `你是一个教学设计师。你的任务是设计一条教学路径，而不是写教程文案。

你必须输出严格的 JSON 格式，遵循以下结构。

▎小型代码库（源码 < 500 行，步骤 ≤ 10）—— 扁平结构：
{
  "meta": ${metaExample},
  "intro": { "paragraphs": ["简介段落1", "简介段落2"] },
  "baseCode": ${baseCodeExample},
  "steps": [
    {
      "id": "step-1",
      "title": "步骤标题",
      "teachingGoal": "这步要教会读者什么",
      "conceptIntroduced": "引入的新概念",
      "estimatedLocChange": 5
    }
  ]
}

▎大型代码库（源码 ≥ 500 行，或步骤 > 10）—— 多章节结构：
{
  "meta": ${metaExample},
  "intro": { "paragraphs": ["简介段落1", "简介段落2"] },
  "baseCode": ${baseCodeExample},
  "chapters": [
    { "id": "ch-1", "title": "章节标题", "description": "章节简介", "order": 0 },
    { "id": "ch-2", "title": "章节标题", "description": "章节简介", "order": 1 }
  ],
  "steps": [
    {
      "id": "step-1",
      "title": "步骤标题",
      "teachingGoal": "这步要教会读者什么",
      "conceptIntroduced": "引入的新概念",
      "estimatedLocChange": 5,
      "chapterId": "ch-1"
    }
  ]
}

注意：
- 小型代码库不要输出 chapters 字段，步骤中也不需要 chapterId
- 多章节结构中，每个步骤的 chapterId 必须引用 chapters 数组中已定义的 id

═══════════════════════════════════════
教学路径设计规则
═══════════════════════════════════════

## 章节拆分规则

**何时拆分章节：**
- 源码总量超过约 500 行，或预期步骤数超过 10 步时，必须拆分为多章节
- 源码 ≤ 500 行且步骤 ≤ 10 步时，保持扁平结构（不输出 chapters 字段）

**章节粒度：**
- 每个章节包含 4-8 个步骤
- 章节本身是一个完整的小认知弧：有开端、发展、收束
- 章节之间必须有递进关系——后一章建立在前一章的理解之上

**章节拆分方式：**
- 按功能模块或概念领域拆分，而非按文件/目录拆分
- 每章聚焦一个概念群（例如："基础搭建"、"核心渲染逻辑"、"高级优化"）
- 章节标题要简洁、反映该章的核心概念

**章节 ID 与引用：**
- 章节使用 "ch-1", "ch-2", ... 格式的 id
- 每个 step 的 chapterId 必须引用 chapters 数组中已定义的有效 id
- steps 数组中同一章节的步骤保持连续排列

**章节排列顺序：**
- chapters 的 order 字段从 0 开始递增
- 章节顺序必须遵循从基础到高级的逻辑递进

## 认知弧线

1. 先确定这篇教程的"认知弧线"：从哪里开始，经过哪些认知转折，到哪里结束
2. 每一步只引入一个新概念，且这个概念必须是当前最该学的
3. 步骤之间必须有递进关系，不是并列罗列
4. 先让最小代码跑起来，再逐步指出不足、引入新概念修正
5. 至少有一个步骤要"推翻之前的简单实现"，引入更优方案

## baseCode 规则

baseCode 必须是源码的**最小可运行子集**：
- 不是骨架或占位符
- 必须能实际运行并产生基本效果
- 通常只包含核心数据结构和最基本的一个操作
${isMultiFile ? `- 多文件输入时，baseCode 必须是对象格式，每个文件名对应该文件的最小子集
- 选择一个主文件作为教学主线，其他文件只保留被主文件依赖的最小代码` : ''}

## 步骤粒度（严格遵守）

- estimatedLocChange 严格控制在 {STEP_LOC_MIN}-{STEP_LOC_MAX} 行
- 如果一个 API 或概念的实现需要超过 {STEP_LOC_MAX} 行代码变化，必须拆成多个步骤（例如先搭骨架再添加细节）
- 每步 teachingGoal 必须是一个单一、具体的教学目标
- 宁可 15 步也不要把任何一步压缩到超过 {STEP_LOC_MAX} 行变化
- 典型拆分模式：先写核心逻辑（3-5 行），下一步添加错误处理（2-4 行），再下一步添加边界检查（2-3 行）

## 叙事弧线模板

你的教学路径应遵循以下弧线：
1. 开端：展示最小可运行代码，让读者立即有"我跑起来了"的成就感
2. 发展：每步指出当前实现的不足，引入一个新概念来修正它
3. 转折：至少有一步"推翻之前的简单实现"，引入更优雅/高效的方案
4. 收束：最终代码与原始源码对齐，读者理解了每一层设计决策

禁止的模式：
- 按文件/模块顺序罗列功能
- 步骤之间没有因果递进
- 直接展示完整实现再解释

## 章节划分规则（多文件源码时必须遵守）

当源码包含多个模块或文件超过 8 个时，必须将步骤划分为多个章节（chapters）：
- 每个章节覆盖一组相关的概念模块（如：核心循环 → 工具系统 → 交互界面 → 高级集成）
- 章节之间有清晰的认知递进：前一章节的成果是后一章节的起点
- 每个章节内部仍然遵循认知弧线原则
- 每个步骤的 chapterId 必须与 chapters 数组中的某个 id 匹配
- 同一章节的步骤在 steps 数组中必须连续排列
- 章节数量参考：8-12 步取 1-2 章，13-20 步取 2-4 章，20 步以上取 3-6 章
- 单文件或少于 8 个文件时可以省略 chapters，所有步骤归入默认章节`;
}

// ---------------------------------------------------------------------------
// Legacy: full source injection
// ---------------------------------------------------------------------------

export function buildOutlinePrompt(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief
): { systemPrompt: string; userPrompt: string } {
  const isMultiFile = sourceItems.length > 1;

  const baseCodeExample = isMultiFile
    ? '{ "file1.js": "最小可运行代码", "utils.js": "辅助模块代码" }'
    : '"最小可运行代码"';

  const metaExample = isMultiFile
    ? '{ "title": "教程标题", "description": "简介" }'
    : '{ "title": "教程标题", "lang": "代码语言", "fileName": "文件名", "description": "简介" }';

  const systemPrompt = buildOutlineSystemPromptCore(isMultiFile, metaExample, baseCodeExample);

  const sourceCodeSection = sourceItems
    .map((item) => `### ${item.label}${item.language ? ` (${item.language})` : ''}\n\`\`\`\n${item.content}\n\`\`\``)
    .join('\n\n');

  const userPrompt = `## 源码内容

${sourceCodeSection}

## 教学意图

- 主题：${teachingBrief.topic}
- 目标读者水平：${teachingBrief.audience_level}
- 核心问题：${teachingBrief.core_question}
- 不涉及的范围：${teachingBrief.ignore_scope}
- 输出语言：${teachingBrief.output_language}${
    teachingBrief.desired_depth ? `\n- 期望深度：${teachingBrief.desired_depth}` : ''
  }${
    teachingBrief.target_step_count
      ? `\n- 目标步骤数：约 ${teachingBrief.target_step_count} 步`
      : ''
  }${
    teachingBrief.preferred_style
      ? `\n- 偏好风格：${teachingBrief.preferred_style}`
      : ''
  }

## 任务

请设计一条教学路径。只输出教学大纲（meta、intro、baseCode、steps 的标题和教学目标），不需要写具体的 patches、paragraphs、focus 或 marks。

特别注意：
1. 先确定认知弧线，再决定步骤
2. baseCode 必须是源码的最小可运行子集（不是占位符）
3. 每步 estimatedLocChange 控制在 {STEP_LOC_MIN}-{STEP_LOC_MAX} 行
4. 步骤数不受限制——宁可多几步也不要把概念压缩
5. 当源码包含多个模块时，必须将步骤划分为多个章节（chapters），并为每个步骤指定 chapterId`;

  return { systemPrompt, userPrompt };
}

// ---------------------------------------------------------------------------
// Retrieval: directory tree + tool instructions
// ---------------------------------------------------------------------------

export function buildRetrievalOutlinePrompt(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  directorySummary: string,
): { systemPrompt: string; userPrompt: string } {
  const isMultiFile = sourceItems.length > 1;

  const baseCodeExample = isMultiFile
    ? '{ "file1.js": "最小可运行代码", "utils.js": "辅助模块代码" }'
    : '"最小可运行代码"';

  const metaExample = isMultiFile
    ? '{ "title": "教程标题", "description": "简介" }'
    : '{ "title": "教程标题", "lang": "代码语言", "fileName": "文件名", "description": "简介" }';

  const core = buildOutlineSystemPromptCore(isMultiFile, metaExample, baseCodeExample);

  const toolAndScopeAddendum = `

## 可用工具

你可以使用以下工具来深入了解文件：
- readFile(path)：读取文件完整内容
- listStructure(path)：查看文件结构签名（比 readFile 更省空间）
- searchInFiles(keyword)：搜索包含关键词的文件

建议流程：先浏览目录结构确定核心文件 → 精读 5-10 个关键文件 → 设计教学路径

## 文件范围标注（重要）

每个步骤必须包含：
- targetFiles：本步可能产生 patches/focus/marks 的文件（通常 1-3 个），必须是目录中的真实路径
- contextFiles：只用于理解依赖关系的文件（通常 0-5 个），必须是目录中的真实路径`;

  const systemPrompt = core + toolAndScopeAddendum;

  const userPrompt = `## 源码仓库目录结构

${directorySummary}

## 教学意图

- 主题：${teachingBrief.topic}
- 目标读者水平：${teachingBrief.audience_level}
- 核心问题：${teachingBrief.core_question}
- 不涉及的范围：${teachingBrief.ignore_scope}
- 输出语言：${teachingBrief.output_language}${
    teachingBrief.desired_depth ? `\n- 期望深度：${teachingBrief.desired_depth}` : ''
  }${
    teachingBrief.target_step_count
      ? `\n- 目标步骤数：约 ${teachingBrief.target_step_count} 步`
      : ''
  }${
    teachingBrief.preferred_style
      ? `\n- 偏好风格：${teachingBrief.preferred_style}`
      : ''
  }

## 任务

请设计一条教学路径。只输出教学大纲（meta、intro、baseCode、steps 的标题和教学目标），不需要写具体的 patches、paragraphs、focus 或 marks。

请先用工具浏览关键文件，理解代码结构后再设计教学路径。

特别注意：
1. 先确定认知弧线，再决定步骤
2. baseCode 必须是你精读过的文件的最小可运行子集（不是占位符）
3. 每步 estimatedLocChange 控制在 {STEP_LOC_MIN}-{STEP_LOC_MAX} 行
4. 步骤数不受限制——宁可多几步也不要把概念压缩
5. 每个步骤的 targetFiles 和 contextFiles 必须是目录中的真实路径
6. 当源码包含多个模块时，必须将步骤划分为多个章节（chapters），并为每个步骤指定 chapterId`;

  return { systemPrompt, userPrompt };
}
