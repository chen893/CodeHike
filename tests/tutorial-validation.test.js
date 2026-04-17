import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findFirstGeneratedFailureStep,
  validateTutorialDraft,
} from '../lib/utils/validation.ts';

const draftWithFailureStep = {
  meta: {
    title: 'Validation Test',
    description: 'desc',
    lang: 'ts',
    fileName: 'main.ts',
  },
  intro: {
    paragraphs: ['intro'],
  },
  chapters: [
    { id: 'ch-1', title: 'One', description: 'desc', order: 0 },
  ],
  baseCode: {
    'main.ts': 'export const x = 1;\n',
  },
  steps: [
    {
      id: 'step-1',
      chapterId: 'ch-1',
      title: 'Broken',
      paragraphs: ['⚠️ 此步骤自动生成失败，请手动编辑。错误：parse failed'],
    },
  ],
};

test('findFirstGeneratedFailureStep detects generated placeholder content', () => {
  const result = findFirstGeneratedFailureStep(draftWithFailureStep);
  assert.equal(result?.stepIndex, 0);
  assert.ok(result?.message.includes('自动生成失败'));
});

test('validateTutorialDraft rejects drafts with generated placeholder steps', async () => {
  const validation = await validateTutorialDraft(draftWithFailureStep);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors[0].includes('生成失败占位内容'));
});
