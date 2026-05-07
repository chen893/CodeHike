import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  generateStructuredObject,
  selectStructuredOutputModes,
} from '../lib/ai/structured-output-adapter.ts';

const personSchema = z.object({
  name: z.string(),
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const aiDir = path.join(repoRoot, 'lib', 'ai');

function collectAiFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectAiFiles(fullPath);
    return entry.name.endsWith('.ts') ? [fullPath] : [];
  });
}

test('selectStructuredOutputModes prefers native output for native-capable models', () => {
  assert.deepEqual(
    selectStructuredOutputModes({
      modelId: 'openai/gpt-4o',
      preferredModes: ['native_object', 'forced_output_tool', 'prompted_json'],
    }),
    ['native_object', 'forced_output_tool', 'prompted_json'],
  );
});

test('selectStructuredOutputModes uses output tools for tool-capable manual models', () => {
  assert.deepEqual(
    selectStructuredOutputModes({
      modelId: 'minimax/MiniMax-M2.7',
      preferredModes: ['native_object', 'forced_output_tool', 'prompted_json'],
    }),
    ['forced_output_tool', 'prompted_json'],
  );
});

test('selectStructuredOutputModes uses DEFAULT_AI_MODEL when modelId is omitted', () => {
  const previous = process.env.DEFAULT_AI_MODEL;
  process.env.DEFAULT_AI_MODEL = 'minimax/MiniMax-M2.7';
  try {
    assert.deepEqual(
      selectStructuredOutputModes({
        preferredModes: ['native_object', 'forced_output_tool', 'prompted_json'],
      }),
      ['forced_output_tool', 'prompted_json'],
    );
  } finally {
    if (previous === undefined) {
      delete process.env.DEFAULT_AI_MODEL;
    } else {
      process.env.DEFAULT_AI_MODEL = previous;
    }
  }
});


test('generateStructuredObject returns native Output.object results', async () => {
  const calls = [];
  const result = await generateStructuredObject({
    label: 'native-person',
    schemaName: 'person',
    schema: personSchema,
    model: {},
    modelId: 'openai/gpt-4o',
    prompt: 'Return a person',
    useNativeStructuredOutput: true,
    preferredModes: ['native_object'],
    generateTextFn: async (options) => {
      calls.push(options);
      return {
        output: { name: 'Ada' },
        text: '{"name":"Ada"}',
      };
    },
  });

  assert.equal(result.mode, 'native_object');
  assert.deepEqual(result.output, { name: 'Ada' });
  assert.ok(calls[0].output);
});

test('generateStructuredObject can force an output tool call', async () => {
  const calls = [];
  const result = await generateStructuredObject({
    label: 'tool-person',
    schemaName: 'person',
    schema: personSchema,
    model: {},
    modelId: 'minimax/MiniMax-M2.7',
    prompt: 'Return a person',
    preferredModes: ['forced_output_tool'],
    generateTextFn: async (options) => {
      calls.push(options);
      return {
        text: '',
        toolCalls: [
          {
            type: 'tool-call',
            toolName: options.toolChoice.toolName,
            input: { name: 'Ada' },
          },
        ],
        response: { messages: [] },
      };
    },
  });

  assert.equal(result.mode, 'forced_output_tool');
  assert.deepEqual(result.output, { name: 'Ada' });
  assert.deepEqual(calls[0].toolChoice, {
    type: 'tool',
    toolName: 'submit_person',
  });
});

test('generateStructuredObject repairs prompted JSON once', async () => {
  let callCount = 0;
  const result = await generateStructuredObject({
    label: 'prompted-person',
    schemaName: 'person',
    schema: personSchema,
    model: {},
    modelId: 'unknown-model',
    prompt: 'Return a person',
    preferredModes: ['prompted_json'],
    generateTextFn: async () => {
      callCount++;
      return {
        text: callCount === 1 ? 'not json' : '{"name":"Ada"}',
        response: { messages: [] },
      };
    },
  });

  assert.equal(result.mode, 'prompted_json');
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.output, { name: 'Ada' });
});

test('parseJsonFromText is only imported by the structured output adapter', () => {
  const violations = [];

  for (const filePath of collectAiFiles(aiDir)) {
    const relativePath = path.relative(repoRoot, filePath);
    if (relativePath === 'lib/ai/structured-output-adapter.ts') continue;
    if (relativePath === 'lib/ai/parse-json-text.ts') continue;

    const source = fs.readFileSync(filePath, 'utf8');
    if (source.includes("from './parse-json-text'") || source.includes("from '../parse-json-text'")) {
      violations.push(relativePath);
    }
  }

  assert.deepEqual(violations, []);
});
