import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveChapterSections,
  deriveStepChapterMeta,
  normalizeChapterOrders,
  createDefaultChapter,
  ensureDraftChapters,
  validateChapterStructure,
} from '../lib/tutorial/chapters.ts';

// ── Test fixtures ──

function makeChapter(id, title, order, description) {
  const ch = { id, title, order };
  if (description !== undefined) ch.description = description;
  return ch;
}

function makeStep(id, chapterId, extra = {}) {
  return { id, chapterId, title: `Step ${id}`, paragraphs: [], ...extra };
}

// ── deriveChapterSections ──

test('deriveChapterSections: basic 2-chapter grouping', () => {
  const chapters = [
    makeChapter('ch1', 'Setup', 0),
    makeChapter('ch2', 'Core', 1),
  ];
  const steps = [
    makeStep('s1', 'ch1'),
    makeStep('s2', 'ch1'),
    makeStep('s3', 'ch2'),
    makeStep('s4', 'ch2'),
  ];

  const sections = deriveChapterSections(chapters, steps);

  assert.equal(sections.length, 2);
  assert.equal(sections[0].id, 'ch1');
  assert.equal(sections[0].startIndex, 0);
  assert.equal(sections[0].endIndex, 1);
  assert.deepEqual(sections[0].stepIds, ['s1', 's2']);
  assert.equal(sections[0].stepCount, 2);

  assert.equal(sections[1].id, 'ch2');
  assert.equal(sections[1].startIndex, 2);
  assert.equal(sections[1].endIndex, 3);
  assert.deepEqual(sections[1].stepIds, ['s3', 's4']);
  assert.equal(sections[1].stepCount, 2);
});

test('deriveChapterSections: single chapter', () => {
  const chapters = [makeChapter('ch1', 'All', 0)];
  const steps = [makeStep('s1', 'ch1'), makeStep('s2', 'ch1')];

  const sections = deriveChapterSections(chapters, steps);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].startIndex, 0);
  assert.equal(sections[0].endIndex, 1);
  assert.equal(sections[0].stepCount, 2);
});

test('deriveChapterSections: empty chapter (no steps assigned)', () => {
  const chapters = [
    makeChapter('ch1', 'Used', 0),
    makeChapter('ch2', 'Empty', 1),
  ];
  const steps = [makeStep('s1', 'ch1')];

  const sections = deriveChapterSections(chapters, steps);

  assert.equal(sections.length, 2);
  assert.equal(sections[0].stepCount, 1);
  assert.equal(sections[1].stepCount, 0);
  assert.equal(sections[1].startIndex, -1);
  assert.equal(sections[1].endIndex, -1);
});

test('deriveChapterSections: respects order sorting', () => {
  const chapters = [
    makeChapter('ch2', 'Second', 1),
    makeChapter('ch1', 'First', 0),
  ];
  const steps = [makeStep('s1', 'ch1'), makeStep('s2', 'ch2')];

  const sections = deriveChapterSections(chapters, steps);

  assert.equal(sections[0].id, 'ch1');
  assert.equal(sections[0].order, 0);
  assert.equal(sections[1].id, 'ch2');
  assert.equal(sections[1].order, 1);
});

// ── deriveStepChapterMeta ──

test('deriveStepChapterMeta: correct metadata per step', () => {
  const chapters = [
    makeChapter('ch1', 'Setup', 0, 'Getting started'),
    makeChapter('ch2', 'Core', 1),
  ];
  const steps = [
    makeStep('s1', 'ch1'),
    makeStep('s2', 'ch1'),
    makeStep('s3', 'ch2'),
  ];

  const meta = deriveStepChapterMeta(chapters, steps);

  assert.equal(Object.keys(meta).length, 3);

  assert.equal(meta['s1'].chapterId, 'ch1');
  assert.equal(meta['s1'].chapterTitle, 'Setup');
  assert.equal(meta['s1'].chapterDescription, 'Getting started');
  assert.equal(meta['s1'].chapterIndex, 0);
  assert.equal(meta['s1'].totalChapters, 2);
  assert.equal(meta['s1'].stepIndexInChapter, 0);
  assert.equal(meta['s1'].totalStepsInChapter, 2);

  assert.equal(meta['s2'].stepIndexInChapter, 1);
  assert.equal(meta['s2'].totalStepsInChapter, 2);

  assert.equal(meta['s3'].chapterId, 'ch2');
  assert.equal(meta['s3'].chapterIndex, 1);
  assert.equal(meta['s3'].stepIndexInChapter, 0);
  assert.equal(meta['s3'].totalStepsInChapter, 1);
});

// ── normalizeChapterOrders ──

test('normalizeChapterOrders: reorders to 0,1,2', () => {
  const chapters = [
    makeChapter('c', 'C', 5),
    makeChapter('a', 'A', 1),
    makeChapter('b', 'B', 3),
  ];

  const result = normalizeChapterOrders(chapters);

  assert.equal(result[0].id, 'a');
  assert.equal(result[0].order, 0);
  assert.equal(result[1].id, 'b');
  assert.equal(result[1].order, 1);
  assert.equal(result[2].id, 'c');
  assert.equal(result[2].order, 2);
});

test('normalizeChapterOrders: already normalized stays the same', () => {
  const chapters = [
    makeChapter('ch1', 'First', 0),
    makeChapter('ch2', 'Second', 1),
  ];

  const result = normalizeChapterOrders(chapters);

  assert.equal(result[0].order, 0);
  assert.equal(result[1].order, 1);
});

// ── createDefaultChapter ──

test('createDefaultChapter: creates chapter with order 0', () => {
  const ch = createDefaultChapter();
  assert.equal(ch.id, 'default');
  assert.equal(ch.title, 'Chapter 1');
  assert.equal(ch.order, 0);
});

test('createDefaultChapter: uses custom id and title', () => {
  const ch = createDefaultChapter('intro', 'Introduction');
  assert.equal(ch.id, 'intro');
  assert.equal(ch.title, 'Introduction');
  assert.equal(ch.order, 0);
});

// ── ensureDraftChapters ──

test('ensureDraftChapters: wraps old data without chapters', () => {
  const legacyDraft = {
    meta: { title: 'Test', description: 'A test' },
    intro: { paragraphs: ['Hello'] },
    baseCode: 'const x = 1;',
    steps: [
      { id: 's1', title: 'Step 1', paragraphs: [] },
      { id: 's2', title: 'Step 2', paragraphs: [] },
    ],
  };

  const result = ensureDraftChapters(legacyDraft);

  assert.ok(result.chapters);
  assert.equal(result.chapters.length, 1);
  assert.equal(result.chapters[0].id, 'default');
  assert.equal(result.steps[0].chapterId, 'default');
  assert.equal(result.steps[1].chapterId, 'default');
});

test('ensureDraftChapters: assigns chapterId to steps missing it', () => {
  const draft = {
    meta: { title: 'Test', description: 'A test' },
    intro: { paragraphs: [] },
    baseCode: 'code',
    chapters: [{ id: 'ch1', title: 'One', order: 0 }],
    steps: [
      { id: 's1', title: 'Step 1', paragraphs: [] },
      { id: 's2', chapterId: 'ch1', title: 'Step 2', paragraphs: [] },
    ],
  };

  const result = ensureDraftChapters(draft);

  assert.equal(result.steps[0].chapterId, 'ch1');
  assert.equal(result.steps[1].chapterId, 'ch1');
});

test('ensureDraftChapters: preserves existing chapters and chapterIds', () => {
  const draft = {
    meta: { title: 'Test', description: 'A test' },
    intro: { paragraphs: [] },
    baseCode: 'code',
    chapters: [
      { id: 'ch1', title: 'One', order: 0 },
      { id: 'ch2', title: 'Two', order: 1 },
    ],
    steps: [
      { id: 's1', chapterId: 'ch1', title: 'S1', paragraphs: [] },
      { id: 's2', chapterId: 'ch2', title: 'S2', paragraphs: [] },
    ],
  };

  const result = ensureDraftChapters(draft);

  assert.equal(result.chapters.length, 2);
  assert.equal(result.steps[0].chapterId, 'ch1');
  assert.equal(result.steps[1].chapterId, 'ch2');
});

// ── validateChapterStructure ──

test('validateChapterStructure: valid structure passes', () => {
  const chapters = [
    makeChapter('ch1', 'Setup', 0),
    makeChapter('ch2', 'Core', 1),
  ];
  const steps = [
    makeStep('s1', 'ch1'),
    makeStep('s2', 'ch2'),
  ];

  const result = validateChapterStructure(chapters, steps);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateChapterStructure: catches invalid chapterId', () => {
  const chapters = [makeChapter('ch1', 'Only', 0)];
  const steps = [makeStep('s1', 'ch1'), makeStep('s2', 'nonexistent')];

  const result = validateChapterStructure(chapters, steps);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('unknown chapterId') && e.includes('nonexistent')));
});

test('validateChapterStructure: catches non-contiguous steps', () => {
  const chapters = [
    makeChapter('ch1', 'A', 0),
    makeChapter('ch2', 'B', 1),
  ];
  const steps = [
    makeStep('s1', 'ch1'),
    makeStep('s2', 'ch2'),
    makeStep('s3', 'ch1'),  // ch1 is non-contiguous
  ];

  const result = validateChapterStructure(chapters, steps);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('non-contiguous')));
});

test('validateChapterStructure: catches duplicate chapter ids', () => {
  const chapters = [
    makeChapter('dup', 'A', 0),
    makeChapter('dup', 'B', 1),
  ];
  const steps = [makeStep('s1', 'dup')];

  const result = validateChapterStructure(chapters, steps);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Duplicate chapter id')));
});

test('validateChapterStructure: catches duplicate chapter orders', () => {
  const chapters = [
    makeChapter('ch1', 'A', 0),
    makeChapter('ch2', 'B', 0),
  ];
  const steps = [makeStep('s1', 'ch1'), makeStep('s2', 'ch2')];

  const result = validateChapterStructure(chapters, steps);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Duplicate chapter order')));
});

// ── Edge cases ──

test('validateChapterStructure: no steps is valid (empty editing state)', () => {
  const chapters = [makeChapter('ch1', 'Only', 0)];
  const steps = [];

  const result = validateChapterStructure(chapters, steps);
  assert.equal(result.valid, true);
});

test('validateChapterStructure: single step in single chapter', () => {
  const chapters = [makeChapter('ch1', 'Only', 0)];
  const steps = [makeStep('s1', 'ch1')];

  const result = validateChapterStructure(chapters, steps);
  assert.equal(result.valid, true);
});

test('deriveChapterSections: all steps in one chapter', () => {
  const chapters = [makeChapter('ch1', 'Everything', 0)];
  const steps = [makeStep('s1', 'ch1'), makeStep('s2', 'ch1'), makeStep('s3', 'ch1')];

  const sections = deriveChapterSections(chapters, steps);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].stepCount, 3);
  assert.equal(sections[0].startIndex, 0);
  assert.equal(sections[0].endIndex, 2);
});

test('deriveChapterSections: no steps at all', () => {
  const chapters = [makeChapter('ch1', 'Empty', 0)];
  const steps = [];

  const sections = deriveChapterSections(chapters, steps);

  assert.equal(sections.length, 1);
  assert.equal(sections[0].stepCount, 0);
  assert.equal(sections[0].startIndex, -1);
});

test('deriveStepChapterMeta: no steps returns empty record', () => {
  const chapters = [makeChapter('ch1', 'Only', 0)];
  const meta = deriveStepChapterMeta(chapters, []);
  assert.deepEqual(meta, {});
});
