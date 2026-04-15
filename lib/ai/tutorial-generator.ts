import { streamText, generateText, Output } from 'ai';
import { tutorialDraftSchema, legacyTutorialDraftSchema, tutorialStepSchema, legacyTutorialStepSchema } from '../schemas/tutorial-draft';
import { buildGeneratePrompt, buildRegenerateStepPrompt } from './prompt-templates';
import { adaptPromptForModel } from './prompt-adapters';
import { createProvider, getMaxOutputTokens } from './provider-registry';
import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';

export function createTutorialGenerationStream(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  modelId?: string
) {
  const { systemPrompt, userPrompt } = buildGeneratePrompt(
    sourceItems,
    teachingBrief
  );

  const result = streamText({
    model: createProvider(modelId),
    system: adaptPromptForModel(systemPrompt, modelId),
    prompt: adaptPromptForModel(userPrompt, modelId),
    output: Output.object({
      // Use legacy schema for AI output (no chapters/chapterId required),
      // then migrate via ensureDraftChapters in persistV1Content
      schema: legacyTutorialDraftSchema,
    }),
    maxOutputTokens: getMaxOutputTokens(modelId),
  });

  return result;
}

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
    output: Output.object({
      schema: legacyTutorialStepSchema,
    }),
    maxOutputTokens: getMaxOutputTokens(modelId),
  });

  return result.output;
}
