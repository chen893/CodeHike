import {
  generateText as defaultGenerateText,
  NoObjectGeneratedError,
  Output,
  tool,
  type ModelMessage,
} from 'ai';
import type { z } from 'zod';
import { getModelCapabilities, supportsNativeStructuredOutput } from './model-capabilities';
import { adaptPromptForModel } from './prompt-adapters';
import { getMaxOutputTokens } from './provider-registry';
import { parseJsonFromText } from './parse-json-text';

export type StructuredOutputMode =
  | 'native_object'
  | 'forced_output_tool'
  | 'json_object'
  | 'prompted_json';

export type StructuredOutputErrorCode =
  | 'NO_SUPPORTED_MODE'
  | 'NATIVE_OBJECT_FAILED'
  | 'OUTPUT_TOOL_NOT_CALLED'
  | 'OUTPUT_TOOL_VALIDATION_FAILED'
  | 'JSON_PARSE_FAILED'
  | 'SCHEMA_VALIDATION_FAILED';

type GenerateTextOptions = Parameters<typeof defaultGenerateText>[0];
type GenerateTextLike = (options: GenerateTextOptions) => Promise<any>;

export interface StructuredOutputTelemetry {
  label: string;
  schemaName: string;
  modelId?: string;
  mode: StructuredOutputMode;
  attempts: number;
  success: boolean;
  fallbackFrom?: StructuredOutputMode | null;
  rawTextLength?: number;
  errorCode?: StructuredOutputErrorCode;
  finishReason?: string;
  usage?: unknown;
}

export interface GenerateStructuredObjectOptions<T> {
  label: string;
  schemaName: string;
  schema: z.ZodSchema<T>;
  model: GenerateTextOptions['model'];
  modelId?: string;
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  responseMessages?: ModelMessage[];
  finalInstruction?: string;
  maxOutputTokens?: number;
  stopWhen?: GenerateTextOptions['stopWhen'];
  tools?: GenerateTextOptions['tools'];
  providerOptions?: GenerateTextOptions['providerOptions'];
  useNativeStructuredOutput?: boolean;
  allowOutputTool?: boolean;
  preferredModes?: StructuredOutputMode[];
  onTelemetry?: (event: StructuredOutputTelemetry) => void | Promise<void>;
  generateTextFn?: GenerateTextLike;
}

export interface StructuredGenerationResult<T> {
  output: T;
  mode: StructuredOutputMode;
  attempts: number;
  rawText?: string;
  warnings: string[];
}

export class StructuredOutputError extends Error {
  readonly code: StructuredOutputErrorCode;
  readonly label: string;
  readonly schemaName: string;
  readonly modelId?: string;
  readonly mode: StructuredOutputMode;
  readonly rawText?: string;
  override readonly cause: unknown;

  constructor(opts: {
    code: StructuredOutputErrorCode;
    label: string;
    schemaName: string;
    modelId?: string;
    mode: StructuredOutputMode;
    message: string;
    rawText?: string;
    cause?: unknown;
  }) {
    super(`[${opts.label}] ${opts.message}`);
    this.name = 'StructuredOutputError';
    this.code = opts.code;
    this.label = opts.label;
    this.schemaName = opts.schemaName;
    this.modelId = opts.modelId;
    this.mode = opts.mode;
    this.rawText = opts.rawText;
    this.cause = opts.cause;
  }
}

const DEFAULT_FINAL_INSTRUCTION =
  'Stop calling source tools. Return the final object now. Use the required structured output channel. Do not include explanations, markdown fences, or reasoning text.';

export async function generateStructuredObject<T>(
  options: GenerateStructuredObjectOptions<T>,
): Promise<StructuredGenerationResult<T>> {
  const modes = selectStructuredOutputModes(options);
  if (modes.length === 0) {
    throw new StructuredOutputError({
      code: 'NO_SUPPORTED_MODE',
      label: options.label,
      schemaName: options.schemaName,
      modelId: options.modelId,
      mode: 'prompted_json',
      message: 'No structured output mode is available for this model.',
    });
  }

  let fallbackFrom: StructuredOutputMode | null = null;
  let lastError: unknown = null;
  const warnings: string[] = [];

  for (const mode of modes) {
    try {
      const result = await runStructuredMode(options, mode);
      emitTelemetry(options, {
        label: options.label,
        schemaName: options.schemaName,
        modelId: options.modelId,
        mode,
        attempts: result.attempts,
        success: true,
        fallbackFrom,
        rawTextLength: result.rawText?.length,
      });
      return {
        ...result,
        warnings,
      };
    } catch (error) {
      lastError = error;
      fallbackFrom = mode;
      warnings.push(error instanceof Error ? error.message : String(error));
      emitTelemetry(options, {
        label: options.label,
        schemaName: options.schemaName,
        modelId: options.modelId,
        mode,
        attempts: 1,
        success: false,
        fallbackFrom: null,
        rawTextLength: error instanceof StructuredOutputError ? error.rawText?.length : undefined,
        errorCode: error instanceof StructuredOutputError ? error.code : undefined,
      });
    }
  }

  if (lastError instanceof StructuredOutputError) {
    throw lastError;
  }

  throw new StructuredOutputError({
    code: 'SCHEMA_VALIDATION_FAILED',
    label: options.label,
    schemaName: options.schemaName,
    modelId: options.modelId,
    mode: modes[modes.length - 1] ?? 'prompted_json',
    message: 'All structured output modes failed.',
    cause: lastError,
  });
}

export function selectStructuredOutputModes<T>(
  options: Pick<
    GenerateStructuredObjectOptions<T>,
    'modelId' | 'useNativeStructuredOutput' | 'allowOutputTool' | 'preferredModes'
  >,
): StructuredOutputMode[] {
  const preferred =
    options.preferredModes ?? [
      'native_object',
      'forced_output_tool',
      'prompted_json',
    ];
  const effectiveModelId = getEffectiveModelId(options.modelId);
  const caps = getModelCapabilities(effectiveModelId);
  const nativeAllowed =
    options.useNativeStructuredOutput === true ||
    supportsNativeStructuredOutput(effectiveModelId);
  const outputToolAllowed =
    options.allowOutputTool !== false && caps.supportsTools === true;

  return preferred.filter((mode) => {
    if (mode === 'native_object') return nativeAllowed;
    if (mode === 'forced_output_tool') return outputToolAllowed;
    if (mode === 'json_object') return false;
    return true;
  });
}

function getEffectiveModelId(modelId?: string) {
  return (
    modelId ||
    process.env.DEFAULT_AI_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    'deepseek/deepseek-chat'
  );
}

async function runStructuredMode<T>(
  options: GenerateStructuredObjectOptions<T>,
  mode: StructuredOutputMode,
): Promise<Omit<StructuredGenerationResult<T>, 'warnings'>> {
  if (mode === 'native_object') {
    return runNativeObject(options);
  }
  if (mode === 'forced_output_tool') {
    return runForcedOutputTool(options);
  }
  if (mode === 'prompted_json') {
    return runPromptedJson(options);
  }

  throw new StructuredOutputError({
    code: 'NO_SUPPORTED_MODE',
    label: options.label,
    schemaName: options.schemaName,
    modelId: options.modelId,
    mode,
    message: `${mode} is not implemented yet.`,
  });
}

async function runNativeObject<T>(
  options: GenerateStructuredObjectOptions<T>,
): Promise<Omit<StructuredGenerationResult<T>, 'warnings'>> {
  const generateText = options.generateTextFn ?? defaultGenerateText;
  try {
    const result = await generateText({
      ...buildBaseGenerateOptions(options),
      tools: options.tools,
      stopWhen: options.stopWhen,
      output: Output.object({
        name: options.schemaName,
        schema: options.schema,
      }),
    });

    if (result.output == null) {
      throw new Error('Provider returned no structured output.');
    }

    return {
      output: options.schema.parse(result.output),
      mode: 'native_object',
      attempts: 1,
      rawText: result.text,
    };
  } catch (error) {
    throw new StructuredOutputError({
      code: 'NATIVE_OBJECT_FAILED',
      label: options.label,
      schemaName: options.schemaName,
      modelId: options.modelId,
      mode: 'native_object',
      message: NoObjectGeneratedError.isInstance(error)
        ? `Native structured output failed: ${stringifyCause(error.cause)}`
        : `Native structured output failed: ${stringifyCause(error)}`,
      rawText: NoObjectGeneratedError.isInstance(error) ? error.text : undefined,
      cause: error,
    });
  }
}

async function runForcedOutputTool<T>(
  options: GenerateStructuredObjectOptions<T>,
): Promise<Omit<StructuredGenerationResult<T>, 'warnings'>> {
  const generateText = options.generateTextFn ?? defaultGenerateText;
  const toolName = createOutputToolName(options.schemaName);
  const outputTools = {
    [toolName]: tool({
      description: `Submit the final ${options.schemaName} object.`,
      inputSchema: options.schema,
    }),
  };
  let lastRawText = '';
  let lastError: unknown = null;
  let repairMessages: ModelMessage[] | undefined;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await generateText({
      ...buildBaseGenerateOptions(options, repairMessages),
      tools: outputTools,
      toolChoice: { type: 'tool', toolName } as any,
      maxOutputTokens: options.maxOutputTokens ?? getMaxOutputTokens(options.modelId),
    });
    lastRawText = result.text ?? '';

    const outputCall = [...(result.toolCalls ?? [])]
      .reverse()
      .find((call: any) => call.toolName === toolName && call.invalid !== true);

    if (outputCall) {
      const parsed = options.schema.safeParse(outputCall.input);
      if (parsed.success) {
        return {
          output: parsed.data,
          mode: 'forced_output_tool',
          attempts: attempt,
          rawText: lastRawText,
        };
      }
      lastError = parsed.error;
    } else {
      lastError = new Error(`Model did not call ${toolName}.`);
    }

    repairMessages = buildRepairMessages(
      options,
      result.response?.messages,
      lastRawText,
      `The previous response did not call ${toolName} with valid input. Call ${toolName} exactly once and make the input satisfy the ${options.schemaName} schema. Validation error: ${stringifyCause(lastError)}`,
    );
  }

  throw new StructuredOutputError({
    code:
      lastError instanceof Error && lastError.message.includes('did not call')
        ? 'OUTPUT_TOOL_NOT_CALLED'
        : 'OUTPUT_TOOL_VALIDATION_FAILED',
    label: options.label,
    schemaName: options.schemaName,
    modelId: options.modelId,
    mode: 'forced_output_tool',
    message: `Forced output tool failed: ${stringifyCause(lastError)}`,
    rawText: lastRawText,
    cause: lastError,
  });
}

async function runPromptedJson<T>(
  options: GenerateStructuredObjectOptions<T>,
): Promise<Omit<StructuredGenerationResult<T>, 'warnings'>> {
  const generateText = options.generateTextFn ?? defaultGenerateText;
  let result = await generateText({
    ...buildBaseGenerateOptions(options),
    maxOutputTokens: options.maxOutputTokens ?? getMaxOutputTokens(options.modelId),
  });

  try {
    return {
      output: parseJsonFromText(result.text, options.schema, options.label),
      mode: 'prompted_json',
      attempts: 1,
      rawText: result.text,
    };
  } catch (initialError) {
    const repairMessages = buildRepairMessages(
      options,
      result.response?.messages,
      result.text,
      `The previous response was not valid JSON for ${options.schemaName}. Return only one corrected JSON object. Validation error: ${stringifyCause(initialError)}`,
    );

    result = await generateText({
      ...buildBaseGenerateOptions(options, repairMessages),
      maxOutputTokens: options.maxOutputTokens ?? getMaxOutputTokens(options.modelId),
    });

    try {
      return {
        output: parseJsonFromText(
          result.text,
          options.schema,
          `${options.label}-repair`,
        ),
        mode: 'prompted_json',
        attempts: 2,
        rawText: result.text,
      };
    } catch (repairError) {
      throw new StructuredOutputError({
        code: 'JSON_PARSE_FAILED',
        label: options.label,
        schemaName: options.schemaName,
        modelId: options.modelId,
        mode: 'prompted_json',
        message: `Prompted JSON failed: ${stringifyCause(repairError)}`,
        rawText: result.text,
        cause: repairError,
      });
    }
  }
}

function buildBaseGenerateOptions<T>(
  options: GenerateStructuredObjectOptions<T>,
  overrideMessages?: ModelMessage[],
): GenerateTextOptions {
  const base = {
    model: options.model,
    system: options.system
      ? adaptPromptForModel(options.system, options.modelId)
      : undefined,
    maxOutputTokens: options.maxOutputTokens ?? getMaxOutputTokens(options.modelId),
    providerOptions: options.providerOptions,
  };

  const messages = overrideMessages ?? buildMessages(options);
  if (messages) {
    return {
      ...base,
      messages,
    } as GenerateTextOptions;
  }

  return {
    ...base,
    prompt: adaptPromptForModel(options.prompt ?? '', options.modelId),
  } as GenerateTextOptions;
}

function buildMessages<T>(
  options: GenerateStructuredObjectOptions<T>,
): ModelMessage[] | undefined {
  if (options.messages) return options.messages;
  if (!options.responseMessages?.length) return undefined;

  const messages: ModelMessage[] = [];
  if (options.prompt) {
    messages.push({
      role: 'user',
      content: adaptPromptForModel(options.prompt, options.modelId),
    });
  }
  messages.push(...options.responseMessages);
  messages.push({
    role: 'user',
    content: options.finalInstruction ?? DEFAULT_FINAL_INSTRUCTION,
  });
  return messages;
}

function buildRepairMessages<T>(
  options: GenerateStructuredObjectOptions<T>,
  responseMessages: ModelMessage[] | undefined,
  rawText: string | undefined,
  repairInstruction: string,
): ModelMessage[] {
  if (options.messages) {
    return [
      ...options.messages,
      ...(responseMessages ?? []),
      { role: 'user', content: repairInstruction },
    ];
  }

  const messages: ModelMessage[] = [];
  if (options.prompt) {
    messages.push({
      role: 'user',
      content: adaptPromptForModel(options.prompt, options.modelId),
    });
  }
  if (responseMessages?.length) {
    messages.push(...responseMessages);
  } else if (rawText) {
    messages.push({ role: 'assistant', content: rawText });
  }
  messages.push({ role: 'user', content: repairInstruction });
  return messages;
}

function createOutputToolName(schemaName: string) {
  const normalized = schemaName
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return `submit_${normalized || 'structured_output'}`;
}

function emitTelemetry<T>(
  options: GenerateStructuredObjectOptions<T>,
  event: StructuredOutputTelemetry,
) {
  if (!options.onTelemetry) return;
  void Promise.resolve(options.onTelemetry(event)).catch((error) => {
    console.warn('[structured-output-adapter] telemetry failed:', error);
  });
}

function stringifyCause(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
