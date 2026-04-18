/**
 * AI-powered tag generation for tutorials (D-07/D-10).
 * Uses the controlled vocabulary as a hard constraint -- AI must pick from vocabulary.
 * Tags not in vocabulary are returned as candidates for the review queue.
 * Falls back to minimal lang-derived tags on AI failure.
 *
 * LANGUAGE_FALLBACK_MAP has been deleted (D-10).
 * Fallback now uses a simple lang -> tag name mapping from the vocabulary.
 */

import { generateText, Output } from 'ai';
import { createProvider } from './provider-registry';
import { supportsNativeStructuredOutput } from './model-capabilities';
import { parseJsonFromText } from './parse-json-text';
import { z } from 'zod';

const tagOutputSchema = z.object({
  tags: z.array(z.string().min(1).max(64)).min(3).max(5),
  newTagCandidates: z.array(z.string().min(1).max(64)).max(2).optional(),
});

/**
 * Generate 3-5 relevant topic tags for a tutorial using AI with vocabulary constraint.
 *
 * @param vocabulary - Controlled vocabulary grouped by tagType: { technology: [...], category: [...], level: [...] }
 * @returns Object with `tags` (from vocabulary) and `candidates` (new suggestions not in vocabulary)
 */
export async function generateTags(
  title: string,
  description: string,
  lang: string,
  vocabulary?: Record<string, string[]>,
): Promise<{ tags: string[]; candidates: string[] }> {
  try {
    const model = createProvider();
    const modelId = process.env.DEFAULT_AI_MODEL;

    const vocabularySection = vocabulary
      ? `You MUST select tags ONLY from this controlled vocabulary. Do NOT invent new tags.
Vocabulary:
- Technology (specific tech/framework): ${vocabulary.technology?.join(', ') || 'any'}
- Category (broad domain): ${vocabulary.category?.join(', ') || 'any'}
- Level (difficulty): ${vocabulary.level?.join(', ') || 'any'}

If none of the vocabulary tags fit well, you may suggest up to 2 completely new tags in the "newTagCandidates" field.`
      : 'Suggest 3-5 relevant topic tags.';

    const prompt = `Given this tutorial about "${title}" with description "${description}" written in ${lang}, select 3-5 relevant tags.

${vocabularySection}

Prefer a mix of technology, category, and level tags. Return a JSON object with "tags" (from vocabulary) and optionally "newTagCandidates" (max 2 new tags not in vocabulary).`;

    const useNative = supportsNativeStructuredOutput(modelId);

    const generateOpts: Parameters<typeof generateText>[0] = {
      model,
      prompt,
      maxOutputTokens: 256,
    };

    if (useNative) {
      generateOpts.output = Output.object({ schema: tagOutputSchema });
    }

    const result = await generateText(generateOpts);

    const output = useNative && result.output
      ? result.output
      : parseJsonFromText(result.text, tagOutputSchema, 'tag-generator');

    return {
      tags: output.tags || [],
      candidates: output.newTagCandidates || [],
    };
  } catch (err) {
    console.warn('[tag-generator] AI tag generation failed, using fallback:', err);
    return getVocabularyFallback(lang);
  }
}

/**
 * Minimal fallback when AI generation fails entirely (D-10).
 * Uses a simple lang -> tag name mapping instead of the deleted LANGUAGE_FALLBACK_MAP.
 */
function getVocabularyFallback(lang: string): { tags: string[]; candidates: string[] } {
  const langMap: Record<string, string> = {
    javascript: 'JavaScript',
    js: 'JavaScript',
    typescript: 'TypeScript',
    ts: 'TypeScript',
    python: 'Python',
    rust: 'Rust',
    go: 'Go',
    react: 'React',
    vue: 'Vue',
  };
  const langTag = langMap[lang.toLowerCase().trim()];
  const tags = langTag ? [langTag] : [];
  return { tags, candidates: [] };
}
