import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportTutorialAsMarkdown } from '../lib/services/export-markdown.js';

const sampleDraft = {
  meta: {
    title: 'Test Tutorial',
    description: 'A test tutorial',
    lang: 'javascript',
    fileName: 'index.js',
  },
  intro: {
    paragraphs: ['Welcome to the tutorial.'],
  },
  baseCode: 'const x = 1;\nconst y = 2;',
  steps: [
    {
      id: 'step-1',
      title: 'First Step',
      lead: 'Let us begin',
      paragraphs: ['We start with a variable.'],
      patches: [{ find: 'const x = 1;', replace: 'const x = 3;' }],
      teachingGoal: 'Understand variables',
    },
    {
      id: 'step-2',
      title: 'Second Step',
      paragraphs: ['Now we add more code.'],
      patches: [{ find: 'const y = 2;', replace: 'const y = 4;' }],
    },
  ],
};

describe('export-markdown', () => {
  it('includes title and description', () => {
    const md = exportTutorialAsMarkdown(sampleDraft);
    assert.ok(md.includes('# Test Tutorial'));
    assert.ok(md.includes('A test tutorial'));
  });

  it('includes intro paragraphs', () => {
    const md = exportTutorialAsMarkdown(sampleDraft);
    assert.ok(md.includes('Welcome to the tutorial.'));
  });

  it('includes step titles and paragraphs', () => {
    const md = exportTutorialAsMarkdown(sampleDraft);
    assert.ok(md.includes('First Step'));
    assert.ok(md.includes('We start with a variable.'));
    assert.ok(md.includes('Second Step'));
  });

  it('includes code blocks with language tag', () => {
    const md = exportTutorialAsMarkdown(sampleDraft);
    assert.ok(md.includes('```javascript'));
    assert.ok(md.includes('const x = 1;'));
  });

  it('applies patches and shows updated code', () => {
    const md = exportTutorialAsMarkdown(sampleDraft);
    // After step 1, x should be 3
    assert.ok(md.includes('const x = 3;'));
    // After step 2, y should be 4
    assert.ok(md.includes('const y = 4;'));
  });

  it('includes VibeDocs attribution', () => {
    const md = exportTutorialAsMarkdown(sampleDraft);
    assert.ok(md.includes('VibeDocs'));
  });

  it('handles draft with no patches', () => {
    const noPatchDraft = {
      meta: { title: 'Simple', description: '', lang: '' },
      intro: { paragraphs: [] },
      baseCode: 'hello',
      steps: [
        { id: 's1', title: 'Step', paragraphs: ['Text'] },
      ],
    };
    const md = exportTutorialAsMarkdown(noPatchDraft);
    assert.ok(md.includes('# Simple'));
    assert.ok(md.includes('Text'));
  });
});
