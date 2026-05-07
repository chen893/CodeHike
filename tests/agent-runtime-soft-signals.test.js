import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCritiqueSignals,
  buildLocWarningSignal,
  createSoftSignalCollector,
  shouldCritiqueStep,
} from '../lib/ai/agent-runtime/soft-signals.ts';

test('shouldCritiqueStep only triggers every fourth completed step with enough context', () => {
  assert.equal(shouldCritiqueStep(2, 3), false);
  assert.equal(shouldCritiqueStep(3, 4), true);
  assert.equal(shouldCritiqueStep(7, 8), true);
});

test('buildCritiqueSignals emits advisory critique and pedagogical drift warnings', () => {
  const signals = buildCritiqueSignals(3, {
    totalScore: 78,
    scorecard: {
      contentIntegrity: 80,
      pedagogicalProgression: 62,
      sourceCoverage: 80,
      scrollytellingReadiness: 80,
      publishReadiness: 80,
      promptAlignment: 80,
    },
    issues: [{ code: 'x' }],
  });

  assert.equal(signals.length, 2);
  assert.equal(signals[0].code, 'critique_score');
  assert.equal(signals[1].code, 'pedagogical_drift');
  assert.equal(signals[1].level, 'warn');
});

test('buildLocWarningSignal only emits soft warnings above the advisory threshold', () => {
  assert.equal(
    buildLocWarningSignal({
      stepIndex: 0,
      estimatedLocChange: 10,
      step: {
        id: 'step-1',
        chapterId: 'ch-1',
        title: 'Small step',
        paragraphs: ['text'],
        patches: [
          {
            find: 'const x = 1;\n',
            replace: 'const x = 1;\nconst y = 2;\n',
          },
        ],
      },
    }),
    null,
  );

  const signal = buildLocWarningSignal({
    stepIndex: 1,
    estimatedLocChange: 8,
    step: {
      id: 'step-2',
      chapterId: 'ch-1',
      title: 'Large step',
      paragraphs: ['text'],
      patches: [
        {
          find: 'const x = 1;\n',
          replace: Array.from({ length: 90 }, (_, index) => `const value${index} = ${index};`).join('\n'),
        },
      ],
    },
  });

  assert.equal(signal?.code, 'loc_budget_exceeded');
  assert.equal(signal?.level, 'warn');
});

test('createSoftSignalCollector stores advisory signals without changing runtime decisions', () => {
  const collector = createSoftSignalCollector();
  collector.record({
    kind: 'critique',
    stepIndex: 3,
    level: 'warn',
    code: 'pedagogical_drift',
    message: 'warning',
  });

  assert.deepEqual(collector.list(), [
    {
      kind: 'critique',
      stepIndex: 3,
      level: 'warn',
      code: 'pedagogical_drift',
      message: 'warning',
    },
  ]);
});
