import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendStepBudget } from '../lib/ai/step-budget.ts';

test('recommendStepBudget stays generic across non-agent module names', () => {
  const sourceItems = [
    {
      id: '9ff13014-4cef-46d9-b8ba-98dcf77555f5',
      kind: 'snippet',
      label: 'src/parser/tokenizer.ts',
      content: 'export function tokenize() {}\n'.repeat(80),
    },
    {
      id: 'c1165451-8139-4eb3-822c-75c6be2c26c7',
      kind: 'snippet',
      label: 'src/parser/ast.ts',
      content: 'export interface Node {}\n'.repeat(40),
    },
    {
      id: '9ee41060-0317-4884-8956-f8430f9a82a6',
      kind: 'snippet',
      label: 'src/runtime/evaluator.ts',
      content: 'export function evalNode() {}\n'.repeat(90),
    },
    {
      id: '83f52461-dab6-4051-ba90-b8b29eec7db0',
      kind: 'snippet',
      label: 'README.md',
      content: '# docs',
    },
  ];

  const budget = recommendStepBudget(sourceItems, {
    topic: 'Build interpreter',
    audience_level: 'beginner',
    core_question: 'How to build it',
    ignore_scope: '',
    output_language: 'zh-CN',
    desired_depth: 'deep',
  });

  assert.ok(budget.recommended >= 10);
  assert.ok(budget.max > budget.min);
  assert.equal(budget.coreFileCount, 3);
  assert.ok(budget.architectureLayerCount >= 2);
});
