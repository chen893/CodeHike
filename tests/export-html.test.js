import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportTutorialAsHtml } from '../lib/services/export-html.js';

const sampleDraft = {
  meta: {
    title: 'HTML Tutorial',
    description: 'A test',
    lang: 'js',
    fileName: 'app.js',
  },
  intro: {
    paragraphs: ['Intro text'],
  },
  baseCode: 'const a = 1;',
  steps: [
    {
      id: 's1',
      title: 'Change a',
      paragraphs: ['We change a.'],
      patches: [{ find: 'const a = 1;', replace: 'const a = 2;' }],
    },
  ],
};

describe('export-html', () => {
  it('produces valid HTML document', () => {
    const html = exportTutorialAsHtml(sampleDraft);
    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<html'));
    assert.ok(html.includes('</html>'));
  });

  it('includes title in head and body', () => {
    const html = exportTutorialAsHtml(sampleDraft);
    assert.ok(html.includes('<title>HTML Tutorial</title>'));
    assert.ok(html.includes('<h1>HTML Tutorial</h1>'));
  });

  it('escapes HTML in content', () => {
    const draftWithHtml = {
      meta: { title: 'Test <script>', description: '' },
      intro: { paragraphs: ['<b>bold</b>'] },
      baseCode: 'x < y && z > w',
      steps: [],
    };
    const html = exportTutorialAsHtml(draftWithHtml);
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&lt;b&gt;'));
  });

  it('includes code in pre/code blocks', () => {
    const html = exportTutorialAsHtml(sampleDraft);
    assert.ok(html.includes('<pre><code'));
    assert.ok(html.includes('const a = 2;'));
  });

  it('includes VibeDocs attribution', () => {
    const html = exportTutorialAsHtml(sampleDraft);
    assert.ok(html.includes('VibeDocs'));
  });

  it('includes inline CSS styles', () => {
    const html = exportTutorialAsHtml(sampleDraft);
    assert.ok(html.includes('<style>'));
    assert.ok(html.includes('font-family'));
  });
});
