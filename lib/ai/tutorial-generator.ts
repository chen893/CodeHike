import { generateText } from 'ai';
import { legacyTutorialStepSchema } from '../schemas/tutorial-draft';
import { buildRegenerateStepPrompt } from './prompt-templates';
import { adaptPromptForModel } from './prompt-adapters';
import { createProvider, getMaxOutputTokens } from './provider-registry';
import { parseJsonFromText } from './parse-json-text';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';

export async function regenerateStep(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  currentDraft: {
    meta: { title: string };
    baseCode: string | Record<string, string>;
    steps: any[];
  },
  stepIndex: number,
  mode: 'prose' | 'step',
  modelId?: string,
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
    model: createProvider(modelId),
    system: adaptPromptForModel(systemPrompt, modelId),
    prompt: adaptPromptForModel(userPrompt, modelId),
    maxOutputTokens: getMaxOutputTokens(modelId),
  });

  return parseJsonFromText(result.text, legacyTutorialStepSchema, `regenerate-step-${stepIndex}`);
}
