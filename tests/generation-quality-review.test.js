import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recommendExperimentDecision,
  reviewGeneratedTutorial,
} from '../lib/review/generation-quality-review.ts';

function buildDraft(overrides = {}) {
  return {
    meta: {
      title: 'Review Test',
      description: 'review draft',
      lang: 'ts',
      fileName: 's01_agent_loop.ts',
    },
    intro: {
      paragraphs: ['intro'],
    },
    chapters: [
      { id: 'ch-1', title: 'Start', description: 'desc', order: 0 },
    ],
    baseCode: {
      's01_agent_loop.ts': 'export function run() {}\n',
    },
    steps: [
      {
        id: 'step-1',
        chapterId: 'ch-1',
        title: 'Add tool execution',
        lead: 'Need tool execution',
        paragraphs: ['Problem', 'Resolution'],
        patches: [{ file: 's01_agent_loop.ts', find: 'run()', replace: 'runTool()' }],
        focus: { file: 's01_agent_loop.ts', find: 'runTool()' },
        marks: [{ file: 's01_agent_loop.ts', find: 'runTool()', color: '#fff' }],
      },
    ],
    ...overrides,
  };
}

test('reviewGeneratedTutorial flags placeholder step content as critical', () => {
  const review = reviewGeneratedTutorial({
    tutorialDraft: buildDraft({
      steps: [
        {
          id: 'step-1',
          chapterId: 'ch-1',
          title: 'Broken step',
          paragraphs: ['⚠️ 此步骤自动生成失败，请手动编辑。错误：parse failed'],
        },
      ],
    }),
    sourceItems: [
      { id: '1c9c2b54-52cf-4838-9358-b2a2d5a2d101', kind: 'snippet', label: 's01_agent_loop.ts', content: 'x' },
    ],
    validationValid: false,
    validationErrors: ['broken step'],
  });

  assert.ok(review.issues.some((issue) => issue.code === 'PLACEHOLDER_STEP_CONTENT'));
  assert.ok(review.scorecard.contentIntegrity < 80);
  assert.ok(review.scorecard.publishReadiness < 70);
  assert.equal(review.stopCondition.met, false);
});

test('reviewGeneratedTutorial penalizes progressive snapshots that collapse to one file', () => {
  const review = reviewGeneratedTutorial({
    tutorialDraft: buildDraft(),
    sourceItems: [
      { id: '7aa6aa50-b9e5-4a7b-a411-80b455aa6d11', kind: 'snippet', label: 's01_agent_loop.ts', content: 'x' },
      { id: 'bb46028a-a42d-47d5-82ad-7444984c7ea2', kind: 'snippet', label: 's02_tool_use.ts', content: 'x' },
      { id: '06fbd6b2-e0f6-476e-8f95-8b6cc3852f3d', kind: 'snippet', label: 's03_todo_write.ts', content: 'x' },
      { id: '062ce591-272b-4519-94e4-6fd1afbdd36c', kind: 'snippet', label: 'shared.ts', content: 'x' },
    ],
    validationValid: true,
    validationErrors: [],
  });

  assert.ok(review.issues.some((issue) => issue.code === 'SOURCE_COVERAGE_COLLAPSE'));
  assert.ok(review.scorecard.sourceCoverage < 70);
});

test('recommendExperimentDecision keeps only improving runs', () => {
  const previous = reviewGeneratedTutorial({
    tutorialDraft: buildDraft({
      steps: [{ id: 'step-1', chapterId: 'ch-1', title: 'Broken', paragraphs: ['⚠️ 此步骤自动生成失败，请手动编辑。错误：parse failed'] }],
    }),
    sourceItems: [
      { id: '18a016cf-df17-4ed8-a752-a794c0c14f76', kind: 'snippet', label: 's01_agent_loop.ts', content: 'x' },
    ],
    validationValid: false,
    validationErrors: ['broken'],
  });
  const current = reviewGeneratedTutorial({
    tutorialDraft: buildDraft(),
    sourceItems: [
      { id: '49c153b4-b6ea-44fc-8445-8f6b1294cf0e', kind: 'snippet', label: 's01_agent_loop.ts', content: 'x' },
    ],
    validationValid: true,
    validationErrors: [],
  });

  const decision = recommendExperimentDecision(current, previous);
  assert.equal(decision.recommendedDecision, 'keep');
});

test('reviewGeneratedTutorial accepts legacy drafts without chapters', () => {
  const legacyDraft = buildDraft();
  delete legacyDraft.chapters;
  delete legacyDraft.steps[0].chapterId;

  const review = reviewGeneratedTutorial({
    tutorialDraft: legacyDraft,
    sourceItems: [
      { id: 'e01eb704-fafe-4dff-92b4-a36924cd4001', kind: 'snippet', label: 's01_agent_loop.ts', content: 'x' },
    ],
    validationValid: true,
    validationErrors: [],
  });

  assert.equal(review.metrics.chapterCount, 1);
  assert.equal(review.metrics.stepCount, 1);
});
