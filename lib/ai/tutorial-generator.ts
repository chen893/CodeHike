import { streamText, generateText, Output } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { tutorialDraftSchema, tutorialStepSchema } from '../schemas/tutorial-draft';
import { buildGeneratePrompt, buildRegenerateStepPrompt } from './prompt-templates';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';

const deepseek = createOpenAICompatible({
  name: 'deepseek',
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

export function createTutorialGenerationStream(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  modelId: string = DEFAULT_MODEL
) {
  const { systemPrompt, userPrompt } = buildGeneratePrompt(
    sourceItems,
    teachingBrief
  );

  const result = streamText({
    model: deepseek(modelId),
    system: systemPrompt,
    prompt: userPrompt,
    output: Output.object({
      schema: tutorialDraftSchema,
    }),
    maxOutputTokens: 8192,
  });

  return result;
}

export async function regenerateStep(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  currentDraft: {
    meta: { title: string };
    baseCode: string;
    steps: any[];
  },
  stepIndex: number,
  mode: 'prose' | 'step',
  modelId: string = DEFAULT_MODEL,
  instruction?: string
) {
  const { systemPrompt, userPrompt } = buildRegenerateStepPrompt(
    sourceItems,
    teachingBrief,
    currentDraft,
    stepIndex,
    mode,
    instruction
  );

  const result = await generateText({
    model: deepseek(modelId),
    system: systemPrompt,
    prompt: userPrompt,
    output: Output.object({
      schema: tutorialStepSchema,
    }),
    maxOutputTokens: 8192,
  });

  return result.output;
}
