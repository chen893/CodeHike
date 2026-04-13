import test from 'node:test';
import assert from 'node:assert/strict';
import { getMaxOutputTokens, getAvailableProviders, createProvider } from '../lib/ai/provider-registry.ts';

// ── getMaxOutputTokens ──

test('getMaxOutputTokens returns 8192 for deepseek/deepseek-chat', () => {
  assert.equal(getMaxOutputTokens('deepseek/deepseek-chat'), 8192);
});

test('getMaxOutputTokens returns 16384 for openai/gpt-4o', () => {
  assert.equal(getMaxOutputTokens('openai/gpt-4o'), 16384);
});

test('getMaxOutputTokens returns 8192 for unknown provider (default)', () => {
  assert.equal(getMaxOutputTokens('unknown/model'), 8192);
});

test('getMaxOutputTokens returns 8192 when called with no argument (default)', () => {
  // Relies on DEFAULT_AI_MODEL not being set in test env, falling back to deepseek
  assert.equal(getMaxOutputTokens(), 8192);
});

// ── getAvailableProviders ──

test('getAvailableProviders returns deepseek and openai', () => {
  const providers = getAvailableProviders();
  assert.deepEqual(providers.sort(), ['deepseek', 'openai']);
});

// ── createProvider error cases ──

test('createProvider throws for unknown provider', () => {
  assert.throws(
    () => createProvider('nonexistent/some-model'),
    /Unknown provider: nonexistent/
  );
});

test('createProvider throws when API key is missing', () => {
  // Ensure the env var is not set for this test
  const originalKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  try {
    assert.throws(
      () => createProvider('deepseek/deepseek-chat'),
      /Missing API key: DEEPSEEK_API_KEY/
    );
  } finally {
    // Restore if it was set
    if (originalKey) process.env.DEEPSEEK_API_KEY = originalKey;
  }
});
