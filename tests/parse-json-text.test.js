import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { parseJsonFromText } from '../lib/ai/parse-json-text.ts';

const schema = z.object({
  ok: z.boolean(),
});

test('parseJsonFromText extracts JSON after reasoning tags with braces', () => {
  const parsed = parseJsonFromText(
    '<think>{"draft":false}</think>\n{"ok":true}',
    schema,
    'reasoning-tags',
  );

  assert.deepEqual(parsed, { ok: true });
});

