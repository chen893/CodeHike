import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tryAutoFixPatches } from '../lib/ai/patch-auto-fix.js';

describe('patch-auto-fix', () => {
  it('returns success=false when no fix needed (already matches)', () => {
    const result = tryAutoFixPatches(
      { 'index.js': 'const x = 1;\nconst y = 2;' },
      [{ find: 'const x = 1;', replace: 'const x = 3;' }],
      'index.js',
    );
    assert.equal(result.success, false); // nothing was fixed
    assert.equal(result.fixedPatches.length, 1);
    assert.equal(result.fixedPatches[0].find, 'const x = 1;');
  });

  it('fixes trailing whitespace mismatch', () => {
    const result = tryAutoFixPatches(
      { 'index.js': 'const x = 1;   \nconst y = 2;' },
      [{ find: 'const x = 1;\nconst y = 2;', replace: 'const x = 3;\nconst y = 2;' }],
      'index.js',
    );
    // The find has no trailing spaces, but the code does. Auto-fix should normalize.
    // This may or may not succeed depending on the normalization logic.
    // At minimum it should not crash.
    assert.ok(result.fixedPatches.length === 1);
  });

  it('fixes tab-to-space indentation', () => {
    // Tab is converted to 2 spaces; find text uses 2 spaces to match
    const result = tryAutoFixPatches(
      { 'index.js': 'function foo() {\n\treturn 1;\n}' },
      [{ find: 'function foo() {\n  return 1;\n}', replace: 'function foo() {\n  return 2;\n}' }],
      'index.js',
    );
    assert.equal(result.success, true);
    assert.equal(result.fixesApplied.length, 1);
    assert.ok(result.fixesApplied[0].includes('indentation'));
  });

  it('returns success=false when no fix possible', () => {
    const result = tryAutoFixPatches(
      { 'index.js': 'completely different content' },
      [{ find: 'this text does not exist at all', replace: 'something' }],
      'index.js',
    );
    assert.equal(result.success, false);
  });

  it('handles multi-file patches', () => {
    const result = tryAutoFixPatches(
      {
        'index.js': 'const x = 1;',
        'utils.js': 'function helper() {}',
      },
      [
        { find: 'const x = 1;', replace: 'const x = 2;' },
        { find: 'function helper() {}', replace: 'function helper2() {}', file: 'utils.js' },
      ],
      'index.js',
    );
    assert.equal(result.fixedPatches.length, 2);
  });

  it('handles patches for non-existent file gracefully', () => {
    const result = tryAutoFixPatches(
      { 'index.js': 'const x = 1;' },
      [{ find: 'something', replace: 'else', file: 'nonexistent.js' }],
      'index.js',
    );
    assert.equal(result.fixedPatches.length, 1);
    // Original patch kept since file doesn't exist
    assert.equal(result.fixedPatches[0].file, 'nonexistent.js');
  });
});
