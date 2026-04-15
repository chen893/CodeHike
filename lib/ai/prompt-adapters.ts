/**
 * Adapt prompt parameters for different models.
 * Different models have different token limits and capabilities,
 * so we adjust LOC budgets and prompt instructions accordingly.
 */

export interface PromptAdaptation {
  locBudget: number          // Max lines of change per step
  outlineLocBudget: number   // Max lines of change for outline estimation
  stepLocMin: number         // Min lines per step
  stepLocMax: number         // Max lines per step
  extraInstructions?: string // Model-specific prompt additions
}

const ADAPTATIONS: Record<string, PromptAdaptation> = {
  default: {
    locBudget: 15,
    outlineLocBudget: 8,
    stepLocMin: 3,
    stepLocMax: 8,
  },
  'deepseek-chat': {
    locBudget: 15,
    outlineLocBudget: 8,
    stepLocMin: 3,
    stepLocMax: 8,
  },
  'deepseek-reasoner': {
    locBudget: 20,
    outlineLocBudget: 10,
    stepLocMin: 5,
    stepLocMax: 12,
    extraInstructions: 'Take time to reason through the code changes carefully.',
  },
  'gpt-4o': {
    locBudget: 20,
    outlineLocBudget: 10,
    stepLocMin: 3,
    stepLocMax: 10,
  },
  'gpt-4o-mini': {
    locBudget: 12,
    outlineLocBudget: 6,
    stepLocMin: 3,
    stepLocMax: 8,
    extraInstructions: 'Keep changes small and precise.',
  },
  'glm-5.1': {
    locBudget: 20,
    outlineLocBudget: 10,
    stepLocMin: 3,
    stepLocMax: 10,
  },
}

/**
 * Get the LOC budget for a given model.
 */
export function getLocBudget(modelId?: string): number {
  const modelName = extractModelName(modelId)
  return ADAPTATIONS[modelName]?.locBudget ?? ADAPTATIONS.default.locBudget
}

/**
 * Get full prompt adaptation for a given model.
 */
export function getPromptAdaptation(modelId?: string): PromptAdaptation {
  const modelName = extractModelName(modelId)
  return ADAPTATIONS[modelName] ?? ADAPTATIONS.default
}

/**
 * Adapt a base prompt for a specific model.
 * Injects model-specific instructions if needed.
 */
export function adaptPromptForModel(basePrompt: string, modelId?: string): string {
  const adaptation = getPromptAdaptation(modelId)
  let prompt = basePrompt
    .replace(/\{LOC_BUDGET\}/g, String(adaptation.locBudget))
    .replace(/\{OUTLINE_LOC_BUDGET\}/g, String(adaptation.outlineLocBudget))
    .replace(/\{STEP_LOC_MIN\}/g, String(adaptation.stepLocMin))
    .replace(/\{STEP_LOC_MAX\}/g, String(adaptation.stepLocMax))

  if (adaptation.extraInstructions) {
    prompt += `\n\nAdditional instructions: ${adaptation.extraInstructions}`
  }

  return prompt
}

function extractModelName(modelId?: string): string {
  if (!modelId) return 'default'
  // Handle "provider/model" format
  if (modelId.includes('/')) {
    return modelId.split('/').slice(1).join('/')
  }
  return modelId
}
