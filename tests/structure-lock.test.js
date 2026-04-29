import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStructureEditable,
  hasGeneratedPatches,
  STRUCTURE_LOCKED_MESSAGE,
} from '../lib/tutorial/structure-lock.ts';

test('hasGeneratedPatches returns false when tutorial draft is missing', () => {
  assert.equal(hasGeneratedPatches(null), false);
  assert.equal(hasGeneratedPatches(undefined), false);
});

test('hasGeneratedPatches ignores empty patch arrays', () => {
  assert.equal(
    hasGeneratedPatches({
      meta: { title: 't', description: 'd', fileName: 'app.ts', lang: 'ts' },
      intro: { paragraphs: [] },
      baseCode: 'const a = 1;',
      chapters: [{ id: 'c1', title: 'Chapter 1', order: 0 }],
      steps: [
        { id: 's1', chapterId: 'c1', title: 'Step 1', paragraphs: [], patches: [] },
        { id: 's2', chapterId: 'c1', title: 'Step 2', paragraphs: [] },
      ],
    }),
    false
  );
});

test('hasGeneratedPatches returns true when any step already has patches', () => {
  assert.equal(
    hasGeneratedPatches({
      meta: { title: 't', description: 'd', fileName: 'app.ts', lang: 'ts' },
      intro: { paragraphs: [] },
      baseCode: 'const a = 1;',
      chapters: [{ id: 'c1', title: 'Chapter 1', order: 0 }],
      steps: [
        {
          id: 's1',
          chapterId: 'c1',
          title: 'Step 1',
          paragraphs: [],
          patches: [{ find: '1', replace: '2' }],
        },
      ],
    }),
    true
  );
});

test('assertStructureEditable throws conflict once patches exist', () => {
  assert.throws(
    () =>
      assertStructureEditable({
        meta: { title: 't', description: 'd', fileName: 'app.ts', lang: 'ts' },
        intro: { paragraphs: [] },
        baseCode: 'const a = 1;',
        chapters: [{ id: 'c1', title: 'Chapter 1', order: 0 }],
        steps: [
          {
            id: 's1',
            chapterId: 'c1',
            title: 'Step 1',
            paragraphs: [],
            patches: [{ find: '1', replace: '2' }],
          },
        ],
      }),
    new RegExp(STRUCTURE_LOCKED_MESSAGE)
  );
});
