import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {
  classifyFailureMessage,
  shouldAbortRun,
  shouldAcceptDegradedStep,
  shouldCompress,
  shouldRetryRepair,
  shouldReviseTail,
} from '../lib/ai/agent-runtime/recovery-policy.ts';

test('classifyFailureMessage distinguishes provider, unrecoverable, repairable, and validation failures', () => {
  assert.equal(classifyFailureMessage('429 rate limit from provider'), 'provider');
  assert.equal(
    classifyFailureMessage('Patch 目标文件 "foo.ts" 不存在于当前文件集中'),
    'unrecoverable',
  );
  assert.equal(classifyFailureMessage('Patch 匹配失败: 找不到:\nfoo'), 'repairable');
  assert.equal(classifyFailureMessage('chapter structure invalid'), 'validation');
});

test('shouldRetryRepair stops on unrecoverable/provider failures and on retry exhaustion', () => {
  assert.equal(
    shouldRetryRepair({
      attempt: 0,
      maxRepairsPerStep: 3,
      category: 'repairable',
    }),
    true,
  );
  assert.equal(
    shouldRetryRepair({
      attempt: 2,
      maxRepairsPerStep: 3,
      category: 'repairable',
    }),
    false,
  );
  assert.equal(
    shouldRetryRepair({
      attempt: 0,
      maxRepairsPerStep: 3,
      category: 'provider',
    }),
    false,
  );
  assert.equal(
    shouldRetryRepair({
      attempt: 0,
      maxRepairsPerStep: 3,
      category: 'unrecoverable',
    }),
    false,
  );
});

test('shouldReviseTail only allows replans within threshold or on immediate unrecoverable failure', () => {
  assert.equal(
    shouldReviseTail({
      consecutiveRepairFailures: 2,
      replanCount: 0,
      maxReplans: 2,
    }),
    true,
  );
  assert.equal(
    shouldReviseTail({
      consecutiveRepairFailures: 1,
      replanCount: 0,
      maxReplans: 2,
      immediate: true,
    }),
    true,
  );
  assert.equal(
    shouldReviseTail({
      consecutiveRepairFailures: 4,
      replanCount: 2,
      maxReplans: 2,
    }),
    false,
  );
});

test('shouldCompress uses deterministic summary and replan thresholds', () => {
  assert.equal(shouldCompress({ used: 64, budget: 100 }), null);
  assert.equal(shouldCompress({ used: 65, budget: 100 }), 'summary');
  assert.equal(shouldCompress({ used: 85, budget: 100 }), 'replan');
});

test('shouldAbortRun only aborts on cancel, max turns, or provider failure', () => {
  assert.equal(
    shouldAbortRun({ currentTurnCount: 29, maxTurns: 30, category: 'repairable' }),
    false,
  );
  assert.equal(
    shouldAbortRun({ currentTurnCount: 30, maxTurns: 30, category: 'repairable' }),
    false,
  );
  assert.equal(
    shouldAbortRun({ currentTurnCount: 31, maxTurns: 30, category: 'repairable' }),
    true,
  );
  assert.equal(shouldAbortRun({ cancelled: true }), true);
  assert.equal(shouldAbortRun({ category: 'provider' }), true);
});

test('shouldAcceptDegradedStep stays disabled', () => {
  assert.equal(shouldAcceptDegradedStep(), false);
});

test('repair failure drift counter increments on retry persistence, not twice through onAction', () => {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'services', 'generate-tutorial-draft.ts'),
    'utf8',
  );

  const actionBlock = source.match(/onAction: async \(event\) => \{[\s\S]*?\n    \},\n    onOutlineReady:/);
  const retryBlock = source.match(/onStepRetry: async \(event\) => \{[\s\S]*?\n    \},\n    onStepCompleted:/);

  assert.ok(actionBlock, 'onAction block should exist');
  assert.ok(retryBlock, 'onStepRetry block should exist');
  assert.match(
    actionBlock[0],
    /consecutiveRepairFailures:\s*\n?\s*agentState\?\.driftSignals\.consecutiveRepairFailures/,
  );
  assert.match(
    retryBlock[0],
    /consecutiveRepairFailures:\s*\n?\s*\(agentState\?\.driftSignals\.consecutiveRepairFailures \?\? 0\) \+ 1/,
  );
});

test('compression-driven replans persist a replan action after full replan succeeds', () => {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'ai', 'agent-generator.ts'),
    'utf8',
  );

  assert.match(
    source,
    /compressionResult\.action === 'replan'[\s\S]*?onAction\?\.\(\{\s*action: 'replan'/,
  );
});

test('agent replans refresh the persisted outline snapshot before continuing', () => {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'ai', 'agent-generator.ts'),
    'utf8',
  );

  assert.match(
    source,
    /const revisedOutline = await reviseOutline[\s\S]*?outline = revisedOutline;[\s\S]*?await lifecycleHooks\.onOutlineReady\?\.\(outline\)/,
  );
  assert.match(
    source,
    /compressionResult\.action === 'replan'[\s\S]*?outline = compressionResult\.outline;[\s\S]*?await lifecycleHooks\.onOutlineReady\?\.\(outline\)/,
  );
});

test('partial checkpoint persistence failures abort instead of being swallowed', () => {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'services', 'generate-tutorial-draft.ts'),
    'utf8',
  );

  assert.match(
    source,
    /Failed to persist partial draft[\s\S]*?throw err;/,
  );
});
