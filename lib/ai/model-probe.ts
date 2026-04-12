import { generateText } from 'ai'
import { createProvider, getMaxOutputTokens } from './provider-registry'

export interface ProbeResult {
  reachable: boolean
  latencyMs: number
  supportsJsonResponse: boolean
  error?: string
}

/**
 * Probe a model's capabilities by sending a minimal generateText call.
 * Tests reachability, measures latency, and checks json response support.
 */
export async function probeModelCapabilities(modelId: string): Promise<ProbeResult> {
  const start = Date.now()

  try {
    const model = createProvider(modelId)

    // Minimal test: just ask the model to respond with a simple JSON
    const result = await generateText({
      model,
      prompt: 'Respond with exactly: {"ok":true}',
      maxOutputTokens: 50,
    })

    const latencyMs = Date.now() - start
    const responseText = result.text || ''

    // Check if response looks like valid JSON
    const supportsJsonResponse = responseText.trim().startsWith('{')

    return {
      reachable: true,
      latencyMs,
      supportsJsonResponse,
    }
  } catch (error) {
    return {
      reachable: false,
      latencyMs: Date.now() - start,
      supportsJsonResponse: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
