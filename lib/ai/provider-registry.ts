import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

interface ProviderConfig {
  name: string
  baseURL: string
  apiKeyEnvVar: string
  defaultModel: string
  maxOutputTokens: number
  supportsJsonResponse: boolean
}

// Provider configurations — keyed by provider name
const PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    name: 'deepseek',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    maxOutputTokens: 8192,
    supportsJsonResponse: true,
  },
  openai: {
    name: 'openai',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    maxOutputTokens: 16384,
    supportsJsonResponse: true,
  },
}

// Cache provider instances by name
const providerCache: Record<string, ReturnType<typeof createOpenAICompatible>> = {}

function getProvider(providerName: string) {
  if (!providerCache[providerName]) {
    const config = PROVIDERS[providerName]
    if (!config) {
      throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(', ')}`)
    }
    const apiKey = process.env[config.apiKeyEnvVar]
    if (!apiKey) {
      throw new Error(`Missing API key: ${config.apiKeyEnvVar}`)
    }
    providerCache[providerName] = createOpenAICompatible({
      name: config.name,
      baseURL: config.baseURL,
      apiKey,
    })
  }
  return providerCache[providerName]
}

/**
 * Parse a model ID in the format "provider/model" or just "model".
 * Returns the AI SDK model instance.
 */
export function createProvider(modelId?: string) {
  const id = modelId || process.env.DEFAULT_AI_MODEL || 'deepseek/deepseek-chat'

  let providerName: string
  let modelName: string

  if (id.includes('/')) {
    const [provider, ...rest] = id.split('/')
    providerName = provider
    modelName = rest.join('/')
  } else {
    // Default to deepseek if no provider prefix
    providerName = 'deepseek'
    modelName = id
  }

  return getProvider(providerName)(modelName)
}

/**
 * Get max output tokens for a given model ID.
 */
export function getMaxOutputTokens(modelId?: string): number {
  const id = modelId || process.env.DEFAULT_AI_MODEL || 'deepseek/deepseek-chat'
  const providerName = id.includes('/') ? id.split('/')[0] : 'deepseek'
  const config = PROVIDERS[providerName]
  return config?.maxOutputTokens ?? 8192
}

/**
 * Get all available provider names.
 */
export function getAvailableProviders(): string[] {
  return Object.keys(PROVIDERS)
}
