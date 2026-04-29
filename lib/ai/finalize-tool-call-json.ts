import { generateText, type ModelMessage } from 'ai'
import { parseJsonFromText } from './parse-json-text'
import { adaptPromptForModel } from './prompt-adapters'
import { getMaxOutputTokens } from './provider-registry'

interface FinalizeToolCallJsonOptions<T> {
  label: string
  schema: import('zod').ZodSchema<T>
  model: Parameters<typeof generateText>[0]['model']
  modelId?: string
  systemPrompt: string
  userPrompt: string
  initialText: string
  responseMessages?: ModelMessage[]
  logPrefix: string
}

const FINAL_JSON_PROMPT =
  '停止继续调用工具。基于你刚才已经读取到的代码和工具结果，直接输出最终 JSON 对象。不要解释，不要 markdown 代码块，不要 <think> 标签，不要额外前后文。'

export async function finalizeToolCallJson<T>({
  label,
  schema,
  model,
  modelId,
  systemPrompt,
  userPrompt,
  initialText,
  responseMessages = [],
  logPrefix,
}: FinalizeToolCallJsonOptions<T>): Promise<T> {
  try {
    return parseJsonFromText(initialText, schema, label)
  } catch (initialError) {
    console.warn(
      `[${logPrefix}] Initial ${label} parse failed, requesting a JSON-only final answer...`,
      initialError instanceof Error ? initialError.message : String(initialError),
    )

    const adaptedSystemPrompt = adaptPromptForModel(systemPrompt, modelId)
    const adaptedUserPrompt = adaptPromptForModel(userPrompt, modelId)
    const messages: ModelMessage[] = [
      { role: 'user', content: adaptedUserPrompt },
      ...responseMessages,
      ...(responseMessages.length === 0 && initialText
        ? [{ role: 'assistant', content: initialText } satisfies ModelMessage]
        : []),
      { role: 'user', content: FINAL_JSON_PROMPT },
    ]

    const followUp = await generateText({
      model,
      system: adaptedSystemPrompt,
      messages,
      maxOutputTokens: getMaxOutputTokens(modelId),
    })

    console.log(
      `[${logPrefix}] JSON finalization completed, response length:`,
      followUp.text?.length ?? 0,
    )

    return parseJsonFromText(
      followUp.text,
      schema,
      `${label}-finalize`,
    )
  }
}
