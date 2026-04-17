import { z } from 'zod'

export const modelConfigSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.string(),
  maxOutputTokens: z.number(),
})

export type ModelConfig = z.infer<typeof modelConfigSchema>

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'minimax/MiniMax-M2.7',
    label: 'MiniMax M2.7',
    provider: 'minimax',
    maxOutputTokens: 64000,
  },
  {
    id: 'deepseek/deepseek-chat',
    label: 'DeepSeek Chat',
    provider: 'deepseek',
    maxOutputTokens: 8192,
  },
  {
    id: 'deepseek/deepseek-reasoner',
    label: 'DeepSeek Reasoner',
    provider: 'deepseek',
    maxOutputTokens: 8192,
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    provider: 'openai',
    maxOutputTokens: 16384,
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'openai',
    maxOutputTokens: 16384,
  },
  {
    id: 'zhipu/glm-5.1',
    label: 'GLM-5.1',
    provider: 'zhipu',
    maxOutputTokens: 16384,
  },
]
