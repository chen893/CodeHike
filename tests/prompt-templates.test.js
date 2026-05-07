import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegenerateStepPrompt } from '../lib/ai/prompt-templates.ts';

const teachingBrief = {
  topic: 'Agent',
  audience_level: 'intermediate',
  core_question: 'How does the agent loop work?',
  output_language: 'zh-CN',
};

test('buildRegenerateStepPrompt includes exact current code before the target step', () => {
  const draft = {
    meta: { title: 'Agent tutorial' },
    baseCode: {
      'retry.ts': 'export function retry() {}\n',
      'agent/Agent.ts': 'class Agent {\n  private async summarizeMessagesIfNeeded(): Promise<void> {\n    if (this.skipNextTokenCheck) return;\n  }\n}\n',
    },
    steps: [
      {
        id: 'step-1',
        title: 'Intro',
        paragraphs: [],
        patches: [],
      },
      {
        id: 'step-2',
        title: 'Implement summary',
        paragraphs: [],
        patches: [
          {
            find: '  private async summarizeMessagesIfNeeded(): Promise<void> {\n    // TODO\n  }',
            replace: '  private async summarizeMessagesIfNeeded(): Promise<void> {\n    return;\n  }',
          },
        ],
      },
    ],
  };

  const { systemPrompt, userPrompt } = buildRegenerateStepPrompt(
    [],
    teachingBrief,
    draft,
    1,
    'step',
  );

  assert.match(systemPrompt, /patch\.file 必须是当前代码文件列表里的真实路径/);
  assert.match(userPrompt, /当前可用文件：retry\.ts, agent\/Agent\.ts/);
  assert.match(userPrompt, /if \(this\.skipNextTokenCheck\) return;/);
});
