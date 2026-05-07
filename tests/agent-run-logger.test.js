import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAgentRunLogger } from '../lib/ai/agent-run-logger.ts';

test('agent run logger writes isolated trace files with job metadata', (t) => {
  const previousDebug = process.env.AGENT_LOOP_DEBUG;
  const previousLogDir = process.env.AGENT_LOOP_LOG_DIR;
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-run-logger-'));

  process.env.AGENT_LOOP_DEBUG = '1';
  process.env.AGENT_LOOP_LOG_DIR = logDir;
  t.after(() => {
    if (previousDebug === undefined) {
      delete process.env.AGENT_LOOP_DEBUG;
    } else {
      process.env.AGENT_LOOP_DEBUG = previousDebug;
    }
    if (previousLogDir === undefined) {
      delete process.env.AGENT_LOOP_LOG_DIR;
    } else {
      process.env.AGENT_LOOP_LOG_DIR = previousLogDir;
    }
  });

  const first = createAgentRunLogger({
    jobId: '11111111-1111-4111-8111-111111111111',
    draftId: 'draft-1',
    modelId: 'model-a',
  });
  const second = createAgentRunLogger({
    jobId: '22222222-2222-4222-8222-222222222222',
    draftId: 'draft-2',
    modelId: 'model-b',
  });

  first.logEvent('step-validation', { stepIndex: 0 });
  second.logEvent('step-validation', { stepIndex: 1 });

  assert.ok(first.logFilePath);
  assert.ok(second.logFilePath);
  assert.notEqual(first.logFilePath, second.logFilePath);

  const firstLines = fs.readFileSync(first.logFilePath, 'utf8').trim().split('\n').map(JSON.parse);
  const secondLines = fs.readFileSync(second.logFilePath, 'utf8').trim().split('\n').map(JSON.parse);

  assert.equal(firstLines[0].jobId, '11111111-1111-4111-8111-111111111111');
  assert.equal(firstLines[0].draftId, 'draft-1');
  assert.equal(firstLines[1]._idx, 1);
  assert.equal(secondLines[0].jobId, '22222222-2222-4222-8222-222222222222');
  assert.equal(secondLines[0].draftId, 'draft-2');
  assert.equal(secondLines[1]._idx, 1);
});
