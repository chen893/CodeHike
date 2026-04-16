/**
 * Token estimation and budget management for the AI generation pipeline.
 *
 * Used by source tools (Phase 2.2) and the generator (Phase 2.5) to prevent
 * prompt overflow when working with large repos.
 *
 * Server-side only — no 'use client'.
 */

// ---------------------------------------------------------------------------
// Provider token limits
// ---------------------------------------------------------------------------

interface ProviderTokenLimits {
  /** Total context window size (input + output). */
  contextWindow: number;
  /** Maximum tokens the model can produce in a single response. */
  maxOutputTokens: number;
  /** Extra safety margin subtracted from the usable input budget. */
  inputSafetyMargin: number;
}

/**
 * Per-model token limits.  Keys are the *model name* without provider prefix
 * (e.g. "deepseek-chat", not "deepseek/deepseek-chat").
 */
const PROVIDER_LIMITS: Record<string, ProviderTokenLimits> = {
  'deepseek-chat': {
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputSafetyMargin: 12_000,
  },
  'deepseek-reasoner': {
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputSafetyMargin: 12_000,
  },
  'gpt-4o': {
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputSafetyMargin: 20_000,
  },
  'gpt-4o-mini': {
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputSafetyMargin: 20_000,
  },
  'glm-5.1': {
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputSafetyMargin: 20_000,
  },
};

/** Default fallback when a model is not found in the limits table. */
const DEFAULT_LIMITS = PROVIDER_LIMITS['deepseek-chat'];

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Rough token-count approximation.
 *
 * Heuristic:
 *   - Code lines   ~3 tokens / line  (comments & short lines lower the average)
 *   - CJK chars    ~1.5 tokens / char
 *   - Other chars  ~0.25 tokens / char
 *
 * This is *intentionally* conservative — it will over-estimate slightly to
 * keep a safety buffer against the real tokenizer.
 */
export function estimateTokens(text: string): number {
  const codeLines = text.split('\n').length;
  const cjkChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - cjkChars;
  return Math.ceil(codeLines * 3 + cjkChars * 1.5 + otherChars * 0.25);
}

// ---------------------------------------------------------------------------
// Max input tokens helper
// ---------------------------------------------------------------------------

/**
 * Return the maximum number of input tokens available for a given model.
 *
 * Calculation:  contextWindow − maxOutputTokens − inputSafetyMargin
 *
 * Model IDs may arrive with a provider prefix (e.g. "deepseek/deepseek-chat")
 * which is stripped automatically.
 */
export function getMaxInputTokens(modelId: string): number {
  // Strip provider prefix if present ("deepseek/deepseek-chat" → "deepseek-chat")
  const modelName = modelId.includes('/')
    ? modelId.split('/').slice(1).join('/')
    : modelId;

  const config = PROVIDER_LIMITS[modelName] ?? DEFAULT_LIMITS;
  return config.contextWindow - config.maxOutputTokens - config.inputSafetyMargin;
}

// ---------------------------------------------------------------------------
// TokenBudgetSession
// ---------------------------------------------------------------------------

export interface TokenBudgetSession {
  /** Hard cap on input tokens for this session. */
  readonly maxInputTokens: number;
  /** Tokens consumed so far. */
  readonly usedInputTokens: number;
  /** Tokens still available. */
  readonly remainingInputTokens: number;

  /**
   * Consume tokens for a labeled purpose.
   * **Throws** if the text would push the session over budget.
   */
  consume(text: string, label: string): void;

  /**
   * Non-throwing check — returns `true` if the text fits in the remaining budget.
   */
  canAfford(text: string): boolean;

  /**
   * Remaining budget after hypothetically consuming the given text.
   */
  remainingAfter(text: string): number;
}

/**
 * Internal factory that creates a mutable budget session.
 */
function createMutableBudgetSession(maxInputTokens: number): TokenBudgetSession {
  let used = 0;

  return {
    get maxInputTokens() {
      return maxInputTokens;
    },
    get usedInputTokens() {
      return used;
    },
    get remainingInputTokens() {
      return Math.max(0, maxInputTokens - used);
    },

    consume(text: string, label: string) {
      const tokens = estimateTokens(text);
      if (used + tokens > maxInputTokens) {
        throw new Error(
          `Token budget exceeded for "${label}": needs ${tokens}, remaining ${maxInputTokens - used}`,
        );
      }
      used += tokens;
    },

    canAfford(text: string): boolean {
      return estimateTokens(text) <= maxInputTokens - used;
    },

    remainingAfter(text: string): number {
      return Math.max(0, maxInputTokens - used - estimateTokens(text));
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create a budget session for a generation request.
 *
 * Automatically consumes tokens for the base prompt so that the returned
 * session's `remainingInputTokens` reflects what is left for source code.
 *
 * @param modelId        Model identifier (with or without provider prefix).
 * @param basePrompt     The system / instruction prompt text.
 * @param outputReserve  Extra tokens to reserve for output (subtracted from
 *                       the input budget). Defaults to 0.
 */
export function createTokenBudgetSession(input: {
  modelId: string;
  basePrompt: string;
  outputReserve?: number;
}): TokenBudgetSession {
  const maxInputTokens =
    getMaxInputTokens(input.modelId) - (input.outputReserve ?? 0);

  const session = createMutableBudgetSession(maxInputTokens);
  session.consume(input.basePrompt, 'base-prompt');
  return session;
}
