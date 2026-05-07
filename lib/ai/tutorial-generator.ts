import { legacyTutorialStepSchema } from '../schemas/tutorial-draft';
import { buildRegenerateStepPrompt } from './prompt-templates';
import { createProvider, getMaxOutputTokens } from './provider-registry';
import { generateStructuredObject } from './structured-output-adapter';
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

  const result = await generateStructuredObject({
    label: `regenerate-step-${stepIndex}`,
    schemaName: 'tutorial_step',
    schema: legacyTutorialStepSchema,
    model: createProvider(modelId),
    modelId,
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: getMaxOutputTokens(modelId),
  });

  return result.output;
}
