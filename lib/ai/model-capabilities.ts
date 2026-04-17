/**
 * Model capability detection for retrieval-based generation.
 *
 * Determines whether a model supports the retrieval pipeline and
 * which structured output strategy to use.
 *
 * Structured output strategies:
 *   - native_json_schema: provider supports json_schema response_format
 *                         (OpenAI gpt-4o etc.) → use Output.object()
 *   - json_object:        provider supports json_object mode only
 *                         (DeepSeek deepseek-chat) → use Output.object()
 *                         with prompt containing "json"
 *   - manual:             no structured output support → parse text manually
 *
 * Static configs cover known models; unknown models fall back to a runtime
 * smoke probe (cached in-memory per session).
 */

import { generateText, tool } from 'ai';
import { z } from 'zod';
import { createProvider } from './provider-registry';

// ─── Types ──────────────────────────────────────────────────────────

export type StructuredOutputStrategy = 'native_json_schema' | 'json_object' | 'manual';

export interface ModelCapabilities {
  /** Whether the model supports tool calling. */
  supportsTools: boolean;
  /** Whether the model supports structured output (Output.object). */
  supportsStructuredOutput: boolean;
  /** Whether the model supports tools + structured output in the same call. */
  supportsToolStructuredOutput: boolean | 'probe';
  /** Structured output strategy for the generation pipeline. */
  structuredOutputStrategy: StructuredOutputStrategy;
}

// ─── Static capabilities ────────────────────────────────────────────

const STATIC_CAPABILITIES: Record<string, ModelCapabilities> = {
  'deepseek-chat': {
    supportsTools: true,
    supportsStructuredOutput: false,
    supportsToolStructuredOutput: false,
    structuredOutputStrategy: 'manual',
  },
  'deepseek-reasoner': {
    supportsTools: false,
    supportsStructuredOutput: true,
    supportsToolStructuredOutput: false,
    structuredOutputStrategy: 'manual',
  },
  'gpt-4o': {
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsToolStructuredOutput: true,
    structuredOutputStrategy: 'native_json_schema',
  },
  'gpt-4o-mini': {
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsToolStructuredOutput: true,
    structuredOutputStrategy: 'native_json_schema',
  },
  'glm-5.1': {
    supportsTools: true,
    supportsStructuredOutput: true,
    supportsToolStructuredOutput: 'probe',
    structuredOutputStrategy: 'manual',
  },
  'MiniMax-M2.7': {
    supportsTools: true,
    supportsStructuredOutput: false,
    supportsToolStructuredOutput: false,
    structuredOutputStrategy: 'manual',
  },
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsTools: false,
  supportsStructuredOutput: true,
  supportsToolStructuredOutput: false,
  structuredOutputStrategy: 'manual',
};

// ─── Capability lookup ──────────────────────────────────────────────

/**
 * Get static capabilities for a model. Strips provider prefix if present
 * (e.g. "deepseek/deepseek-chat" -> "deepseek-chat").
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  const modelName = modelId.includes('/')
    ? modelId.split('/').slice(1).join('/')
    : modelId;
  return STATIC_CAPABILITIES[modelName] ?? DEFAULT_CAPABILITIES;
}

/**
 * Check whether a model supports native structured output (Output.object
 * with json_schema). Returns true only for native_json_schema strategy.
 */
export function supportsNativeStructuredOutput(modelId?: string): boolean {
  const caps = getModelCapabilities(modelId ?? '');
  return caps.structuredOutputStrategy === 'native_json_schema';
}

// ─── Smoke probe ────────────────────────────────────────────────────

// Cache probe results to avoid repeated API calls within a session
const probeCache = new Map<string, boolean>();

/**
 * Probe whether a model supports tool calling by sending
 * a minimal generateText call with a trivial tool.
 *
 * The probe uses a tiny prompt and schema to minimize cost and latency.
 * Results are cached in-memory for the lifetime of the process.
 */
async function probeToolCalling(modelId: string): Promise<boolean> {
  if (probeCache.has(modelId)) return probeCache.get(modelId)!;

  try {
    const model = createProvider(modelId);
    await generateText({
      model,
      prompt: 'Pick one: a or b.',
      tools: {
        pick: tool({
          description: 'Pick an option',
          inputSchema: z.object({ choice: z.string() }),
          execute: async ({ choice }: { choice: string }) => ({ choice }),
        }),
      },
      maxRetries: 0,
    });

    probeCache.set(modelId, true);
    return true;
  } catch {
    probeCache.set(modelId, false);
    return false;
  }
}

// ─── Retrieval generation check ─────────────────────────────────────

/**
 * Check whether a model supports retrieval-based generation
 * (tool calling for source exploration).
 *
 * For models with definitive static capabilities, returns immediately.
 * For 'probe' models, runs a one-time smoke probe and caches the result.
 */
export async function supportsRetrievalGeneration(
  modelId: string,
): Promise<boolean> {
  const caps = getModelCapabilities(modelId);

  if (caps.supportsTools) return true;
  if (caps.supportsToolStructuredOutput === false) return false;

  return probeToolCalling(modelId);
}

// ─── Error type ─────────────────────────────────────────────────────

/**
 * Thrown when a retrieval-based generation is attempted with a model
 * that does not support retrieval-time tool calling.
 */
export class RetrievalModelRequiredError extends Error {
  readonly code = 'RETRIEVAL_MODEL_REQUIRED' as const;
  readonly modelId: string;
  readonly fileCount: number;
  readonly estimatedTokens: number;

  constructor(opts: {
    modelId: string;
    fileCount: number;
    estimatedTokens: number;
    message?: string;
  }) {
    super(
      opts.message ??
        `当前模型不支持大仓库检索式生成，请切换模型或减少源码范围。`,
    );
    this.name = 'RetrievalModelRequiredError';
    this.modelId = opts.modelId;
    this.fileCount = opts.fileCount;
    this.estimatedTokens = opts.estimatedTokens;
  }
}
