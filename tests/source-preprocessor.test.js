import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  preprocessSource,
  preprocessSources,
} from '../lib/ai/source-preprocessor.js';

describe('source-preprocessor', () => {
  it('collapses excessive blank lines', () => {
    const result = preprocessSource({
      label: 'test.js',
      content: 'a\n\n\n\n\nb\n\nc',
    });
    assert.ok(!result.cleaned.includes('\n\n\n'));
    assert.equal(result.cleaned, 'a\n\nb\n\nc');
  });

  it('extracts function declarations', () => {
    const result = preprocessSource({
      label: 'test.js',
      content: 'function hello() {}\nconst x = 1;\nfunction world() {}',
    });
    assert.ok(result.structure.length >= 2);
    assert.ok(result.structure[0].includes('function hello'));
    assert.ok(result.structure[1].includes('function world'));
  });

  it('extracts import statements', () => {
    const result = preprocessSource({
      label: 'test.js',
      content: "import React from 'react';\nconst x = 1;",
    });
    assert.equal(result.structure.length, 1);
    assert.ok(result.structure[0].includes('import'));
  });

  it('extracts class declarations', () => {
    const result = preprocessSource({
      label: 'test.js',
      content: 'class Foo extends Bar {\n  method() {}\n}',
    });
    assert.ok(result.structure.some((s) => s.includes('class Foo')));
  });

  it('extracts Python defs', () => {
    const result = preprocessSource({
      label: 'test.py',
      content: 'def hello():\n    pass\n\ndef world():\n    pass',
      language: 'python',
    });
    assert.ok(result.structure.some((s) => s.includes('def hello')));
    assert.ok(result.structure.some((s) => s.includes('def world')));
  });

  it('counts lines correctly', () => {
    const result = preprocessSource({
      label: 'test.js',
      content: 'a\nb\nc',
    });
    assert.equal(result.lineCount, 3);
  });

  it('handles empty code', () => {
    const result = preprocessSource({
      label: 'empty.js',
      content: '',
    });
    assert.equal(result.lineCount, 1); // empty string splits to ['']
    assert.equal(result.structure.length, 0);
  });

  it('preprocessSources handles multiple files', () => {
    const results = preprocessSources([
      { label: 'a.js', content: 'import React' },
      { label: 'b.js', content: 'function foo() {}' },
    ]);
    assert.equal(results.length, 2);
    assert.equal(results[0].original.label, 'a.js');
    assert.equal(results[1].original.label, 'b.js');
  });

  it('truncates long structural lines', () => {
    const longLine = 'export function '.repeat(20);
    const result = preprocessSource({
      label: 'test.js',
      content: longLine,
    });
    if (result.structure.length > 0) {
      assert.ok(result.structure[0].length <= 120);
    }
  });
});
