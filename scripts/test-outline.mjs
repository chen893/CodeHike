/**
 * Debug outline generation directly
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { generateText, Output } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { readFileSync } from 'fs';

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const sourceCode = readFileSync('docs/mini-redux.js', 'utf8');

// Simplified outline schema for testing
const { z } = await import('zod');

const testSchema = z.object({
  meta: z.object({
    title: z.string(),
    lang: z.string(),
    fileName: z.string(),
    description: z.string(),
  }),
  intro: z.object({
    paragraphs: z.array(z.string()),
  }),
  baseCode: z.string(),
  steps: z.array(z.object({
    id: z.string(),
    title: z.string(),
    teachingGoal: z.string(),
    conceptIntroduced: z.string(),
    estimatedLocChange: z.number(),
  })),
});

const systemPrompt = `你是一个教学设计师。请根据源码设计一条教学路径。

输出严格的 JSON 格式：
{
  "meta": { "title": "教程标题", "lang": "javascript", "fileName": "store.js", "description": "简介" },
  "intro": { "paragraphs": ["段落1"] },
  "baseCode": "最小可运行代码",
  "steps": [
    { "id": "step-1", "title": "标题", "teachingGoal": "教学目标", "conceptIntroduced": "概念", "estimatedLocChange": 5 }
  ]
}

要求：
1. 先确定认知弧线，每步只引入一个概念
2. baseCode 是最小可运行子集
3. estimatedLocChange 3-8 行
4. 约 12 步`;

const userPrompt = `## 源码
\`\`\`javascript
${sourceCode}
\`\`\`

## 教学意图
- 主题：Redux 核心源码实现
- 核心问题：Redux 五个核心 API 如何实现
- 目标读者：中级
- 输出语言：中文
- 目标步骤数：约 12 步

请输出教学大纲 JSON。`;

console.log('Testing outline generation...');
try {
  const result = await generateText({
    model: deepseek('deepseek-chat'),
    system: systemPrompt,
    prompt: userPrompt,
    output: Output.object({ schema: testSchema }),
    maxOutputTokens: 4096,
  });
  console.log('Success!');
  console.log(JSON.stringify(result.output, null, 2));
} catch (e) {
  console.error('Error:', e.message);

  // Try without Output.object to see raw output
  console.log('\n--- Trying without structured output ---');
  try {
    const result2 = await generateText({
      model: deepseek('deepseek-chat'),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 4096,
    });
    console.log('Raw text (first 2000 chars):');
    console.log(result2.text.slice(0, 2000));
  } catch (e2) {
    console.error('Raw also failed:', e2.message);
  }
}
