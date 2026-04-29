import type { SourceItem } from './schemas/source-item'
import type { TeachingBrief } from './schemas/teaching-brief'

/**
 * Preset template for first-time users to try the system.
 * Uses the mini-redux example from docs/mini-redux.js
 */
export const FIRST_EXPERIENCE_TEMPLATE = {
  sourceItems: [
    {
      id: 'example-1',
      kind: 'snippet' as const,
      label: 'mini-redux.js',
      language: 'javascript',
      content: `// Mini Redux - 一个简化版的状态管理库
function createStore(reducer) {
  let state;
  let listeners = [];

  function getState() {
    return state;
  }

  function dispatch(action) {
    state = reducer(state, action);
    listeners.forEach(listener => listener());
    return action;
  }

  function subscribe(listener) {
    listeners.push(listener);
    return function unsubscribe() {
      listeners = listeners.filter(l => l !== listener);
    };
  }

  dispatch({ type: '@@INIT' });

  return { getState, dispatch, subscribe };
}

function combineReducers(reducers) {
  return function combination(state = {}, action) {
    let hasChanged = false;
    const nextState = {};
    for (const key of Object.keys(reducers)) {
      nextState[key] = reducers[key](state[key], action);
      hasChanged = hasChanged || nextState[key] !== state[key];
    }
    return hasChanged ? nextState : state;
  };
}`,
    },
  ] satisfies SourceItem[],
  teachingBrief: {
    topic: 'Redux 核心原理：createStore 和 combineReducers',
    audience_level: 'beginner' as const,
    core_question: 'Redux 是如何管理应用状态的？createStore 和 combineReducers 的内部实现原理是什么？',
    ignore_scope: '中间件、异步 action、React 集成',
    output_language: '中文',
    desired_depth: 'medium' as const,
  } satisfies TeachingBrief,
}

// ---------------------------------------------------------------------------
// Multi-file preset: mini-agent-typescript (6 files, ~780 LOC)
// Tests the agent-loop with a multi-file TypeScript codebase to exercise
// cross-file patching, retrieval-based outline, and per-step validation.
// ---------------------------------------------------------------------------

export const MINI_AGENT_TEMPLATE = {
  sourceItems: [
    {
      id: 'agent-1',
      kind: 'snippet' as const,
      label: 'schema.ts',
      language: 'typescript',
      content: `export type Role = "system" | "user" | "assistant" | "tool";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | readonly JsonValue[]
  | { [k: string]: JsonValue };
export type JsonObject = { [k: string]: JsonValue };

export type LLMProvider = "anthropic" | "openai";

export interface FunctionCall {
  name: string;
  arguments: JsonObject;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: FunctionCall;
}

export interface Message {
  role: Role;
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  finishReason: string;
  usage?: TokenUsage;
}`,
    },
    {
      id: 'agent-2',
      kind: 'snippet' as const,
      label: 'tools/Tool.ts',
      language: 'typescript',
      content: `import type { JsonObject } from "../schema.js";

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

export type JsonSchema = JsonObject;

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
  execute(args: JsonObject): Promise<ToolResult>;
  toAnthropicSchema(): JsonObject;
  toOpenAISchema(): JsonObject;
}

export abstract class BaseTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: JsonSchema;
  abstract execute(args: JsonObject): Promise<ToolResult>;

  toAnthropicSchema(): JsonObject {
    return { name: this.name, description: this.description, input_schema: this.parameters };
  }

  toOpenAISchema(): JsonObject {
    return { type: "function", function: { name: this.name, description: this.description, parameters: this.parameters } };
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  register(tool: Tool): void { this.tools.set(tool.name, tool); }
  get(name: string): Tool | undefined { return this.tools.get(name); }
  list(): Tool[] { return [...this.tools.values()]; }
}`,
    },
    {
      id: 'agent-3',
      kind: 'snippet' as const,
      label: 'llm/LLMClient.ts',
      language: 'typescript',
      content: `import type { JsonObject, LLMProvider, LLMResponse, Message } from "../schema.js";
import type { LLMClientBase } from "./base.js";
import { AnthropicClient } from "./anthropicClient.js";
import { OpenAIClient } from "./openaiClient.js";

export class LLMClient implements LLMClientBase {
  private readonly impl: LLMClientBase;
  readonly apiBase: string;
  readonly provider: LLMProvider;

  constructor(opts: {
    apiKey: string;
    provider: LLMProvider;
    apiBase: string;
    model: string;
    retry: { enabled: boolean; maxRetries: number; initialDelaySec: number; maxDelaySec: number; exponentialBase: number };
  }) {
    this.provider = opts.provider;
    const normalized = opts.apiBase.replace(/\\/anthropic\\/?$/, "").replace(/\\/v1\\/?$/, "");
    if (opts.provider === "anthropic") {
      this.apiBase = \`\${normalized.replace(/\\/$/, "")}/anthropic\`;
      this.impl = new AnthropicClient(opts.apiKey, this.apiBase, opts.model, opts.retry);
    } else {
      this.apiBase = \`\${normalized.replace(/\\/$/, "")}/v1\`;
      this.impl = new OpenAIClient(opts.apiKey, this.apiBase, opts.model, opts.retry);
    }
  }

  generate(messages: Message[], tools?: JsonObject[]): Promise<LLMResponse> {
    return this.impl.generate(messages, tools);
  }
}`,
    },
    {
      id: 'agent-4',
      kind: 'snippet' as const,
      label: 'agent/Agent.ts',
      language: 'typescript',
      content: `import path from "node:path";
import type { LLMClient } from "../llm/LLMClient.js";
import { AgentLogger } from "../logger.js";
import type { JsonObject, Message, ToolCall } from "../schema.js";
import type { Tool, ToolResult } from "../tools/Tool.js";

const SUMMARY_MARKER = "[Assistant Execution Summary]";

export class Agent {
  readonly tools: Record<string, Tool>;
  readonly messages: Message[];
  private apiLastTotalTokens = 0;
  private skipNextTokenCheck = false;
  private readonly logger: AgentLogger;
  private readonly workspaceDirAbs: string;
  private readonly verbose: boolean;

  constructor(opts: { llm: LLMClient; systemPrompt: string; tools: Tool[]; maxSteps: number; tokenLimit: number; workspaceDir: string; verbose?: boolean }) {
    this.llm = opts.llm;
    this.tools = Object.fromEntries(opts.tools.map((t) => [t.name, t]));
    this.maxSteps = opts.maxSteps;
    this.tokenLimit = opts.tokenLimit;
    this.workspaceDirAbs = path.resolve(opts.workspaceDir);
    this.logger = new AgentLogger();
    this.verbose = opts.verbose ?? true;
    let systemPrompt = opts.systemPrompt;
    if (!systemPrompt.includes("Current Workspace")) {
      systemPrompt += \`\\n\\n## Current Workspace\\nYou are currently working in: \\\`\${this.workspaceDirAbs}\\\`\\nAll relative paths will be resolved relative to this directory.\`;
    }
    this.messages = [{ role: "system", content: systemPrompt }];
  }

  private readonly llm: LLMClient;
  private readonly maxSteps: number;
  private readonly tokenLimit: number;

  addUserMessage(content: string): void { this.messages.push({ role: "user", content }); }

  private estimateTokensFallback(): number {
    let chars = 0;
    for (const m of this.messages) {
      chars += m.content.length;
      if (m.thinking) chars += m.thinking.length;
      if (m.toolCalls) chars += JSON.stringify(m.toolCalls).length;
    }
    return Math.floor(chars / 2.5);
  }

  private async summarizeMessagesIfNeeded(): Promise<void> {
    if (this.skipNextTokenCheck) { this.skipNextTokenCheck = false; return; }
    const estimated = this.estimateTokensFallback();
    const should = estimated > this.tokenLimit || this.apiLastTotalTokens > this.tokenLimit;
    if (!should) return;
    const userIdx: number[] = [];
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i]!.role === "user" && i > 0) userIdx.push(i);
    }
    if (!userIdx.length) return;
    const newMessages: Message[] = [this.messages[0]!];
    for (let i = 0; i < userIdx.length; i++) {
      const cur = userIdx[i]!;
      const next = i < userIdx.length - 1 ? userIdx[i + 1]! : this.messages.length;
      newMessages.push(this.messages[cur]!);
      const execMessages = this.messages.slice(cur + 1, next);
      if (execMessages.length) {
        if (execMessages.length === 1 && execMessages[0]!.role === "assistant" && execMessages[0]!.content.startsWith(SUMMARY_MARKER)) {
          newMessages.push(execMessages[0]!); continue;
        }
        const summaryText = await this.createSummary(execMessages, i + 1);
        if (summaryText) {
          newMessages.push({ role: "assistant", content: \`\${SUMMARY_MARKER}\\n\\n\${summaryText}\` });
        }
      }
    }
    this.messages.length = 0;
    this.messages.push(...newMessages);
    this.skipNextTokenCheck = true;
  }

  private async createSummary(messages: Message[], roundNum: number): Promise<string> {
    if (!messages.length) return "";
    let summaryContent = \`Round \${roundNum} execution process:\\n\\n\`;
    for (const msg of messages) {
      if (msg.role === "assistant") {
        summaryContent += \`Assistant: \${truncateForSummary(msg.content, 4000)}\\n\`;
        if (msg.toolCalls?.length) summaryContent += \`  -> Called tools: \${msg.toolCalls.map((t) => t.function.name).join(", ")}\\n\`;
      } else if (msg.role === "tool") {
        summaryContent += \`  <- Tool returned: \${truncateForSummary(msg.content, 2000)}\\n\`;
      }
    }
    const resp = await this.llm.generate([
      { role: "system", content: "You are an assistant skilled at summarizing Agent execution processes." },
      { role: "user", content: \`Please summarize concisely:\\n\\n\${summaryContent}\\n\\nFocus on tasks completed and tools called. Under 1000 words. English.\` }
    ], undefined);
    return resp.content ?? "";
  }

  async run(): Promise<string> {
    await this.logger.startNewRun();
    for (let step = 0; step < this.maxSteps; step++) {
      await this.summarizeMessagesIfNeeded();
      const toolSchemas = Object.values(this.tools).map((t) =>
        this.llm.provider === "anthropic" ? t.toAnthropicSchema() : t.toOpenAISchema()
      );
      const response = await this.llm.generate(this.messages, toolSchemas);
      this.apiLastTotalTokens = response.usage?.totalTokens ?? this.apiLastTotalTokens;
      this.messages.push({ role: "assistant", content: response.content, thinking: response.thinking, toolCalls: response.toolCalls });
      if (!response.toolCalls?.length) return response.content;
      for (const call of response.toolCalls) {
        const tool = this.tools[call.function.name];
        if (!tool) { this.messages.push({ role: "tool", content: \`Error: Unknown tool: \${call.function.name}\`, toolCallId: call.id, name: call.function.name }); continue; }
        let result: ToolResult;
        try { result = await tool.execute(call.function.arguments); }
        catch (e) { result = { success: false, content: "", error: \`Tool execution failed: \${(e as Error).message}\` }; }
        this.messages.push({ role: "tool", content: result.success ? result.content : \`Error: \${result.error ?? "Tool execution failed"}\`, toolCallId: call.id, name: call.function.name });
      }
    }
    return \`Task couldn't be completed after \${this.maxSteps} steps.\`;
  }
}

function truncateForSummary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headLen = Math.floor(maxChars * 0.7);
  const tailLen = Math.max(0, maxChars - headLen);
  return \`\${text.slice(0, headLen)}\\n... (truncated \${text.length} chars) ...\\n\${tailLen ? text.slice(-tailLen) : ""}\`;
}`,
    },
    {
      id: 'agent-5',
      kind: 'snippet' as const,
      label: 'tools/fileTools.ts',
      language: 'typescript',
      content: `import fs from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../schema.js";
import { resolveInWorkspace } from "../utils/workspacePath.js";
import { BaseTool, type ToolResult } from "./Tool.js";

function asString(v: unknown, name: string): string {
  if (typeof v !== "string") throw new Error(\`Expected '\${name}' to be string\`);
  return v;
}
function asNumberOpt(v: unknown, name: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(\`Expected '\${name}' to be number\`);
  return v;
}

function withLineNumbers(lines: string[], startLineNo: number): string {
  return lines.map((l, i) => \`\${String(startLineNo + i).padStart(6, " ")}|\${l}\`).join("\\n");
}

const DEFAULT_MAX_CHARS = 200_000;
function truncateText(text: string, maxChars = DEFAULT_MAX_CHARS): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.6));
  const tail = text.slice(-Math.floor(maxChars * 0.4));
  return \`\${head}\\n\\n... [Content truncated: \${text.length} chars -> \${maxChars} chars] ...\\n\\n\${tail}\`;
}

export class ReadFileTool extends BaseTool {
  readonly name = "read_file";
  readonly description = "读取文件内容（输出包含行号：LINE|CONTENT，1 起）。支持 offset/limit 用于大文件分块读取。";
  readonly parameters = { type: "object", properties: { path: { type: "string", description: "文件路径" }, offset: { type: "number", description: "起始行号（1 起）" }, limit: { type: "number", description: "读取行数" } }, required: ["path"] } as const;
  constructor(private readonly workspaceDirAbs: string) { super(); }
  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const p = asString(args.path, "path");
      const absPath = resolveInWorkspace(this.workspaceDirAbs, p);
      const raw = await fs.readFile(absPath, "utf-8");
      const lines = raw.split(/\\r?\\n/);
      const start = Math.max(0, ((asNumberOpt(args.offset, "offset") ?? 1) - 1) | 0);
      const limit = asNumberOpt(args.limit, "limit");
      const end = Math.min(lines.length, limit ? start + (limit | 0) : lines.length);
      return { success: true, content: truncateText(withLineNumbers(lines.slice(start, end), start + 1)) };
    } catch (e) { return { success: false, content: "", error: (e as Error).message }; }
  }
}

export class WriteFileTool extends BaseTool {
  readonly name = "write_file";
  readonly description = "写入文件（会完全覆盖）。";
  readonly parameters = { type: "object", properties: { path: { type: "string", description: "文件路径" }, content: { type: "string", description: "完整内容" } }, required: ["path", "content"] } as const;
  constructor(private readonly workspaceDirAbs: string) { super(); }
  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const absPath = resolveInWorkspace(this.workspaceDirAbs, asString(args.path, "path"));
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, asString(args.content, "content"), "utf-8");
      return { success: true, content: \`Successfully wrote to \${absPath}\` };
    } catch (e) { return { success: false, content: "", error: (e as Error).message }; }
  }
}

export class EditFileTool extends BaseTool {
  readonly name = "edit_file";
  readonly description = "对文件做精确字符串替换。old_str 必须唯一匹配。";
  readonly parameters = { type: "object", properties: { path: { type: "string", description: "文件路径" }, old_str: { type: "string", description: "待替换的原始字符串（必须唯一匹配）" }, new_str: { type: "string", description: "替换后的字符串" } }, required: ["path", "old_str", "new_str"] } as const;
  constructor(private readonly workspaceDirAbs: string) { super(); }
  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const absPath = resolveInWorkspace(this.workspaceDirAbs, asString(args.path, "path"));
      const oldStr = asString(args.old_str, "old_str");
      const newStr = asString(args.new_str, "new_str");
      const raw = await fs.readFile(absPath, "utf-8");
      const idx = raw.indexOf(oldStr);
      if (idx === -1) return { success: false, content: "", error: "old_str not found" };
      if (raw.indexOf(oldStr, idx + 1) !== -1) return { success: false, content: "", error: "old_str is not unique in file" };
      await fs.writeFile(absPath, raw.slice(0, idx) + newStr + raw.slice(idx + oldStr.length), "utf-8");
      return { success: true, content: \`Edited \${absPath}\` };
    } catch (e) { return { success: false, content: "", error: (e as Error).message }; }
  }
}`,
    },
    {
      id: 'agent-6',
      kind: 'snippet' as const,
      label: 'tools/noteTools.ts',
      language: 'typescript',
      content: `import fs from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../schema.js";
import { resolveInWorkspace } from "../utils/workspacePath.js";
import { BaseTool, type ToolResult } from "./Tool.js";

type Note = { timestamp: string; category: string; content: string };

function asString(v: unknown, name: string): string {
  if (typeof v !== "string") throw new Error(\`Expected '\${name}' to be string\`);
  return v;
}

export function defaultMemoryFile(workspaceDirAbs: string): string {
  return resolveInWorkspace(workspaceDirAbs, ".agent_memory.json");
}

async function loadNotes(fileAbs: string): Promise<Note[]> {
  try { const v = JSON.parse(await fs.readFile(fileAbs, "utf-8")); return Array.isArray(v) ? (v as Note[]) : []; }
  catch { return []; }
}

async function saveNotes(fileAbs: string, notes: Note[]): Promise<void> {
  await fs.mkdir(path.dirname(fileAbs), { recursive: true });
  await fs.writeFile(fileAbs, JSON.stringify(notes, null, 2), "utf-8");
}

export class RecordNoteTool extends BaseTool {
  readonly name = "record_note";
  readonly description = "记录重要信息到会话笔记/长期记忆（带时间戳）。";
  readonly parameters = { type: "object", properties: { content: { type: "string", description: "要记录的内容" }, category: { type: "string", description: "可选分类" } }, required: ["content"] } as const;
  constructor(private readonly memoryFileAbs: string) { super(); }
  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const content = asString(args.content, "content");
      const category = (args.category ? asString(args.category, "category") : "general") || "general";
      const notes = await loadNotes(this.memoryFileAbs);
      notes.push({ timestamp: new Date().toISOString(), category, content });
      await saveNotes(this.memoryFileAbs, notes);
      return { success: true, content: \`Recorded note: \${content} (category: \${category})\` };
    } catch (e) { return { success: false, content: "", error: (e as Error).message }; }
  }
}

export class RecallNotesTool extends BaseTool {
  readonly name = "recall_notes";
  readonly description = "读取所有已记录的会话笔记，可按 category 过滤。";
  readonly parameters = { type: "object", properties: { category: { type: "string", description: "按分类过滤" } } } as const;
  constructor(private readonly memoryFileAbs: string) { super(); }
  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const category = args.category ? asString(args.category, "category") : undefined;
      const notes = await loadNotes(this.memoryFileAbs);
      if (!notes.length) return { success: true, content: "No notes recorded yet." };
      const filtered = category ? notes.filter((n) => n.category === category) : notes;
      if (category && !filtered.length) return { success: true, content: \`No notes found in category: \${category}\` };
      const out = filtered.map((n, i) => \`\${i + 1}. [\${n.category}] \${n.content}\\n   (recorded at \${n.timestamp})\`).join("\\n");
      return { success: true, content: \`Recorded Notes:\\n\${out}\` };
    } catch (e) { return { success: false, content: "", error: (e as Error).message }; }
  }
}`,
    },
  ] satisfies SourceItem[],
  teachingBrief: {
    topic: '从零实现一个 TypeScript AI Agent：Tool Calling、上下文管理与摘要',
    audience_level: 'intermediate' as const,
    core_question: '一个 AI Agent 的核心循环是如何工作的？Tool Calling 怎么让模型操作外部世界？消息历史过长时如何做上下文摘要？',
    ignore_scope: 'MCP 协议、Skills 系统、具体 LLM Provider 的 HTTP 实现',
    output_language: '中文',
    desired_depth: 'deep' as const,
  } satisfies TeachingBrief,
}
