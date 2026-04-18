#!/usr/bin/env node
/**
 * One-time AI backfill script for tagType classification.
 *
 * Classifies existing tags into technology/category/level dimensions (D-01/D-05).
 * Target: >= 70% type coverage on existing tags.
 *
 * Usage: npx tsx scripts/backfill-tag-types.ts
 *
 * Requires DATABASE_URL and an AI provider API key (e.g. MINIMAX_API_KEY).
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { generateText, Output } from 'ai';
import { createProvider } from '../lib/ai/provider-registry';
import { supportsNativeStructuredOutput } from '../lib/ai/model-capabilities';
import { parseJsonFromText } from '../lib/ai/parse-json-text';
import { db } from '../lib/db';
import { tutorialTags } from '../lib/db/schema';
import { eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

// ─── Constants ────────────────────────────────────────────────────────

const BATCH_SIZE = 20;

const CLASSIFICATION_PROMPT = `You are a tag classification system. Classify each tag into exactly one of three types:

- **technology**: Specific technologies, frameworks, libraries, languages, tools, or knowledge points.
  Examples: React, Python, Docker, React Hooks, load balancing, CSS Grid, Webpack, Kubernetes, TypeScript, Express

- **category**: Broad domains or fields of software development.
  Examples: Frontend Development, Backend Development, DevOps, AI/ML, Mobile Development, Database, Security, Systems Programming, Data Science, Game Development

- **level**: Difficulty or skill level indicators.
  Examples: 入门/Beginner, 进阶/Intermediate, 实战/Advanced

Rules:
- If a tag is clearly a specific technology/tool/framework, classify as "technology"
- If a tag is a broad field or domain, classify as "category"
- If a tag indicates difficulty level, classify as "level"
- If uncertain, use "unknown"

Tags to classify:`;

// ─── Schema ───────────────────────────────────────────────────────────

const tagClassificationSchema = z.object({
  classifications: z.array(
    z.object({
      tagName: z.string(),
      tagType: z.enum(['technology', 'category', 'level', 'unknown']),
    }),
  ),
});

type TagClassification = z.infer<typeof tagClassificationSchema>;

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('=== tagType Backfill Script ===\n');

  // 1. Fetch all tags with NULL tagType
  const unclassified = await db
    .select({ id: tutorialTags.id, name: tutorialTags.name })
    .from(tutorialTags)
    .where(isNull(tutorialTags.tagType));

  console.log(`Found ${unclassified.length} unclassified tags.\n`);

  if (unclassified.length === 0) {
    console.log('Nothing to classify. Exiting.');
    return;
  }

  // 2. Process in batches
  const totalBatches = Math.ceil(unclassified.length / BATCH_SIZE);
  const stats = { technology: 0, category: 0, level: 0, unknown: 0, errors: 0 };

  for (let i = 0; i < totalBatches; i++) {
    const batch = unclassified.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const batchNum = i + 1;

    try {
      const result = await classifyBatch(batch.map((t) => t.name));
      if (!result) {
        stats.errors += batch.length;
        console.log(`Batch ${batchNum}/${totalBatches}: FAILED to parse response`);
        continue;
      }

      // Update each classified tag
      for (const classification of result.classifications) {
        if (classification.tagType === 'unknown') {
          stats.unknown++;
          continue;
        }

        const tag = batch.find((t) => t.name === classification.tagName);
        if (!tag) {
          // AI may have slightly modified the tag name; try case-insensitive match
          const fuzzyMatch = batch.find(
            (t) => t.name.toLowerCase() === classification.tagName.toLowerCase(),
          );
          if (!fuzzyMatch) {
            stats.errors++;
            continue;
          }
          await db
            .update(tutorialTags)
            .set({ tagType: classification.tagType })
            .where(eq(tutorialTags.id, fuzzyMatch.id));
          stats[classification.tagType as keyof typeof stats]++;
          continue;
        }

        await db
          .update(tutorialTags)
          .set({ tagType: classification.tagType })
          .where(eq(tutorialTags.id, tag.id));
        stats[classification.tagType as keyof typeof stats]++;
      }

      const classified = result.classifications.filter((c) => c.tagType !== 'unknown').length;
      const unknownCount = result.classifications.filter((c) => c.tagType === 'unknown').length;
      console.log(
        `Batch ${batchNum}/${totalBatches}: ${classified} classified, ${unknownCount} unknown`,
      );
    } catch (err) {
      stats.errors += batch.length;
      console.error(
        `Batch ${batchNum}/${totalBatches}: Error - ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3. Report
  const totalClassified = stats.technology + stats.category + stats.level;
  const totalProcessed = totalClassified + stats.unknown + stats.errors;
  const coverage =
    totalProcessed > 0 ? ((totalClassified / totalProcessed) * 100).toFixed(1) : '0.0';

  console.log('\n=== Summary ===');
  console.log(`Total tags processed: ${totalProcessed}`);
  console.log(`  technology: ${stats.technology}`);
  console.log(`  category:    ${stats.category}`);
  console.log(`  level:       ${stats.level}`);
  console.log(`  unknown:     ${stats.unknown}`);
  console.log(`  errors:      ${stats.errors}`);
  console.log(`Coverage: ${coverage}% (target: >= 70%)`);
}

// ─── AI Classification ────────────────────────────────────────────────

async function classifyBatch(tagNames: string[]): Promise<TagClassification | null> {
  const model = createProvider();
  const modelId = process.env.DEFAULT_AI_MODEL;
  const useNative = supportsNativeStructuredOutput(modelId);

  const tagList = tagNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
  const prompt = `${CLASSIFICATION_PROMPT}\n${tagList}`;

  const generateOpts: Parameters<typeof generateText>[0] = {
    model,
    prompt,
    maxOutputTokens: 1024,
  };

  if (useNative) {
    generateOpts.output = Output.object({ schema: tagClassificationSchema });
  }

  const result = await generateText(generateOpts);

  if (useNative && result.output) {
    return result.output;
  }

  // Fallback: manual parse from text
  try {
    return parseJsonFromText(result.text, tagClassificationSchema, 'backfill-tag-types');
  } catch {
    console.warn('[backfill-tag-types] Failed to parse AI response');
    return null;
  }
}

// ─── Entry point ──────────────────────────────────────────────────────

main()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
