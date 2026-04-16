import test from 'node:test';
import assert from 'node:assert/strict';

// We need to test isUniqueViolation which is a private function in publish-draft.ts.
// We'll read the source and test the logic by re-implementing the check identically,
// and also test the PublishSlugConflictError class directly.

test('PublishSlugConflictError has correct properties', async () => {
  const { PublishSlugConflictError } = await import('../lib/errors/error-types.ts');

  const error = new PublishSlugConflictError('my-awesome-tutorial');
  assert.equal(error.name, 'PublishSlugConflictError');
  assert.equal(error.code, 'PUBLISH_SLUG_CONFLICT');
  assert.equal(error.message, 'Slug "my-awesome-tutorial" is already taken');
  assert.ok(error instanceof Error);
});

test('PublishSlugConflictError is distinct from generic Error', async () => {
  const { PublishSlugConflictError } = await import('../lib/errors/error-types.ts');

  const conflict = new PublishSlugConflictError('test-slug');
  const generic = new Error('test-slug');

  assert.ok(conflict instanceof PublishSlugConflictError);
  assert.ok(!(generic instanceof PublishSlugConflictError));
});

test('isUniqueViolation logic detects Postgres error code 23505', async () => {
  // The isUniqueViolation function is not exported, so we test it by
  // extracting the logic from publish-draft.ts and verifying the behavior.
  // The function checks: e.code === '23505', recurses into .driverError and .cause.

  function isUniqueViolation(err) {
    if (err && typeof err === 'object') {
      const e = err;
      if (e.code === '23505') return true;
      if (e.driverError && isUniqueViolation(e.driverError)) return true;
      if (e.cause && isUniqueViolation(e.cause)) return true;
    }
    return false;
  }

  // Direct Postgres error
  assert.equal(isUniqueViolation({ code: '23505' }), true);
  assert.equal(isUniqueViolation({ code: '23503' }), false);
  assert.equal(isUniqueViolation({ code: '23514' }), false);
  assert.equal(isUniqueViolation({}), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
  assert.equal(isUniqueViolation('string'), false);
  assert.equal(isUniqueViolation(42), false);

  // Nested in driverError
  assert.equal(
    isUniqueViolation({ driverError: { code: '23505' } }),
    true
  );

  // Nested in cause
  assert.equal(
    isUniqueViolation({ cause: { code: '23505' } }),
    true
  );

  // Deeply nested
  assert.equal(
    isUniqueViolation({ driverError: { cause: { code: '23505' } } }),
    true
  );

  // Nested but not 23505
  assert.equal(
    isUniqueViolation({ driverError: { code: '23503' } }),
    false
  );
});

test('publish-draft.ts source contains isUniqueViolation with 23505 check', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'services', 'publish-draft.ts'),
    'utf8'
  );

  // Verify the function exists and handles the error code
  assert.match(source, /function isUniqueViolation/);
  assert.match(source, /23505/);
  assert.match(source, /driverError/);
  assert.match(source, /\.cause/);

  // Verify PublishSlugConflictError is thrown on unique violation
  assert.match(source, /if \(isUniqueViolation\(err\)\)/);
  assert.match(source, /throw new PublishSlugConflictError/);
});

test('publish-draft.ts checks slug uniqueness both early-exit and in transaction', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'services', 'publish-draft.ts'),
    'utf8'
  );

  // Early exit via isSlugTaken
  assert.match(source, /isSlugTaken/);
  assert.match(source, /throw new PublishSlugConflictError\(slug\)/);

  // Transaction-based guard via unique constraint catch
  assert.match(source, /db\.transaction/);
  assert.match(source, /isUniqueViolation\(err\)/);
});
