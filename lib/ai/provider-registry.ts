import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenAI } from '@ai-sdk/openai'
import { createDeepSeek } from '@ai-sdk/deepseek'

// ---------------------------------------------------------------------------
// Provider configs — keyed by provider name
// ---------------------------------------------------------------------------

interface ProviderConfig {
  name: string
  baseURL: string
  apiKeyEnvVar: string
  defaultModel: string
  maxOutputTokens: number
}

const PROVIDERS: Record<string, ProviderConfig> = {
  deepseek: {
    name: 'deepseek',
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    maxOutputTokens: 8192,
  },
  openai: {
    name: 'openai',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    maxOutputTokens: 16384,
  },
  zhipu: {
    name: 'zhipu',
    baseURL: process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyEnvVar: 'ZHIPU_API_KEY',
    defaultModel: 'glm-5.1',
    maxOutputTokens: 16384,
  },
  minimax: {
    name: 'minimax',
    baseURL: process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1',
    apiKeyEnvVar: 'MINIMAX_API_KEY',
    defaultModel: 'MiniMax-M2.7',
    maxOutputTokens: 64000,
  },
}

// ---------------------------------------------------------------------------
// Provider instances — cached per provider name
// ---------------------------------------------------------------------------

type LanguageModel = ReturnType<ReturnType<typeof createDeepSeek>>

const providerCache: Record<string, (model: string) => LanguageModel> = {}

function getProviderFactory(providerName: string): (model: string) => LanguageModel {
  if (providerCache[providerName]) return providerCache[providerName]

  const config = PROVIDERS[providerName]
  if (!config) {
    throw new Error(
      `Unknown provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(', ')}`,
    )
  }

  const apiKey = process.env[config.apiKeyEnvVar]
  if (!apiKey) {
    throw new Error(`Missing API key: ${config.apiKeyEnvVar}`)
  }

  switch (providerName) {
    case 'deepseek': {
      const provider = createDeepSeek({
        apiKey,
        baseURL: config.baseURL,
        // DeepSeek retrieval calls (tools + large prompts) can take 2-3 minutes.
        // Default Node.js fetch has no timeout, but some environments (e.g.
        // Vercel serverless) impose a 60s limit. Custom fetch with an explicit
        // 5-minute timeout ensures the connection stays alive.
        fetch: (url, init) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 300_000) // 5 min
          return globalThis.fetch(url, { ...init, signal: controller.signal })
            .finally(() => clearTimeout(timeout))
        },
      })
      providerCache[providerName] = (model: string) => provider(model)
      break
    }
    case 'openai': {
      const provider = createOpenAI({
        apiKey,
        baseURL: config.baseURL,
      })
      providerCache[providerName] = (model: string) => provider(model)
      break
    }
    default: {
      // zhipu, minimax, and other configured providers: openai-compatible fallback
      const provider = createOpenAICompatible({
        name: config.name,
        baseURL: config.baseURL,
        apiKey,
        fetch: (url, init) => {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 300_000)
          return globalThis.fetch(url, { ...init, signal: controller.signal })
            .finally(() => clearTimeout(timeout))
        },
      })
      providerCache[providerName] = (model: string) => provider(model)
      break
    }
  }

  return providerCache[providerName]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a model ID in the format "provider/model" or just "model".
 * Returns the AI SDK model instance.
 *
 * Uses provider-specific packages when available:
 *   deepseek  → @ai-sdk/deepseek
 *   openai    → @ai-sdk/openai
 *   minimax   → @ai-sdk/openai-compatible
 *   others    → @ai-sdk/openai-compatible (fallback)
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

  return getProviderFactory(providerName)(modelName)
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
