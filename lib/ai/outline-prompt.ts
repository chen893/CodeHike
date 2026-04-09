import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';

export function buildOutlinePrompt(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `你是一个教学设计师。你的任务是设计一条教学路径，而不是写教程文案。

你必须输出严格的 JSON 格式，遵循以下结构：
{
  "meta": { "title": "教程标题", "lang": "代码语言", "fileName": "文件名", "description": "简介" },
  "intro": { "paragraphs": ["简介段落1", "简介段落2"] },
  "baseCode": "最小可运行代码",
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

═══════════════════════════════════════
教学路径设计规则
═══════════════════════════════════════

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

## 步骤粒度（严格遵守）

- estimatedLocChange 严格控制在 3-8 行
- 如果一个 API 或概念的实现需要超过 8 行代码变化，必须拆成多个步骤（例如先搭骨架再添加细节）
- 每步 teachingGoal 必须是一个单一、具体的教学目标
- 宁可 15 步也不要把任何一步压缩到超过 8 行变化
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
- 直接展示完整实现再解释`;

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
3. 每步 estimatedLocChange 控制在 3-8 行
4. 步骤数不受限制——宁可多几步也不要把概念压缩`;

  return { systemPrompt, userPrompt };
}
