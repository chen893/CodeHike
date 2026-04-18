const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pinyin } = require('pinyin-pro');

/**
 * BUG-01: Chinese slug generation should produce pinyin-based slugs.
 *
 * These tests verify the generateSlug logic independently by
 * replicating the function's algorithm. The actual function lives
 * in lib/repositories/tag-repository.ts.
 *
 * Strategy: Split the string into segments of CJK and non-CJK characters.
 * Convert CJK segments via pinyin-pro, keep non-CJK segments as-is.
 * Join everything with hyphens.
 */

function generateSlug(name) {
  const lower = name.toLowerCase().trim();
  if (!lower) return 'tag';

  // Split into alternating segments of CJK and non-CJK characters
  const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  const segments = [];
  let current = '';
  let isCurrentCJK = CJK_REGEX.test(lower[0]);

  for (const char of lower) {
    const isCJK = CJK_REGEX.test(char);
    if (isCJK === isCurrentCJK) {
      current += char;
    } else {
      if (current) segments.push({ text: current, isCJK: isCurrentCJK });
      current = char;
      isCurrentCJK = isCJK;
    }
  }
  if (current) segments.push({ text: current, isCJK: isCurrentCJK });

  const parts = segments.map((seg) => {
    if (seg.isCJK) {
      return pinyin(seg.text, { toneType: 'none', type: 'array' }).join('-');
    }
    // Non-CJK: keep as-is, just replace spaces with hyphens
    return seg.text.replace(/\s+/g, '-');
  });

  const joined = parts
    .join('-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return joined || 'tag';
}

describe('generateSlug (BUG-01: Chinese pinyin slugs)', () => {
  it('converts pure Chinese to pinyin slug', () => {
    const slug = generateSlug('前端开发');
    assert.equal(slug, 'qian-duan-kai-fa');
  });

  it('preserves ASCII characters unchanged', () => {
    const slug = generateSlug('React');
    assert.equal(slug, 'react');
  });

  it('handles mixed Chinese + ASCII input', () => {
    const slug = generateSlug('React 基础');
    assert.ok(slug.startsWith('react-'), `Expected slug to start with "react-", got "${slug}"`);
    assert.ok(slug.includes('ji-chu'), `Expected slug to include "ji-chu", got "${slug}"`);
  });

  it('returns "tag" for empty string', () => {
    const slug = generateSlug('');
    assert.equal(slug, 'tag');
  });

  it('returns "tag" for all-special-chars input', () => {
    const slug = generateSlug('!!!###');
    assert.equal(slug, 'tag');
  });

  it('preserves numbers in slug', () => {
    const slug = generateSlug('React 18');
    assert.equal(slug, 'react-18');
  });

  it('handles mixed Chinese + numbers', () => {
    const slug = generateSlug('Vue 3 入门');
    assert.ok(slug.includes('vue'), `Expected slug to include "vue", got "${slug}"`);
    assert.ok(slug.includes('3'), `Expected slug to include "3", got "${slug}"`);
    assert.ok(slug.includes('ru-men'), `Expected slug to include "ru-men", got "${slug}"`);
  });

  it('truncates slugs longer than 64 characters', () => {
    const longName = 'React'.repeat(20); // 100 chars
    const slug = generateSlug(longName);
    assert.ok(slug.length <= 64, `Slug length ${slug.length} exceeds 64`);
  });
});
