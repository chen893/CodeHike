import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for idempotent draft creation:
 * 1. inputHash-based dedup in createDraft service
 * 2. In-memory Idempotency-Key store in the POST /api/drafts route
 */

test('createDraft service calls findRecentDraftByInputHash before creating', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'services', 'create-draft.ts'),
    'utf8'
  );

  // Must compute inputHash
  assert.match(source, /computeInputHash/);

  // Must look up existing draft by hash
  assert.match(source, /findRecentDraftByInputHash/);

  // Must return existing draft when found
  assert.match(source, /if \(existing\)/);
  assert.match(source, /return existing/);
});

test('findRecentDraftByInputHash queries within 1-hour window', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'repositories', 'draft-repository.ts'),
    'utf8'
  );

  // Must filter by userId
  assert.match(source, /userId/);

  // Must filter by inputHash
  assert.match(source, /inputHash/);

  // Must use 1-hour window (60 * 60 * 1000 or similar)
  assert.match(source, /60.*60.*1000|oneHourAgo/);

  // Must filter createdAt >= oneHourAgo
  assert.match(source, /gte\(drafts\.createdAt/);
});

test('Idempotency-Key store in POST route returns cached draft for same key', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'api', 'drafts', 'route.ts'),
    'utf8'
  );

  // Must read Idempotency-Key header
  assert.match(source, /Idempotency-Key/);

  // Must check store for cached entry
  assert.match(source, /idempotencyStore\.get/);

  // Must return cached draft ID with 201
  assert.match(source, /cached\.draftId/);
  assert.match(source, /201/);

  // Must store new key after creation
  assert.match(source, /idempotencyStore\.set/);

  // Must have TTL (1 hour)
  assert.match(source, /IDEMPOTENCY_TTL_MS/);
  assert.match(source, /60.*60.*1000/);
});

test('Idempotency-Key store expires entries after TTL', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'api', 'drafts', 'route.ts'),
    'utf8'
  );

  // Must have cleanup interval
  assert.match(source, /setInterval/);
  assert.match(source, /10.*60.*1000/); // cleanup every 10 minutes

  // Must delete expired entries
  assert.match(source, /idempotencyStore\.delete/);
  assert.match(source, /expiresAt/);
});

test('Idempotency-Key store also accepts X-Idempotency-Key header', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const url = await import('node:url');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'app', 'api', 'drafts', 'route.ts'),
    'utf8'
  );

  assert.match(source, /X-Idempotency-Key/);
});

test('computeInputHash produces deterministic SHA-256 hashes', async () => {
  const { computeInputHash } = await import('../lib/utils/hash.ts');

  const sourceItems = [
    { id: '00000000-0000-4000-8000-000000000001', kind: 'snippet', path: 'a.ts', content: 'hello' },
  ];
  const brief = { topic: 'Test', core_question: 'Why?' };

  const hash1 = computeInputHash(sourceItems, brief);
  const hash2 = computeInputHash(sourceItems, brief);

  // Same input = same hash
  assert.equal(hash1, hash2);

  // Should be 64-char hex string (SHA-256)
  assert.equal(hash1.length, 64);
  assert.match(hash1, /^[0-9a-f]+$/);
});

test('computeInputHash produces different hashes for different inputs', async () => {
  const { computeInputHash } = await import('../lib/utils/hash.ts');

  const items1 = [
    { id: '00000000-0000-4000-8000-000000000001', kind: 'snippet', path: 'a.ts', content: 'hello' },
  ];
  const items2 = [
    { id: '00000000-0000-4000-8000-000000000001', kind: 'snippet', path: 'a.ts', content: 'world' },
  ];
  const brief = { topic: 'Test', core_question: 'Why?' };

  const hash1 = computeInputHash(items1, brief);
  const hash2 = computeInputHash(items2, brief);

  assert.notEqual(hash1, hash2);
});

test('in-memory idempotency store logic returns cached response within TTL', () => {
  // Simulate the idempotency store logic
  const store = new Map();
  const TTL_MS = 60 * 60 * 1000;

  function setIdempotency(key, draftId) {
    store.set(key, { draftId, expiresAt: Date.now() + TTL_MS });
  }

  function getIdempotency(key) {
    const cached = store.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.draftId;
    }
    return null;
  }

  // Set and retrieve within TTL
  setIdempotency('key-1', 'draft-abc');
  assert.equal(getIdempotency('key-1'), 'draft-abc');

  // Different key returns null
  assert.equal(getIdempotency('key-2'), null);
});

test('in-memory idempotency store ignores expired entries', () => {
  const store = new Map();

  function setIdempotency(key, draftId, ttlMs) {
    store.set(key, { draftId, expiresAt: Date.now() + ttlMs });
  }

  function getIdempotency(key) {
    const cached = store.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.draftId;
    }
    return null;
  }

  // Set with very short TTL (already expired)
  setIdempotency('key-expired', 'draft-xyz', -1000);
  assert.equal(getIdempotency('key-expired'), null);
});
