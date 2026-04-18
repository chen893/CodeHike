import test from 'node:test';
import assert from 'node:assert/strict';
import { createUuid } from '../lib/utils/uuid.ts';

test('createUuid falls back when randomUUID is unavailable', () => {
  const originalCrypto = globalThis.crypto;

  try {
    globalThis.crypto = {
      getRandomValues(target) {
        for (let index = 0; index < target.length; index += 1) {
          target[index] = index;
        }
        return target;
      },
    };

    const uuid = createUuid();
    assert.match(
      uuid,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  } finally {
    globalThis.crypto = originalCrypto;
  }
});
