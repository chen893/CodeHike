#!/usr/bin/env node
/**
 * One-time vocabulary seeding script (D-09).
 *
 * Seeds the initial controlled vocabulary from:
 *   1. Hardcoded category vocabulary (broad domains)
 *   2. Hardcoded level vocabulary (difficulty levels)
 *   3. High-frequency tags from the database (tutorialCount >= 3) -> classified as technology
 *
 * Usage: npx tsx scripts/seed-vocabulary.ts
 *
 * Requires DATABASE_URL environment variable.
 * Does NOT require any AI API key — uses deterministic rules only.
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { db } from '../lib/db';
import { tutorialTags } from '../lib/db/schema';
import { eq, sql } from 'drizzle-orm';

// ─── Hardcoded Vocabularies ────────────────────────────────────────────

const TECHNOLOGY_VOCABULARY: Record<string, string> = {
  // Languages
  'JavaScript': 'javascript',
  'TypeScript': 'typescript',
  'Python': 'python',
  'Rust': 'rust',
  'Go': 'go',
  'Java': 'java',
  'C++': 'cpp',
  'SQL': 'sql',
  // Frontend
  'React': 'react',
  'Next.js': 'nextjs',
  'Vue': 'vue',
  'Svelte': 'svelte',
  'CSS': 'css',
  // Backend
  'Node.js': 'nodejs',
  'Express': 'express',
  'FastAPI': 'fastapi',
  // Database
  'PostgreSQL': 'postgresql',
  'MongoDB': 'mongodb',
  'Redis': 'redis',
  // AI/LLM
  'Claude': 'claude',
  'OpenAI': 'openai',
  'LangChain': 'langchain',
  'AI Agent': 'ai-agent',
  'RAG': 'rag',
  // DevOps & Tools
  'Docker': 'docker',
  'Git': 'git',
  // API
  'REST API': 'rest-api',
  'GraphQL': 'graphql',
};

const CATEGORY_VOCABULARY = [
  '前端开发',
  '后端开发',
  'DevOps',
  'AI/ML',
  '移动开发',
  '数据库',
  '安全',
  '系统编程',
  '数据科学',
  '游戏开发',
];

const LEVEL_VOCABULARY = ['入门', '进阶', '实战'];

// ─── Helpers ───────────────────────────────────────────────────────────

async function getOrCreateTag(name: string): Promise<{ id: string; name: string }> {
  // Check if tag already exists
  const [existing] = await db
    .select()
    .from(tutorialTags)
    .where(eq(tutorialTags.name, name));

  if (existing) return { id: existing.id, name: existing.name };

  // Create tag with slug derived from name
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .slice(0, 64) || 'tag';

  const [created] = await db
    .insert(tutorialTags)
    .values({ name, slug })
    .returning();

  return { id: created.id, name: created.name };
}

async function setTagType(tagId: string, tagType: 'technology' | 'category' | 'level'): Promise<void> {
  await db
    .update(tutorialTags)
    .set({ tagType })
    .where(eq(tutorialTags.id, tagId));
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Vocabulary Seeding Script ===\n');

  const stats = { technology: 0, category: 0, level: 0, skipped: 0 };

  // 1. Seed category vocabulary
  console.log('Seeding category vocabulary...');
  for (const name of CATEGORY_VOCABULARY) {
    const tag = await getOrCreateTag(name);
    // Only set tagType if not already set
    const [existing] = await db
      .select({ tagType: tutorialTags.tagType })
      .from(tutorialTags)
      .where(eq(tutorialTags.id, tag.id));

    if (existing.tagType) {
      stats.skipped++;
      console.log(`  [skip] "${name}" already has tagType: ${existing.tagType}`);
      continue;
    }

    await setTagType(tag.id, 'category');
    stats.category++;
    console.log(`  [category] "${name}"`);
  }

  // 2. Seed level vocabulary
  console.log('\nSeeding level vocabulary...');
  for (const name of LEVEL_VOCABULARY) {
    const tag = await getOrCreateTag(name);
    const [existing] = await db
      .select({ tagType: tutorialTags.tagType })
      .from(tutorialTags)
      .where(eq(tutorialTags.id, tag.id));

    if (existing.tagType) {
      stats.skipped++;
      console.log(`  [skip] "${name}" already has tagType: ${existing.tagType}`);
      continue;
    }

    await setTagType(tag.id, 'level');
    stats.level++;
    console.log(`  [level] "${name}"`);
  }

  // 3. Seed technology vocabulary (curated list with explicit slugs)
  console.log('\nSeeding technology vocabulary...');
  for (const [name, slug] of Object.entries(TECHNOLOGY_VOCABULARY)) {
    const [existing] = await db
      .select({ id: tutorialTags.id, tagType: tutorialTags.tagType })
      .from(tutorialTags)
      .where(eq(tutorialTags.slug, slug));

    if (existing) {
      if (existing.tagType) {
        stats.skipped++;
        console.log(`  [skip] "${name}" already has tagType: ${existing.tagType}`);
        continue;
      }
      await setTagType(existing.id, 'technology');
      stats.technology++;
      console.log(`  [technology] "${name}" (existing)`);
    } else {
      await db.insert(tutorialTags).values({ name, slug, tagType: 'technology' });
      stats.technology++;
      console.log(`  [technology] "${name}" (created)`);
    }
  }

  // 4. Report
  console.log('\n=== Summary ===');
  console.log(`Technology tags seeded: ${stats.technology}`);
  console.log(`Category tags seeded:  ${stats.category}`);
  console.log(`Level tags seeded:     ${stats.level}`);
  console.log(`Skipped (already typed): ${stats.skipped}`);
}

// ─── Entry point ───────────────────────────────────────────────────────

main()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
