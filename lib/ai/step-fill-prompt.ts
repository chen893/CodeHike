import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import type { TutorialOutline } from '../schemas/tutorial-outline';

export function buildStepFillPrompt(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  outline: TutorialOutline,
  stepIndex: number,
  previousCodeOrFiles: string | Record<string, string>,
  errorMessage?: string
): { systemPrompt: string; userPrompt: string } {
  const outlineStep = outline.steps[stepIndex];
  const isMultiFile = typeof previousCodeOrFiles !== 'string';

  const systemPrompt = `你正在生成一篇逐步构建式教程的第 ${stepIndex + 1} 步。

你必须输出严格的 JSON 格式，遵循以下结构：
{
  "id": "步骤id",
  "eyebrow": "步骤标签（可选）",
  "title": "步骤标题",
  "lead": "步骤导语（可选）",
  "paragraphs": ["段落1", "段落2"],
  "patches": [
    { "find": "精确的旧代码", "replace": "精确的新代码"${isMultiFile ? ', "file": "目标文件名"' : ''} }
  ],
  "focus": { "find": "要高亮的代码区域"${isMultiFile ? ', "file": "目标文件名"' : ''} },
  "marks": [
    { "find": "要标记的行", "color": "#颜色值"${isMultiFile ? ', "file": "目标文件名"' : ''} }
  ]
}

═══════════════════════════════════════
⚠️ 关键规则 — 必须严格遵守
═══════════════════════════════════════

## Patch 精确匹配规则（最重要！）

1. find 必须是"当前代码"中的**精确子串**，逐字逐字符匹配
2. find 在当前代码中必须**只出现一次**
3. patches 按数组顺序依次应用
4. find 必须从"当前代码"中逐字复制，不可凭记忆编造

## 叙事结构要求

paragraphs 必须遵循"问题 → 解决 → 收束"三段结构：
1. 第一段：描述当前代码的不足或新需求（为什么需要这一步）
2. （代码变化通过 patches 展示）
3. 第二段：解释代码解决了什么问题，与上一步的衔接

禁止的模式：
- 用"接下来我们添加 XX 功能"作为开头（应改为"当前的实现有一个问题：XX"）
- 只描述代码做了什么，不解释为什么
- 教科书式的平铺直叙

## 代码变化控制（严格遵守，违反会被拒绝）

- patches 的总代码变化必须控制在 3-8 行（find 和 replace 的行数差）
- 这是硬性约束，不是建议。如果本步需要超过 8 行变化，只实现最核心的部分
- 不要一次性添加完整函数——先添加核心逻辑，错误处理和边界检查留给后续步骤
- focus.find 指向本次变化的核心区域
- marks 标记关键的新增或修改行`;

  const sourceCodeSection = sourceItems
    .map((item) => `### ${item.label}${item.language ? ` (${item.language})` : ''}\n\`\`\`\n${item.content}\n\`\`\``)
    .join('\n\n');

  const currentCodeSection = typeof previousCodeOrFiles === 'string'
    ? `\`\`\`${outline.meta.lang || ''}\n${previousCodeOrFiles}\n\`\`\``
    : Object.entries(previousCodeOrFiles)
        .map(([fileName, code]) => `### ${fileName}\n\`\`\`\n${code}\n\`\`\``)
        .join('\n\n');

  const userPrompt = `## 教学目标
${outlineStep.teachingGoal}

## 引入的概念
${outlineStep.conceptIntroduced}

## 当前代码（上一步结束时的完整代码）
${currentCodeSection}

## 步骤在教程中的位置
- 教程标题：${outline.meta.title}
- 当前步骤：第 ${stepIndex + 1} / ${outline.steps.length} 步
- 前一步：${stepIndex > 0 ? outline.steps[stepIndex - 1].title : '（baseCode）'}
- 后一步：${stepIndex < outline.steps.length - 1 ? outline.steps[stepIndex + 1].title : '（最后一步）'}

## 教学意图
- 主题：${teachingBrief.topic}
- 目标读者水平：${teachingBrief.audience_level}
- 核心问题：${teachingBrief.core_question}
- 输出语言：${teachingBrief.output_language}

${
  errorMessage
    ? `## ⚠️ 上次生成失败的原因\n${errorMessage}\n\n请修正上述问题，确保 find 字段从"当前代码"中逐字精确复制。`
    : ''
}

## 要求
1. 先用 1-2 段话解释"为什么需要引入这个概念"（问题驱动）
2. 再展示代码变化（3-8 行）
3. 最后用 1 段话解释"这段代码解决了什么问题"（收束）
4. patch 的 find 必须从上面的"当前代码"中逐字复制
5. focus 指向本次变化的核心区域
6. 步骤 id 使用：${outlineStep.id}${isMultiFile ? '\n7. patches/focus/marks 必须指定 "file" 字段来指明操作哪个文件' : ''}`;

  return { systemPrompt, userPrompt };
}
