/**
 * AI-powered tag generation for tutorials.
 * Uses the existing provider registry to generate 3-5 relevant topic tags.
 * Falls back to language-derived tags on AI failure.
 */

import { generateText, Output } from 'ai';
import { createProvider } from './provider-registry';
import { supportsNativeStructuredOutput } from './model-capabilities';
import { parseJsonFromText } from './parse-json-text';
import { z } from 'zod';

const tagListSchema = z.object({
  tags: z.array(z.string().min(1).max(64)).min(3).max(5),
});

const LANGUAGE_FALLBACK_MAP: Record<string, string[]> = {
  javascript: ['JavaScript', '前端开发', 'Web 开发'],
  js: ['JavaScript', '前端开发', 'Web 开发'],
  typescript: ['TypeScript', '前端开发', '类型系统'],
  ts: ['TypeScript', '前端开发', '类型系统'],
  python: ['Python', '后端开发', '数据科学'],
  py: ['Python', '后端开发', '数据科学'],
  rust: ['Rust', '系统编程', '性能优化'],
  go: ['Go', '后端开发', '并发编程'],
  java: ['Java', '后端开发', '企业应用'],
  cpp: ['C++', '系统编程', '性能优化'],
  c: ['C 语言', '系统编程', '底层开发'],
  react: ['React', '前端框架', '组件化开发'],
  vue: ['Vue', '前端框架', '响应式'],
  nextjs: ['Next.js', '全栈开发', 'SSR'],
  node: ['Node.js', '后端开发', 'JavaScript'],
  css: ['CSS', '前端开发', '样式设计'],
  html: ['HTML', 'Web 开发', '前端基础'],
  swift: ['Swift', 'iOS 开发', '移动端'],
  kotlin: ['Kotlin', 'Android 开发', '移动端'],
  sql: ['SQL', '数据库', '数据查询'],
  shell: ['Shell', '脚本编程', '自动化'],
  bash: ['Bash', '脚本编程', '自动化'],
};

/**
 * Generate 3-5 relevant topic tags for a tutorial using AI.
 * Returns fallback tags derived from the programming language on failure.
 */
export async function generateTags(
  title: string,
  description: string,
  lang: string,
): Promise<string[]> {
  try {
    const model = createProvider();
    const modelId = process.env.DEFAULT_AI_MODEL;

    const prompt = `Given this tutorial about "${title}" with description "${description}" written in ${lang}, suggest 3-5 relevant topic tags. The tags should be concise topic names that help readers find this tutorial. Mix Chinese and English tags as appropriate for a Chinese developer audience. Return as a JSON object with a "tags" field containing an array of strings. Example: {"tags": ["React", "前端开发", "Hooks"]}`;

    const useNative = supportsNativeStructuredOutput(modelId);

    const generateOpts: Parameters<typeof generateText>[0] = {
      model,
      prompt,
      maxOutputTokens: 256,
    };

    if (useNative) {
      generateOpts.output = Output.object({ schema: tagListSchema });
    }

    const result = await generateText(generateOpts);

    if (useNative && result.output) {
      return result.output.tags;
    }

    // Fallback: manual parse from text
    const parsed = parseJsonFromText(result.text, tagListSchema, 'tag-generator');
    return parsed.tags;
  } catch (err) {
    console.warn('[tag-generator] AI tag generation failed, using fallback:', err);
    return getFallbackTags(lang, title);
  }
}

function getFallbackTags(lang: string, title: string): string[] {
  const normalizedLang = lang.toLowerCase().trim();
  const langTags = LANGUAGE_FALLBACK_MAP[normalizedLang];

  if (langTags) {
    return langTags;
  }

  // Try to extract a meaningful tag from the title
  const titleWords = title
    .replace(/[^\w\s\u4e00-\u9fff]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 2);

  const tags: string[] = [];
  if (normalizedLang) {
    tags.push(normalizedLang.charAt(0).toUpperCase() + normalizedLang.slice(1));
  }
  tags.push(...titleWords);
  tags.push('编程教程');

  return tags.slice(0, 4);
}
