import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for stale generation job recovery (recoverStaleGenerationJobs).
 *
 * These tests verify the stale recovery logic through source analysis
 * and structure validation. For DB integration tests, see generation-job-db.test.js.
 */

test('recoverStaleGenerationJobs finds jobs where status is active and leaseUntil < now', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'repositories', 'draft-generation-job-repository.ts'),
    'utf8'
  );

  const recoverMatch = source.match(
    /export async function recoverStaleGenerationJobs[\s\S]*?^}/m
  );
  assert.ok(recoverMatch, 'recoverStaleGenerationJobs function should exist');

  const fnBody = recoverMatch[0];

  // Must filter for active statuses
  assert.ok(fnBody.includes("'queued'"), 'should check for queued status');
  assert.ok(fnBody.includes("'running'"), 'should check for running status');

  // Must compare leaseUntil against current time
  assert.ok(fnBody.includes('leaseUntil'), 'should check leaseUntil');
  assert.ok(fnBody.includes('new Date()') || fnBody.includes('now'), 'should compare with current time');

  // Must set abandoned status
  assert.ok(fnBody.includes("'abandoned'"), 'should mark as abandoned');

  // Must set JOB_STALE error code
  assert.ok(fnBody.includes("'JOB_STALE'"), 'should set JOB_STALE error code');

  // Must clear leaseUntil
  assert.ok(fnBody.includes('leaseUntil') && fnBody.includes('null'), 'should clear leaseUntil');
});

test('recoverStaleGenerationJobs clears activeGenerationJobId on associated drafts', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'repositories', 'draft-generation-job-repository.ts'),
    'utf8'
  );

  const recoverMatch = source.match(
    /export async function recoverStaleGenerationJobs[\s\S]*?^}/m
  );
  assert.ok(recoverMatch);

  const fnBody = recoverMatch[0];

  // Must update drafts table
  assert.ok(fnBody.includes('drafts'), 'should update drafts');
  assert.ok(
    fnBody.includes('activeGenerationJobId') && fnBody.includes('null'),
    'should clear activeGenerationJobId on drafts'
  );
});

test('recoverStaleGenerationJobs uses a transaction for atomicity', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'repositories', 'draft-generation-job-repository.ts'),
    'utf8'
  );

  const recoverMatch = source.match(
    /export async function recoverStaleGenerationJobs[\s\S]*?^}/m
  );
  assert.ok(recoverMatch);

  const fnBody = recoverMatch[0];

  // Should use a transaction
  assert.ok(fnBody.includes('transaction'), 'should use a transaction');
});

test('recoverStaleGenerationJobs returns 0 when no stale jobs', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'repositories', 'draft-generation-job-repository.ts'),
    'utf8'
  );

  const recoverMatch = source.match(
    /export async function recoverStaleGenerationJobs[\s\S]*?^}/m
  );
  assert.ok(recoverMatch);

  const fnBody = recoverMatch[0];

  // Should have early exit when no stale jobs
  assert.ok(fnBody.includes('return 0'), 'should return 0 for no stale jobs');
});

test('stale recovery is called before initiating a new generation', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'services', 'generate-tutorial-draft.ts'),
    'utf8'
  );

  // The initiateGeneration function should call recoverStaleGenerationJobs
  assert.match(source, /recoverStaleGenerationJobs/);
  assert.match(source, /recoveredCount/);
});

test('DB has index on leaseUntil for active jobs', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'db', 'schema.ts'),
    'utf8'
  );

  // Verify the index exists for efficient stale lookup
  assert.match(source, /draft_generation_jobs_active_lease_until_idx/);
  assert.match(source, /leaseUntil/);
});
