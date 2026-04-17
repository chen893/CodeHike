import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findProgressivePlaceholderTargets,
  isProgressivePlaceholderContent,
  materializeBaseCodeForFilledSteps,
  prepareGenerationBaseFiles,
} from '../lib/ai/progressive-snapshot-base-code.ts';

const sourceItems = [
  { label: 'shared.ts' },
  { label: 's01_agent_loop.ts' },
  { label: 's02_tool_use.ts' },
  { label: 's03_todo_write.ts' },
];

const outline = {
  meta: {
    title: 'Test',
    description: 'Test',
    lang: 'typescript',
    fileName: 's01_agent_loop.ts',
  },
  intro: { paragraphs: ['Intro'] },
  baseCode: {
    'shared.ts': 'export const shared = true;',
    's01_agent_loop.ts': 'console.log("s01");',
  },
  steps: [
    {
      id: 'step-1',
      title: 'Step 1',
      teachingGoal: 'Goal 1',
      conceptIntroduced: 'Concept 1',
      estimatedLocChange: 4,
      targetFiles: ['s01_agent_loop.ts'],
    },
    {
      id: 'step-2',
      title: 'Step 2',
      teachingGoal: 'Goal 2',
      conceptIntroduced: 'Concept 2',
      estimatedLocChange: 4,
      targetFiles: ['s02_tool_use.ts'],
    },
    {
      id: 'step-3',
      title: 'Step 3',
      teachingGoal: 'Goal 3',
      conceptIntroduced: 'Concept 3',
      estimatedLocChange: 4,
      targetFiles: ['s03_todo_write.ts'],
    },
  ],
};

test('prepareGenerationBaseFiles injects placeholders for later milestone targets', () => {
  const prepared = prepareGenerationBaseFiles(outline, sourceItems);

  assert.deepEqual(prepared.insertedFiles, ['s02_tool_use.ts', 's03_todo_write.ts']);
  assert.equal(isProgressivePlaceholderContent(prepared.files['s02_tool_use.ts']), true);
  assert.equal(isProgressivePlaceholderContent(prepared.files['s03_todo_write.ts']), true);
  assert.deepEqual(
    findProgressivePlaceholderTargets(prepared.files, ['s01_agent_loop.ts', 's02_tool_use.ts']),
    ['s02_tool_use.ts'],
  );
});

test('prepareGenerationBaseFiles also injects placeholders for ordinary multi-file codebases', () => {
  const prepared = prepareGenerationBaseFiles(
    {
      meta: {
        title: 'Codebase',
        description: 'Codebase',
        lang: 'typescript',
        fileName: 'src/agent.ts',
      },
      intro: { paragraphs: ['Intro'] },
      baseCode: {
        'src/agent.ts': 'export class Agent {}',
      },
      steps: [
        {
          id: 'step-1',
          title: 'Step 1',
          teachingGoal: 'Goal 1',
          conceptIntroduced: 'Concept 1',
          estimatedLocChange: 4,
          targetFiles: ['src/agent.ts'],
        },
        {
          id: 'step-2',
          title: 'Step 2',
          teachingGoal: 'Goal 2',
          conceptIntroduced: 'Concept 2',
          estimatedLocChange: 4,
          targetFiles: ['src/llm.ts'],
        },
      ],
    },
    [
      { label: 'src/agent.ts' },
      { label: 'src/llm.ts' },
    ],
  );

  assert.deepEqual(prepared.insertedFiles, ['src/llm.ts']);
  assert.equal(isProgressivePlaceholderContent(prepared.files['src/llm.ts']), true);
});

test('materializeBaseCodeForFilledSteps only keeps placeholder-backed files that were actually patched', () => {
  const materialized = materializeBaseCodeForFilledSteps(
    outline,
    sourceItems,
    [
      {
        id: 'step-2',
        chapterId: 'ch-1',
        title: 'Step 2',
        paragraphs: ['p1', 'p2'],
        patches: [
          {
            file: 's02_tool_use.ts',
            find: '// __VIBEDOCS_PROGRESSIVE_PLACEHOLDER__: s02_tool_use.ts',
            replace: 'console.log("s02");',
          },
        ],
      },
    ],
    ['s02_tool_use.ts', 's03_todo_write.ts'],
  );

  assert.equal(typeof materialized, 'object');
  assert.equal(Object.hasOwn(materialized, 's02_tool_use.ts'), true);
  assert.equal(Object.hasOwn(materialized, 's03_todo_write.ts'), false);
  assert.equal(isProgressivePlaceholderContent(materialized['s02_tool_use.ts']), true);
});
