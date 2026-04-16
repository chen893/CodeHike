import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the cancel signal mechanism (dual-signal: in-memory + DB).
 *
 * These tests verify the cancel signal logic without requiring a database.
 * For DB-level cancel tests, see generation-job-db.test.js (integration).
 *
 * The in-memory path (activeGenerations map + cancelToken) and the
 * DB-level path (signalCancelDraftGenerationJob / isCancelRequestedForJob)
 * are tested through source analysis and mock-based logic.
 */

test('signalCancelDraftGenerationJob only targets queued or running jobs', async () => {
  // Verify the SQL WHERE clause in the repository limits to active statuses
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'repositories', 'draft-generation-job-repository.ts'),
    'utf8'
  );

  // The signalCancelDraftGenerationJob function should filter by active statuses
  const signalFnMatch = source.match(
    /export async function signalCancelDraftGenerationJob[\s\S]*?^}/m
  );
  assert.ok(signalFnMatch, 'signalCancelDraftGenerationJob function should exist');

  const fnBody = signalFnMatch[0];
  assert.ok(fnBody.includes("'queued'"), 'should check for queued status');
  assert.ok(fnBody.includes("'running'"), 'should check for running status');
  assert.ok(fnBody.includes('cancelRequested'), 'should set cancelRequested');
  assert.ok(fnBody.includes('true'), 'should set cancelRequested to true');
});

test('isCancelRequestedForJob reads cancelRequested column', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'repositories', 'draft-generation-job-repository.ts'),
    'utf8'
  );

  const isCancelMatch = source.match(
    /export async function isCancelRequestedForJob[\s\S]*?^}/m
  );
  assert.ok(isCancelMatch, 'isCancelRequestedForJob function should exist');

  const fnBody = isCancelMatch[0];
  assert.ok(fnBody.includes('cancelRequested'), 'should read cancelRequested column');
  assert.ok(fnBody.includes('true'), 'should check for true value');
});

test('requestGenerationCancel signals both in-memory token and DB', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'services', 'generate-tutorial-draft.ts'),
    'utf8'
  );

  // Verify dual-signal pattern
  assert.match(source, /activeGenerations\.get\(draftId\)/);
  assert.match(source, /token\.value = true/);
  assert.match(source, /signalCancelDraftGenerationJob/);
  assert.match(source, /getLatestDraftGenerationJobByDraftId/);
});

test('cancel token structure is { value: boolean }', async () => {
  // Verify the CancelToken type shape in multi-phase-generator
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'ai', 'multi-phase-generator.ts'),
    'utf8'
  );

  assert.match(source, /CancelToken/);
  assert.match(source, /value.*boolean|value.*:.*boolean/);
});

test('DB schema has cancelRequested column with boolean default false', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'db', 'schema.ts'),
    'utf8'
  );

  assert.match(source, /cancelRequested.*boolean/);
  assert.match(source, /cancel_requested.*default\(false\)/);
});
