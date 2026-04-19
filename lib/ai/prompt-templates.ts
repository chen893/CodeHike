import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';

export function buildGeneratePrompt(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `你是一个专业的代码教程生成器。你的任务是根据用户提供的源码和教学意图，生成一份结构化的逐步构建式教程。

你必须输出严格的 JSON 格式，遵循以下结构：
{
  "meta": { "title": "教程标题", "lang": "代码语言", "fileName": "文件名", "description": "简介" },
  "intro": { "paragraphs": ["简介段落1", "简介段落2"] },
  "baseCode": "第一步的完整代码",
  "steps": [
    {
      "id": "step-1",
      "eyebrow": "步骤标签（可选）",
      "title": "步骤标题",
      "lead": "步骤导语（可选）",
      "paragraphs": ["讲解段落1"],
      "patches": [
        { "find": "精确的旧代码", "replace": "精确的新代码" }
      ],
      "focus": { "start": 12, "end": 16 },
      "marks": [
        { "start": 12, "end": 12, "color": "#颜色值" }
      ]
    }
  ]
}

═══════════════════════════════════════
⚠️ 关键规则 — 必须严格遵守，否则系统无法渲染
═══════════════════════════════════════

## Patch 精确匹配规则（最重要！）

1. find 必须是代码中的**精确子串**，逐字逐字符匹配，包括空格、缩进、换行
2. find 在当前代码中必须**只出现一次**（唯一匹配）
3. patches 按数组顺序依次应用，后面的 patch 在前面的 patch 应用后的代码上操作
4. 绝对禁止：
   - 在 baseCode 中使用占位符（如 dispatch: () => {}、// TODO）
   - find 中使用不存在的代码
   - find 与代码存在空白差异（多余/缺少空格、换行）

## baseCode 规则

baseCode 必须是一个**真实可运行的代码片段**，是完整源码的一个早期简化版本。
- 不要放占位函数或空壳函数
- baseCode 中的每一行代码都必须是真实逻辑
- 后续步骤通过 patches 逐步添加更多功能

## 如何确保 find 精确匹配

在写每个 patch 的 find 时，你必须：
1. 在脑海中模拟上一步应用完所有 patch 后的完整代码
2. 从那份完整代码中**逐字复制**要替换的片段到 find 字段
3. 确保 find 片段在完整代码中只出现一次
4. 如果某行可能重复，扩大 find 的上下文使其唯一

## 教学原则

1. 每步只引入一个概念，变化最小化
2. 先有教学主线，再有步骤
3. 步骤细致，不大段解释配大块改动
4. 讲构建过程，不讲结果说明书
5. 代码从简单到复杂递进
6. focus.start / focus.end 和 marks[].start / marks[].end 必须是应用当前步骤 patch 后代码的 1-based 行号`;

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

## 生成要求

请根据以上源码和教学意图生成教程。

特别注意：
1. baseCode 必须是源码的一个真实可运行的简化版（比如只包含最基础的功能）
2. 每个 patch 的 find 字段必须从上一步的完整代码中精确复制
3. 建议按功能模块分步：先写核心骨架，再逐步添加功能
4. 每步代码变化不超过 {LOC_BUDGET} 行，保持精确`;

  return { systemPrompt, userPrompt };
}

export function buildRegenerateStepPrompt(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  currentDraft: {
    meta: { title: string };
    baseCode: string | Record<string, string>;
    steps: any[];
  },
  stepIndex: number,
  mode: 'prose' | 'step',
  instruction?: string
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `你是一个专业的代码教程编辑器。你需要重新生成教程中的某个特定步骤。

你只修改指定的步骤，保持其他步骤不变。

${
  mode === 'prose'
    ? '你只需要修改 eyebrow, title, lead, paragraphs 文案字段。保留 patches, focus, marks 不变。'
    : '你需要重新生成整个步骤，包括 patches, focus, marks。'
}

输出格式与步骤结构相同：
{
  "id": "步骤id",
  "eyebrow": "步骤标签（可选）",
  "title": "步骤标题",
  "lead": "步骤导语（可选）",
  "paragraphs": ["讲解段落"],
  "patches": [{ "find": "精确的旧代码", "replace": "精确的新代码" }],
  "focus": { "start": 12, "end": 16 },
  "marks": [{ "start": 12, "end": 12, "color": "颜色值" }]
}

Patch 精确匹配规则：
- find 必须是代码中的精确子串，逐字匹配（空格、缩进、换行完全一致）
- find 在当前代码中必须只出现一次
- 绝对禁止使用占位符`;

  const beforeSteps = currentDraft.steps.slice(0, stepIndex);
  const targetStep = currentDraft.steps[stepIndex];
  const afterSteps = currentDraft.steps.slice(stepIndex + 1);

  const userPrompt = `## 教程信息
- 标题：${currentDraft.meta.title}
- 总步骤数：${currentDraft.steps.length}

## 要重新生成的步骤（第 ${stepIndex + 1} 步）
\`\`\`json
${JSON.stringify(targetStep, null, 2)}
\`\`\`

## 前面的步骤
${beforeSteps.map((s: any, i: number) => `步骤 ${i + 1}: ${s.title}`).join('\n')}

## 后面的步骤
${afterSteps.map((s: any, i: number) => `步骤 ${stepIndex + i + 2}: ${s.title}`).join('\n')}

## 教学意图
- 主题：${teachingBrief.topic}
- 核心问题：${teachingBrief.core_question}${
    instruction ? `\n\n## 额外指示\n${instruction}` : ''
  }

请重新生成第 ${stepIndex + 1} 步。`;

  return { systemPrompt, userPrompt };
}
