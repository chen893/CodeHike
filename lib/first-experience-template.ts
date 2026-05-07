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
// Multi-file preset: mini-agent-typescript (25 files, ~3505 LOC)
// Full curated codebase to exercise cross-file patching, retrieval-based
// outline, per-step validation, and large-codebase generation quality.
// ---------------------------------------------------------------------------

export const MINI_AGENT_TEMPLATE = {
  sourceItems: [
    {
      id: 'agent-1',
      kind: 'snippet' as const,
      label: 'agent/Agent.ts',
      language: 'typescript',
      content: `import path from "node:path";
import type { LLMClient } from "../llm/LLMClient.js";
import { AgentLogger } from "../logger.js";
import type { JsonObject, Message, ToolCall } from "../schema.js";
import type { Tool, ToolResult } from "../tools/Tool.js";

const SUMMARY_MARKER = "[Assistant Execution Summary]";

/**
 * Agent（与 Python 版 mini_agent/agent.py 尽量保持一致）
 *
 * 核心职责：
 * - 维护 message history（system/user/assistant/tool）
 * - 反复调用 LLM，直到：
 *   - 模型不再发起 tool_calls（认为任务完成），或
 *   - 达到 max_steps（防止无限循环）
 * - 执行 tool_calls，并把 tool 结果回写到 message history
 * - 进行“上下文管理”：当历史过长时，对执行过程做摘要（避免上下文溢出）
 *
 * 重要概念：
 * - Tool calling：模型输出 tool_calls，我们执行，然后把结果作为 role=tool 回传给模型
 * - Progressive Disclosure（Skills）：系统提示词只注入技能元数据；需要时由模型调用 get_skill 加载全文
 */
export class Agent {
  readonly tools: Record<string, Tool>;
  readonly messages: Message[];

  // API 返回的“最近一次请求 totalTokens”（prompt+completion），不是累计值。
  private apiLastTotalTokens = 0;
  private skipNextTokenCheck = false;
  private readonly logger: AgentLogger;
  private readonly workspaceDirAbs: string;
  private readonly verbose: boolean;

  constructor(opts: {
    llm: LLMClient;
    systemPrompt: string;
    tools: Tool[];
    maxSteps: number;
    tokenLimit: number;
    workspaceDir: string;
    verbose?: boolean;
  }) {
    this.llm = opts.llm;
    this.tools = Object.fromEntries(opts.tools.map((t) => [t.name, t]));
    this.maxSteps = opts.maxSteps;
    this.tokenLimit = opts.tokenLimit;
    this.workspaceDirAbs = path.resolve(opts.workspaceDir);
    this.logger = new AgentLogger();
    this.verbose = opts.verbose ?? true;

    // 与 Python 版一致：把 workspace 信息注入 system prompt（如果尚未包含）
    let systemPrompt = opts.systemPrompt;
    if (!systemPrompt.includes("Current Workspace")) {
      systemPrompt +=
        \`\\n\\n## Current Workspace\\n\` +
        \`You are currently working in: \\\`\${this.workspaceDirAbs}\\\`\\n\` +
        \`All relative paths will be resolved relative to this directory.\`;
    }

    this.messages = [{ role: "system", content: systemPrompt }];
  }

  private readonly llm: LLMClient;
  private readonly maxSteps: number;
  private readonly tokenLimit: number;

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  /**
   * token 估算（教学项目的简化版）：
   * - Python 版使用 tiktoken 做准确估算
   * - TS 教学版避免引入额外依赖，采用字符数近似（平均 2.5 字符 ≈ 1 token）
   *
   * 说明：
   * - 这是“触发摘要”的启发式；不要求完全准确
   */
  private estimateTokensFallback(): number {
    let chars = 0;
    for (const m of this.messages) {
      chars += m.content.length;
      if (m.thinking) chars += m.thinking.length;
      if (m.toolCalls) chars += JSON.stringify(m.toolCalls).length;
    }
    return Math.floor(chars / 2.5);
  }

  /**
   * 与 Python 版一致的摘要策略：
   * - 保留所有 user 消息（用户意图必须完整保留）
   * - 将每个 user 消息之后、下一个 user 消息之前的“执行过程”（assistant/tool）汇总成一条摘要消息
   * - 结构：system -> user1 -> summary1 -> user2 -> summary2 -> ...
   */
  private async summarizeMessagesIfNeeded(): Promise<void> {
    if (this.skipNextTokenCheck) {
      this.skipNextTokenCheck = false;
      return;
    }

    const estimated = this.estimateTokensFallback();
    const should = estimated > this.tokenLimit || this.apiLastTotalTokens > this.tokenLimit;
    if (!should) return;

    if (this.verbose) {
      console.log(
        \`\\n[context] token usage (estimated=\${estimated}, api_total=\${this.apiLastTotalTokens}, limit=\${this.tokenLimit})\`
      );
      console.log("[context] triggering message history summarization...");
    }

    const userIdx: number[] = [];
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i]!.role === "user" && i > 0) userIdx.push(i);
    }
    if (!userIdx.length) return;

    const newMessages: Message[] = [this.messages[0]!];
    let summaryCount = 0;

    for (let i = 0; i < userIdx.length; i++) {
      const cur = userIdx[i]!;
      const next = i < userIdx.length - 1 ? userIdx[i + 1]! : this.messages.length;

      newMessages.push(this.messages[cur]!); // 保留 user 消息

      const execMessages = this.messages.slice(cur + 1, next);
      if (execMessages.length) {
        // 避免重复触发摘要时出现“摘要的摘要”。
        if (
          execMessages.length === 1 &&
          execMessages[0]!.role === "assistant" &&
          execMessages[0]!.content.startsWith(SUMMARY_MARKER)
        ) {
          newMessages.push(execMessages[0]!);
          continue;
        }

        const summaryText = await this.createSummary(execMessages, i + 1);
        if (summaryText) {
          newMessages.push({
            // 使用 assistant，避免覆盖 Anthropic 的单 system 字段。
            role: "assistant",
            content: \`\${SUMMARY_MARKER}\\n\\n\${summaryText}\`
          });
          summaryCount++;
        }
      }
    }

    this.messages.length = 0;
    this.messages.push(...newMessages);

    this.skipNextTokenCheck = true;
    void summaryCount; // 与 Python 版日志保持一致；CLI 里可按需打印
  }

  private async createSummary(messages: Message[], roundNum: number): Promise<string> {
    if (!messages.length) return "";

    const MAX_SUMMARY_INPUT_CHARS = 40_000;
    const MAX_TOOL_SNIPPET_CHARS = 2_000;
    const MAX_ASSISTANT_SNIPPET_CHARS = 4_000;

    // 为了最大化一致性，这里复刻 Python 版 summary prompt 的风格与要求（英文摘要）。
    let summaryContent = \`Round \${roundNum} execution process:\\n\\n\`;
    for (const msg of messages) {
      if (msg.role === "assistant") {
        summaryContent += \`Assistant: \${truncateForSummary(msg.content, MAX_ASSISTANT_SNIPPET_CHARS)}\\n\`;
        if (msg.toolCalls?.length) {
          const names = msg.toolCalls.map((t) => t.function.name);
          summaryContent += \`  -> Called tools: \${names.join(", ")}\\n\`;
        }
      } else if (msg.role === "tool") {
        summaryContent += \`  <- Tool returned: \${truncateForSummary(msg.content, MAX_TOOL_SNIPPET_CHARS)}\\n\`;
      }

      if (summaryContent.length >= MAX_SUMMARY_INPUT_CHARS) {
        summaryContent += "\\n...(truncated summary input to avoid context overflow)...\\n";
        break;
      }
    }

    const summaryPrompt =
      "Please provide a concise summary of the following Agent execution process:\\n\\n" +
      summaryContent +
      "\\n\\nRequirements:\\n" +
      "1. Focus on what tasks were completed and which tools were called\\n" +
      "2. Keep key execution results and important findings\\n" +
      "3. Be concise and clear, within 1000 words\\n" +
      "4. Use English\\n" +
      '5. Do not include "user" related content, only summarize the Agent\\'s execution process';

    const resp = await this.llm.generate(
      [
        { role: "system", content: "You are an assistant skilled at summarizing Agent execution processes." },
        { role: "user", content: summaryPrompt }
      ],
      undefined
    );

    return resp.content ?? "";
  }

  /**
   * 主执行循环（与 Python 版 Agent.run() 对齐）
   */
  async run(): Promise<string> {
    await this.logger.startNewRun();
    if (this.verbose) {
      console.log(\`📝 Log file: \${this.logger.getLogFilePath()}\`);
    }

    for (let step = 0; step < this.maxSteps; step++) {
      await this.summarizeMessagesIfNeeded();

      if (this.verbose) {
        console.log(\`\\n=== Step \${step + 1}/\${this.maxSteps} ===\`);
      }

      // 把工具 schema 发给模型（不同 provider 的 schema 形状不同）
      const toolSchemas = Object.values(this.tools).map((t) =>
        this.llm.provider === "anthropic" ? t.toAnthropicSchema() : t.toOpenAISchema()
      );

      await this.logger.logRequest({
        messages: this.messages,
        toolNames: Object.values(this.tools).map((t) => t.name)
      });
      const response = await this.llm.generate(this.messages, toolSchemas);
      this.apiLastTotalTokens = response.usage?.totalTokens ?? this.apiLastTotalTokens;

      await this.logger.logResponse({
        content: response.content,
        thinking: response.thinking,
        toolCalls: response.toolCalls,
        finishReason: response.finishReason,
        usage: (response.usage as unknown as JsonObject) ?? null
      });

      // 把 assistant 消息写入历史（思考 + tool_calls 也要保留，保证 interleaved thinking 连贯）
      this.messages.push({
        role: "assistant",
        content: response.content,
        thinking: response.thinking,
        toolCalls: response.toolCalls
      });

      if (this.verbose) {
        if (response.thinking) console.log(\`\\n[thinking]\\n\${response.thinking}\`);
        if (response.content) console.log(\`\\n[assistant]\\n\${response.content}\`);
      }

      // 如果没有 tool_calls，任务结束
      if (!response.toolCalls?.length) return response.content;

      // 执行工具调用
      for (const call of response.toolCalls) {
        const name = call.function.name;
        const args = call.function.arguments;

        if (this.verbose) {
          const preview = JSON.stringify(truncateArgs(args), null, 2);
          console.log(\`\\n[tool_call] \${name}\`);
          console.log(preview);
        }

        const tool = this.tools[name];
        if (!tool) {
          const err = \`Unknown tool: \${name}\`;
          await this.logger.logToolResult({ toolName: name, arguments: args, success: false, resultError: err });
          this.messages.push({ role: "tool", content: \`Error: \${err}\`, toolCallId: call.id, name });
          continue;
        }

        let result: ToolResult;
        try {
          result = await tool.execute(args);
        } catch (e) {
          result = { success: false, content: "", error: \`Tool execution failed: \${(e as Error).message}\` };
        }

        await this.logger.logToolResult({
          toolName: name,
          arguments: args,
          success: result.success,
          resultContent: result.success ? result.content : undefined,
          resultError: result.success ? undefined : result.error
        });

        if (this.verbose) {
          if (result.success) {
            console.log(\`\\n[tool_result] ✅ \${name}\`);
            console.log(truncateText(result.content, 1200));
          } else {
            console.log(\`\\n[tool_result] ❌ \${name}\`);
            console.log(result.error ?? "Tool execution failed");
          }
        }

        this.messages.push({
          role: "tool",
          content: result.success ? result.content : \`Error: \${result.error ?? "Tool execution failed"}\`,
          toolCallId: call.id,
          name
        });
      }
    }

    return \`Task couldn't be completed after \${this.maxSteps} steps.\`;
  }
}

function truncateArgs(args: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(args)) {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    out[k] = s.length > 200 ? (s.slice(0, 200) + "...") : (v as any);
  }
  return out;
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\\n... (truncated)";
}

function truncateForSummary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headLen = Math.floor(maxChars * 0.7);
  const tailLen = Math.max(0, maxChars - headLen);
  const head = text.slice(0, headLen);
  const tail = tailLen ? text.slice(-tailLen) : "";
  return \`\${head}\\n... (truncated \${text.length} chars) ...\\n\${tail}\`;
}`,
    },
    {
      id: 'agent-2',
      kind: 'snippet' as const,
      label: 'cli.ts',
      language: 'typescript',
      content: `import path from "node:path";

import type { AppConfig } from "./config.js";
import { cleanup, createAgentRuntime, ensureDir, initializeBaseTools, loadConfig } from "./runtime/init.js";
import { LineEditor } from "./interactive/LineEditor.js";
import { appendHistory, defaultHistoryFile, loadHistory } from "./interactive/history.js";
import { calculateDisplayWidth } from "./utils/displayWidth.js";

/**
 * CLI（与 Python 版 mini_agent/cli.py 的“交互式运行”定位一致）
 *
 * 使用方式：
 * - \`npm run build\` 后：\`npm start -- --workspace ./workspace\`
 *
 * 说明：
 * - 为了让教学项目“零依赖”，这里没有引入 prompt_toolkit 一类的高级交互库
 * - 交互体验比 Python 版简单，但 Agent 核心循环、Tools、Skills、MCP 的工程结构保持一致
 */

function parseArgs(argv: string[]): { workspace?: string; version?: boolean } {
  const out: { workspace?: string; version?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--workspace" || a === "-w") out.workspace = argv[i + 1];
    if (a === "--version" || a === "-v") out.version = true;
  }
  return out;
}

export async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) {
    console.log("mini-agent-typescript 0.1.0");
    return;
  }

  const config: AppConfig = await loadConfig();

  const workspaceDirAbs = path.resolve(args.workspace ?? config.agent.workspaceDir ?? process.cwd());
  await ensureDir(workspaceDirAbs);

  // 初始化基础工具（与 workspace 无关）
  const { tools: baseTools, skillLoader } = await initializeBaseTools(config);
  const agent = await createAgentRuntime({
    config,
    workspaceDirAbs,
    baseTools,
    skillLoader,
    verbose: true
  });

  printBanner();
  printSessionInfo(config, workspaceDirAbs, Object.keys(agent.tools).length);

  try {
    const historyFile = defaultHistoryFile();
    const history = await loadHistory(historyFile, 500);

    const commands = ["/help", "/clear", "/history", "/stats", "/exit"];
    const completer = (prefix: string) => {
      if (!prefix.startsWith("/")) return null;
      const candidates = commands.filter((c) => c.startsWith(prefix)).sort();
      if (!candidates.length) return null;
      return { completed: candidates[0]!, candidates };
    };

    const editor = new LineEditor(process.stdin, process.stdout, "> ", history, completer);
    const sessionStart = Date.now();

    while (true) {
      const inputRaw = await editor.read();
      const input = inputRaw.trim();
      if (!input) continue;

      if (input === "/exit" || input === "exit" || input === "quit" || input === "q") break;

      if (input === "/help") {
        printHelp();
        continue;
      }

      if (input === "/clear") {
        // 保留 system prompt
        agent.messages.splice(1);
        console.log("✓ Cleared session (kept system prompt).");
        continue;
      }

      if (input === "/history") {
        console.log(\`Messages: \${agent.messages.length}\`);
        continue;
      }

      if (input === "/stats") {
        const durSec = Math.floor((Date.now() - sessionStart) / 1000);
        const byRole = { system: 0, user: 0, assistant: 0, tool: 0 };
        for (const m of agent.messages) (byRole as any)[m.role] += 1;
        console.log(
          [
            "",
            \`Session Duration: \${durSec}s\`,
            \`Messages: \${agent.messages.length}\`,
            \`  - system: \${byRole.system}\`,
            \`  - user: \${byRole.user}\`,
            \`  - assistant: \${byRole.assistant}\`,
            \`  - tool: \${byRole.tool}\`,
            ""
          ].join("\\n")
        );
        continue;
      }

      // 记录历史（包含多行输入；文件里会用 \\n 转义保存）
      await appendHistory(historyFile, inputRaw);
      history.push(inputRaw);

      agent.addUserMessage(inputRaw);
      await agent.run(); // Agent 内部会打印 step/thinking/tool/assistant
    }
  } finally {
    await cleanup();
  }
}

// 直接执行：node dist/cli.js
// 注意：这是 CLI 入口文件，因此这里直接调用 main。
// 如果你想把 Agent 作为库使用，请自行创建新的 entry，并避免自动执行。
// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

function printBanner(): void {
  const width = 58;
  const title = "🤖 Mini Agent - Multi-turn Interactive Session";
  const w = calculateDisplayWidth(title);
  const left = Math.floor((width - w) / 2);
  const right = Math.max(0, width - w - left);
  console.log("");
  console.log(\`╔\${"═".repeat(width)}╗\`);
  console.log(\`║\${" ".repeat(left)}\${title}\${" ".repeat(right)}║\`);
  console.log(\`╚\${"═".repeat(width)}╝\`);
  console.log("");
}

function printSessionInfo(config: AppConfig, workspaceDirAbs: string, toolsCount: number): void {
  const width = 58;
  const lines = [
    \`Model: \${config.llm.model} (\${config.llm.provider})\`,
    \`Workspace: \${workspaceDirAbs}\`,
    \`Available Tools: \${toolsCount}\`
  ];
  console.log(\`┌\${"─".repeat(width)}┐\`);
  for (const t of lines) {
    const w = calculateDisplayWidth(t);
    const pad = Math.max(0, width - 1 - w);
    console.log(\`│ \${t}\${" ".repeat(pad)}│\`);
  }
  console.log(\`└\${"─".repeat(width)}┘\`);
  console.log("");
  console.log("Type /help for help, /exit to quit");
  console.log("");
}

function printHelp(): void {
  console.log(
    [
      "",
      "Available Commands:",
      "  /help      - Show this help message",
      "  /clear     - Clear session history (keep system prompt)",
      "  /history   - Show current session message count",
      "  /stats     - Show session statistics",
      "  /exit      - Exit program (also: exit, quit, q)",
      "",
      "Keyboard Shortcuts:",
      "  Ctrl+U     - Clear current input buffer",
      "  Ctrl+L     - Clear screen",
      "  Ctrl+J     - Insert newline (multi-line input)",
      "  Tab        - Auto-complete commands",
      "  ↑/↓        - Browse history",
      ""
    ].join("\\n")
  );
}`,
    },
    {
      id: 'agent-3',
      kind: 'snippet' as const,
      label: 'config.ts',
      language: 'typescript',
      content: `import fs from "node:fs/promises";
import path from "node:path";

import { getHomeDir } from "./utils/homeDir.js";

export interface RetryConfig {
  enabled: boolean;
  maxRetries: number;
  initialDelaySec: number;
  maxDelaySec: number;
  exponentialBase: number;
}

export interface LLMConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  provider: "anthropic" | "openai";
}

export interface AgentConfig {
  maxSteps: number;
  tokenLimit: number;
  workspaceDir: string;
  systemPromptPath: string;
}

export interface ToolsConfig {
  enableFileTools: boolean;
  enableBash: boolean;
  enableNote: boolean;
  enableSkills: boolean;
  skillsDir: string;
  enableMcp: boolean;
  mcpConfigPath: string;
}

export interface AppConfig {
  llm: LLMConfig;
  retry: RetryConfig;
  agent: AgentConfig;
  tools: ToolsConfig;
  /** config.yaml 所在目录；用于解析 system_prompt / mcp.json 的相对路径 */
  configDirAbs: string;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function firstExistingFile(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    if (await fileExists(p)) return p;
  }
  return null;
}

/**
 * 一个“够用的 YAML 子集解析器”，专门服务于 config.yaml（仅 map + scalar）。
 *
 * 设计取舍（教学项目）：
 * - 不支持数组（list），不支持复杂类型
 * - 支持：缩进表示嵌套对象；支持字符串/数字/布尔；支持引号字符串；支持行内注释（#）
 *
 * 为什么不直接用 yaml npm 包？
 * - 这个仓库默认不依赖第三方包（读者即使没装依赖也能看懂/跑通编译）
 * - 真实项目建议：\`npm i yaml\` 然后替换为成熟解析器
 */
export function parseSimpleYaml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [{ indent: -1, obj: root }];

  const lines = text.replace(/^\\ufeff/, "").split(/\\r?\\n/);
  for (const rawLine of lines) {
    // 去掉注释（非常简化：遇到 # 就截断；适用于我们的配置文件）
    const lineNoComment = rawLine.split("#")[0] ?? "";
    if (!lineNoComment.trim()) continue;

    const indent = (lineNoComment.match(/^\\s*/)?.[0]?.length ?? 0) | 0;
    const line = lineNoComment.trim();

    const m = /^([A-Za-z0-9_-]+)\\s*:\\s*(.*)$/.exec(line);
    if (!m) continue;

    const key = m[1]!;
    const rawValue = m[2] ?? "";

    // 通过缩进找到父对象
    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) stack.pop();
    const parent = stack[stack.length - 1]!.obj;

    if (!rawValue) {
      // key:  => 新对象
      const next: Record<string, unknown> = {};
      parent[key] = next;
      stack.push({ indent, obj: next });
      continue;
    }

    parent[key] = parseYamlScalar(rawValue.trim());
  }

  return root;
}

function parseYamlScalar(v: string): string | number | boolean {
  // 去掉成对引号
  const quoted = /^"(.*)"$/.exec(v) || /^'(.*)'$/.exec(v);
  if (quoted) return quoted[1] ?? "";

  if (v === "true") return true;
  if (v === "false") return false;

  // 数字（整数/小数）
  if (/^-?\\d+(\\.\\d+)?$/.test(v)) return Number(v);

  return v;
}

function getString(obj: Record<string, unknown>, key: string, fallback?: string): string {
  const v = obj[key];
  if (typeof v === "string") return v;
  if (v === undefined && fallback !== undefined) return fallback;
  throw new Error(\`Invalid config: '\${key}' must be string\`);
}

function getNumber(obj: Record<string, unknown>, key: string, fallback?: number): number {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v === undefined && fallback !== undefined) return fallback;
  throw new Error(\`Invalid config: '\${key}' must be number\`);
}

function getBool(obj: Record<string, unknown>, key: string, fallback?: boolean): boolean {
  const v = obj[key];
  if (typeof v === "boolean") return v;
  if (v === undefined && fallback !== undefined) return fallback;
  throw new Error(\`Invalid config: '\${key}' must be boolean\`);
}

function getObj(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj[key];
  if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

export class ConfigLoader {
   /**
    * 查找 config.yaml：
    * - dev:  {cwd}/config/config.yaml
    * - dev2: {cwd}/mini-agent-typescript/config/config.yaml
    * - user: {home}/.mini-agent/config/config.yaml
    */
  private static getConfigSearchPaths(): string[] {
    return [
      path.resolve(process.cwd(), "config", "config.yaml"),
      path.resolve(process.cwd(), "mini-agent-typescript", "config", "config.yaml"),
      path.resolve(getHomeDir(), ".mini-agent", "config", "config.yaml")
    ];
  }

  static async findConfigPath(): Promise<string | null> {
    return firstExistingFile(ConfigLoader.getConfigSearchPaths());
  }

  static async load(): Promise<AppConfig> {
    const searchPaths = ConfigLoader.getConfigSearchPaths();
    const configPath = await ConfigLoader.findConfigPath();
    if (!configPath) {
      const exampleCandidates = [
        path.resolve(process.cwd(), "config", "config-example.yaml"),
        path.resolve(process.cwd(), "mini-agent-typescript", "config", "config-example.yaml")
      ];
      const examplePath = (await firstExistingFile(exampleCandidates)) ?? exampleCandidates[0]!;

      throw new Error(
        [
          "Configuration file not found.",
          ...searchPaths.map((p) => \`- Tried: \${p}\`),
          \`You can copy \\\`\${examplePath}\\\` to one of the search locations as config.yaml.\`
        ].join("\\n")
      );
    }

    const configDirAbs = path.dirname(configPath);

    const raw = await fs.readFile(configPath, "utf-8");
    const data = parseSimpleYaml(raw);

    const apiKey = getString(data, "api_key");
    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
      throw new Error("Please configure a valid api_key in config.yaml");
    }

    const provider = getString(data, "provider", "anthropic");
    if (provider !== "anthropic" && provider !== "openai") {
      throw new Error("Invalid provider: must be 'anthropic' or 'openai'");
    }

    const retryObj = getObj(data, "retry");
    const toolsObj = getObj(data, "tools");

    // 注意：为了保持与 Python 版一致，这里沿用同名 key（api_key/max_steps/tools.enable_skills ...）
    // 同时在 TypeScript 层改成更符合习惯的 camelCase 字段，便于日常编码。
    return {
      configDirAbs,
      llm: {
        apiKey,
        apiBase: getString(data, "api_base", "https://api.minimax.io"),
        model: getString(data, "model", "MiniMax-M2"),
        provider
      },
      retry: {
        enabled: getBool(retryObj, "enabled", true),
        maxRetries: getNumber(retryObj, "max_retries", 3),
        initialDelaySec: getNumber(retryObj, "initial_delay", 1.0),
        maxDelaySec: getNumber(retryObj, "max_delay", 60.0),
        exponentialBase: getNumber(retryObj, "exponential_base", 2.0)
      },
      agent: {
        maxSteps: getNumber(data, "max_steps", 50),
        tokenLimit: getNumber(data, "token_limit", 80000),
        workspaceDir: getString(data, "workspace_dir", "./workspace"),
        systemPromptPath: getString(data, "system_prompt_path", "system_prompt.md")
      },
      tools: {
        enableFileTools: getBool(toolsObj, "enable_file_tools", true),
        enableBash: getBool(toolsObj, "enable_bash", true),
        enableNote: getBool(toolsObj, "enable_note", true),
        enableSkills: getBool(toolsObj, "enable_skills", true),
        skillsDir: getString(toolsObj, "skills_dir", "./skills"),
        enableMcp: getBool(toolsObj, "enable_mcp", true),
        mcpConfigPath: getString(toolsObj, "mcp_config_path", "mcp.json")
      }
    };
  }

  /**
   * 读取系统提示词：
   * - 如果是相对路径：相对于 config.yaml 所在目录解析（与 Python 版一致）
   * - 如果找不到，返回一个兜底提示词
   */
  static async loadSystemPrompt(config: AppConfig): Promise<string> {
    const p = config.agent.systemPromptPath;
    const promptPath = path.isAbsolute(p) ? p : path.resolve(config.configDirAbs, p);
    try {
      return await fs.readFile(promptPath, "utf-8");
    } catch {
      return "You are a helpful AI assistant.";
    }
  }
}`,
    },
    {
      id: 'agent-4',
      kind: 'snippet' as const,
      label: 'interactive/LineEditor.ts',
      language: 'typescript',
      content: `import { ansi } from "./ansi.js";
import { calculateDisplayWidth } from "../utils/displayWidth.js";

export type Completer = (prefix: string) => { completed: string; candidates: string[] } | null;

/**
 * 一个“最小可用”的交互式输入编辑器（尽量对齐 Python prompt_toolkit 的关键体验）
 *
 * 支持：
 * - Enter 提交
 * - Ctrl+J 插入换行（multi-line 输入）
 * - Ctrl+U 清空当前输入
 * - Ctrl+L 清屏
 * - ↑/↓ 历史
 * - Tab 自动补全（命令补全；候选多时会列出来）
 *
 * 教学取舍：
 * - 我们实现了“够用”的行编辑，不追求完全等价于 prompt_toolkit
 * - 不处理复杂的“自动换行/终端宽度折行”导致的光标定位问题
 */
export class LineEditor {
  private buf = "";
  private cursor = 0;
  private lastRenderLines = 0;

  private history: string[];
  private historyIndex = -1; // -1 表示“正在编辑新输入”
  private draft = "";

  constructor(
    private readonly stdin: any,
    private readonly stdout: any,
    private readonly prompt: string,
    history: string[],
    private readonly completer: Completer | null
  ) {
    this.history = history;
  }

  async read(): Promise<string> {
    this.buf = "";
    this.cursor = 0;
    this.lastRenderLines = 0;
    this.historyIndex = -1;
    this.draft = "";

    this.ensureRawMode(true);
    this.stdout.write(ansi.hideCursor());

    return await new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        const s = chunk.toString("utf-8");

        // 处理常见按键序列（在 raw 模式下收到的是字节流）
        if (s === "\\x03") {
          // Ctrl+C
          cleanup();
          reject(new Error("Interrupted"));
          return;
        }

        // Arrow keys: ESC [ A/B/C/D
        if (s.startsWith("\\x1b[")) {
          const code = s.slice(2);
          if (code.startsWith("A")) this.onHistoryUp();
          else if (code.startsWith("B")) this.onHistoryDown();
          else if (code.startsWith("C")) this.onRight();
          else if (code.startsWith("D")) this.onLeft();
          this.render();
          return;
        }

        // Enter: \\r
        if (s === "\\r") {
          const out = this.buf;
          this.stdout.write("\\n");
          cleanup();
          resolve(out);
          return;
        }

        // Ctrl+J: \\n（插入换行，不提交）
        if (s === "\\n") {
          this.insert("\\n");
          this.render();
          return;
        }

        // Tab: \\t
        if (s === "\\t") {
          this.onTab();
          this.render();
          return;
        }

        // Ctrl+U: 0x15
        if (s === "\\x15") {
          this.buf = "";
          this.cursor = 0;
          this.render();
          return;
        }

        // Ctrl+L: 0x0c
        if (s === "\\x0c") {
          this.stdout.write(ansi.clearScreen());
          this.lastRenderLines = 0;
          this.render();
          return;
        }

        // Backspace: 0x7f
        if (s === "\\x7f") {
          this.backspace();
          this.render();
          return;
        }

        // 普通可打印字符：直接插入
        // 注意：这里不做复杂的宽字符/组合字符处理，教学项目够用
        if (s.length) {
          this.insert(s);
          this.render();
        }
      };

      const cleanup = () => {
        this.stdin.off("data", onData);
        this.stdout.write(ansi.showCursor());
        this.ensureRawMode(false);
      };

      this.stdin.on("data", onData);
      this.render();
    });
  }

  private ensureRawMode(enabled: boolean): void {
    // 在 TTY 环境下才可用 raw mode
    try {
      if (typeof this.stdin.setRawMode === "function") this.stdin.setRawMode(enabled);
      this.stdin.resume?.();
    } catch {
      // ignore
    }
  }

  private insert(text: string): void {
    this.buf = this.buf.slice(0, this.cursor) + text + this.buf.slice(this.cursor);
    this.cursor += text.length;
  }

  private backspace(): void {
    if (this.cursor <= 0) return;
    this.buf = this.buf.slice(0, this.cursor - 1) + this.buf.slice(this.cursor);
    this.cursor -= 1;
  }

  private onLeft(): void {
    if (this.cursor > 0) this.cursor -= 1;
  }

  private onRight(): void {
    if (this.cursor < this.buf.length) this.cursor += 1;
  }

  private onHistoryUp(): void {
    if (!this.history.length) return;
    if (this.historyIndex === -1) {
      this.draft = this.buf;
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex -= 1;
    }
    this.buf = unescapeHistory(this.history[this.historyIndex]!);
    this.cursor = this.buf.length;
  }

  private onHistoryDown(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.buf = unescapeHistory(this.history[this.historyIndex]!);
      this.cursor = this.buf.length;
      return;
    }
    // 回到草稿
    this.historyIndex = -1;
    this.buf = this.draft;
    this.cursor = this.buf.length;
  }

  private onTab(): void {
    if (!this.completer) return;

    const lastLine = this.buf.split("\\n").pop() ?? "";
    const prefix = lastLine.trimStart();
    const res = this.completer(prefix);
    if (!res) return;

    if (res.candidates.length > 1) {
      // 候选多：打印候选列表，再重绘输入框
      this.stdout.write("\\n" + res.candidates.join("  ") + "\\n");
      this.lastRenderLines = 0;
    }

    // 用 completed 覆盖当前行（只处理“最后一行”的补全）
    const lines = this.buf.split("\\n");
    lines[lines.length - 1] = replaceLastLine(lines[lines.length - 1]!, prefix, res.completed);
    this.buf = lines.join("\\n");
    this.cursor = this.buf.length;
  }

  private render(): void {
    // 清除上一次渲染占用的行
    if (this.lastRenderLines > 0) {
      this.stdout.write(ansi.cursorUp(this.lastRenderLines - 1));
      for (let i = 0; i < this.lastRenderLines; i++) {
        this.stdout.write(ansi.clearLine() + ansi.cursorToCol(1));
        if (i < this.lastRenderLines - 1) this.stdout.write("\\n");
      }
      this.stdout.write(ansi.cursorUp(this.lastRenderLines - 1));
    }

    const lines = this.buf.split("\\n");
    const rendered: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const p = i === 0 ? this.prompt : "... ";
      rendered.push(p + lines[i]);
    }

    const out = rendered.join("\\n");
    this.stdout.write(out);

    // 光标定位：只保证“粗略正确”（不处理折行）
    const { row, col1 } = this.cursorPosition();
    const totalRows = rendered.length;
    const up = totalRows - 1 - row;
    if (up > 0) this.stdout.write(ansi.cursorUp(up));
    this.stdout.write(ansi.cursorToCol(col1));

    this.lastRenderLines = rendered.length;
  }

  private cursorPosition(): { row: number; col1: number } {
    const before = this.buf.slice(0, this.cursor);
    const rows = before.split("\\n");
    const row = rows.length - 1;
    const lineText = rows[row] ?? "";
    const promptWidth = row === 0 ? calculateDisplayWidth(this.prompt) : calculateDisplayWidth("... ");
    const col1 = promptWidth + calculateDisplayWidth(lineText) + 1; // 1-based
    return { row, col1 };
  }
}

function replaceLastLine(fullLine: string, trimmedPrefix: string, completed: string): string {
  // fullLine 可能有左侧空格；trimmedPrefix 是 trimStart 后的 prefix
  const leading = fullLine.slice(0, fullLine.length - fullLine.trimStart().length);
  if (!trimmedPrefix) return leading + completed;
  if (fullLine.trimStart().startsWith(trimmedPrefix)) {
    return leading + completed + fullLine.trimStart().slice(trimmedPrefix.length);
  }
  return leading + completed;
}

function unescapeHistory(line: string): string {
  // appendHistory 会把换行写成 \\n
  return line.replace(/\\\\n/g, "\\n");
}`,
    },
    {
      id: 'agent-5',
      kind: 'snippet' as const,
      label: 'interactive/ansi.ts',
      language: 'typescript',
      content: `/**
 * ANSI escape helpers（教学用最小集合）
 *
 * 说明：
 * - 终端里很多“交互体验”（清屏、移动光标、清行）都靠 ANSI escape code
 * - Windows 新版终端一般支持；老环境可能不支持（教学项目先假定支持）
 */

export const ansi = {
  clearScreen: () => "\\x1b[2J\\x1b[H",
  clearLine: () => "\\x1b[2K",
  cursorUp: (n: number) => (n > 0 ? \`\\x1b[\${n}A\` : ""),
  cursorDown: (n: number) => (n > 0 ? \`\\x1b[\${n}B\` : ""),
  cursorToCol: (col1: number) => \`\\x1b[\${Math.max(1, col1)}G\`,
  hideCursor: () => "\\x1b[?25l",
  showCursor: () => "\\x1b[?25h"
};`,
    },
    {
      id: 'agent-6',
      kind: 'snippet' as const,
      label: 'interactive/history.ts',
      language: 'typescript',
      content: `import fs from "node:fs/promises";
import path from "node:path";
import { getHomeDir } from "../utils/homeDir.js";

/**
 * 输入历史（对齐 Python 版 prompt_toolkit FileHistory）
 *
 * Python 版会把历史写到一个文件，下次启动还能 ↑/↓ 找回。
 * 这里我们实现一个简化版本：
 * - 文件位置：~/.mini-agent/history.txt
 * - 每次用户“提交”一条输入，就 append 一行
 * - 启动时加载最近 N 条进入内存
 */

export function defaultHistoryFile(): string {
  return path.resolve(getHomeDir(), ".mini-agent", "history.txt");
}

export async function loadHistory(fileAbs: string, limit = 200): Promise<string[]> {
  try {
    const raw = await fs.readFile(fileAbs, "utf-8");
    const lines = raw.split(/\\r?\\n/).filter((l) => l.trim().length > 0);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

export async function appendHistory(fileAbs: string, line: string): Promise<void> {
  const dir = path.dirname(fileAbs);
  await fs.mkdir(dir, { recursive: true });
  await fs.appendFile(fileAbs, line.replace(/\\r?\\n/g, "\\\\n") + "\\n", "utf-8");
}`,
    },
    {
      id: 'agent-7',
      kind: 'snippet' as const,
      label: 'llm/LLMClient.ts',
      language: 'typescript',
      content: `import type { RetryConfig } from "../config.js";
import type { JsonObject, LLMProvider, LLMResponse, Message } from "../schema.js";
import type { LLMClientBase } from "./base.js";
import { AnthropicClient } from "./anthropicClient.js";
import { OpenAIClient } from "./openaiClient.js";

/**
 * 统一的 LLM Client 包装器（与 Python 版 LLMClient 的职责一致）。
 *
 * 设计目标：
 * - 上层 Agent 不关心“你是 Anthropic 协议还是 OpenAI 协议”
 * - 只关心：messages + tools -> response（包含 tool_calls / thinking / usage）
 *
 * 与 Python 版保持一致的行为：
 * - provider = anthropic: 自动在 api_base 末尾拼上 /anthropic
 * - provider = openai:    自动在 api_base 末尾拼上 /v1
 */
export class LLMClient implements LLMClientBase {
  private readonly impl: LLMClientBase;
  readonly apiBase: string;
  readonly provider: LLMProvider;

  constructor(opts: {
    apiKey: string;
    provider: LLMProvider;
    apiBase: string;
    model: string;
    retry: RetryConfig;
  }) {
    this.provider = opts.provider;

    // 兼容用户把 /anthropic 写进 api_base 的情况（Python 版也做了这个处理）
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
      id: 'agent-8',
      kind: 'snippet' as const,
      label: 'llm/anthropicClient.ts',
      language: 'typescript',
      content: `import type { RetryConfig } from "../config.js";
import { asyncRetry } from "../retry.js";
import type { JsonObject, LLMResponse, Message, ToolCall, TokenUsage } from "../schema.js";
import type { LLMClientBase } from "./base.js";

/**
 * Anthropic 协议（兼容端点）HTTP 客户端。
 *
 * 与 Python 版保持一致：
 * - 使用 /messages 接口
 * - 支持 thinking block
 * - 支持 tool_use / tool_result
 *
 * 备注：
 * - 这里不引入官方 SDK，直接用 fetch 实现，便于 TypeScript 教学阅读。
 * - 不同兼容厂商对 header 的要求可能略有差异；我们尽量同时兼容：
 *   - Anthropic 官方：x-api-key + anthropic-version
 *   - 一些兼容端点：Authorization: Bearer
 */
export class AnthropicClient implements LLMClientBase {
  constructor(
    private readonly apiKey: string,
    private readonly apiBase: string,
    private readonly model: string,
    private readonly retry: RetryConfig
  ) {}

  async generate(messages: Message[], tools?: JsonObject[]): Promise<LLMResponse> {
    return asyncRetry(this.retry, async () => {
      const { system, apiMessages } = this.convertMessages(messages);

      const body: JsonObject = {
        model: this.model,
        max_tokens: 16384,
        messages: apiMessages
      };
      if (system) body.system = system;
      if (tools?.length) body.tools = tools;

      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01"
      };
      // 有些 Anthropic 兼容端点要求 Authorization: Bearer；官方 API 使用 x-api-key。
      if (!isAnthropicOfficial(this.apiBase)) headers.authorization = \`Bearer \${this.apiKey}\`;

      const resp = await fetch(\`\${this.apiBase.replace(/\\/$/, "")}/v1/messages\`, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });

      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(\`Anthropic API error: HTTP \${resp.status}\\n\${text}\`);
      }

      const data = JSON.parse(text) as any;
      return this.parseResponse(data);
    });
  }

  /**
   * 把内部 Message 结构转换为 Anthropic 协议所需的 messages。
   *
   * 关键点（与 Python 版一致）：
   * - system message 单独放在 system 字段
   * - assistant 若包含 thinking/tool_calls，需要把内容拆成 content blocks
   * - tool 结果要用 user role + tool_result block 回传给模型
   */
  private convertMessages(messages: Message[]): { system: string | null; apiMessages: any[] } {
    let system: string | null = null;
    const apiMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        system = msg.content;
        continue;
      }

      if (msg.role === "user") {
        apiMessages.push({ role: "user", content: msg.content });
        continue;
      }

      if (msg.role === "assistant") {
        const hasBlocks = Boolean(msg.thinking) || Boolean(msg.toolCalls?.length);
        if (!hasBlocks) {
          apiMessages.push({ role: "assistant", content: msg.content });
          continue;
        }

        const blocks: any[] = [];
        if (msg.thinking) blocks.push({ type: "thinking", thinking: msg.thinking });
        if (msg.content) blocks.push({ type: "text", text: msg.content });
        if (msg.toolCalls?.length) {
          for (const tc of msg.toolCalls) {
            blocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: tc.function.arguments
            });
          }
        }
        apiMessages.push({ role: "assistant", content: blocks });
        continue;
      }

      if (msg.role === "tool") {
        apiMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.toolCallId,
              content: msg.content
            }
          ]
        });
      }
    }

    return { system, apiMessages };
  }

  private parseResponse(data: any): LLMResponse {
    // Anthropic 返回：{ content: [{type,text/thinking/...}], stop_reason, usage: {input_tokens, output_tokens} }
    let content = "";
    let thinking = "";
    const toolCalls: ToolCall[] = [];

    for (const block of data.content ?? []) {
      if (block.type === "text") content += block.text ?? "";
      if (block.type === "thinking") thinking += block.thinking ?? "";
      if (block.type === "tool_use") {
        toolCalls.push({
          id: String(block.id),
          type: "function",
          function: { name: String(block.name), arguments: (block.input ?? {}) as JsonObject }
        });
      }
    }

    let usage: TokenUsage | undefined;
    if (data.usage) {
      const promptTokens = Number(data.usage.input_tokens ?? 0) || 0;
      const completionTokens = Number(data.usage.output_tokens ?? 0) || 0;
      usage = { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
    }

    return {
      content,
      thinking: thinking || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      finishReason: String(data.stop_reason ?? "stop"),
      usage
    };
  }
}

function isAnthropicOfficial(apiBase: string): boolean {
  try {
    const host = new URL(apiBase).hostname.toLowerCase();
    return host.endsWith("anthropic.com");
  } catch {
    return apiBase.toLowerCase().includes("anthropic.com");
  }
}`,
    },
    {
      id: 'agent-9',
      kind: 'snippet' as const,
      label: 'llm/base.ts',
      language: 'typescript',
      content: `import type { JsonObject, LLMResponse, Message } from "../schema.js";

export interface LLMClientBase {
  /**
   * 生成一次模型响应（可能包含 tool_calls）。
   *
   * 约定：
   * - messages 是完整的对话历史（含 system / tool）
   * - tools 是“当前可用工具集合”的 schema（用于模型决定是否调用工具）
   */
  generate(messages: Message[], tools?: JsonObject[]): Promise<LLMResponse>;
}`,
    },
    {
      id: 'agent-10',
      kind: 'snippet' as const,
      label: 'llm/openaiClient.ts',
      language: 'typescript',
      content: `import type { RetryConfig } from "../config.js";
import { asyncRetry } from "../retry.js";
import type { JsonObject, LLMResponse, Message, ToolCall, TokenUsage } from "../schema.js";
import type { LLMClientBase } from "./base.js";

/**
 * OpenAI 协议（兼容端点）HTTP 客户端。
 *
 * 与 Python 版保持一致：
 * - 使用 /chat/completions 接口
 * - 支持 tool calling（tools + tool_calls）
 * - 支持 reasoning_split（把“思考/推理”拆出来）
 *
 * 关键实现点：
 * - OpenAI 兼容端点通常要求：Authorization: Bearer
 * - tool_calls.arguments 是 JSON 字符串，需要 JSON.parse
 * - 一些兼容端点（如 MiniMax）会返回 reasoning_details，并要求你把它在下一轮原样带回（保持 interleaved thinking 连贯）
 */
export class OpenAIClient implements LLMClientBase {
  private readonly enableReasoningSplit: boolean;

  constructor(
    private readonly apiKey: string,
    private readonly apiBase: string,
    private readonly model: string,
    private readonly retry: RetryConfig
  ) {
    this.enableReasoningSplit = shouldEnableReasoningSplit(apiBase);
  }

  async generate(messages: Message[], tools?: JsonObject[]): Promise<LLMResponse> {
    return asyncRetry(this.retry, async () => {
      const apiMessages = this.convertMessages(messages);

      const body: JsonObject = {
        model: this.model,
        messages: apiMessages
      };
      // MiniMax 的 OpenAI 兼容端点用 extra_body 开启推理拆分（与 Python 版一致）
      if (this.enableReasoningSplit) body.extra_body = { reasoning_split: true };
      if (tools?.length) body.tools = tools;

      const resp = await fetch(\`\${this.apiBase.replace(/\\/$/, "")}/chat/completions\`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: \`Bearer \${this.apiKey}\`
        },
        body: JSON.stringify(body)
      });

      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(\`OpenAI API error: HTTP \${resp.status}\\n\${text}\`);
      }

      const data = JSON.parse(text) as any;
      return this.parseResponse(data);
    });
  }

  private convertMessages(messages: Message[]): any[] {
    const apiMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        apiMessages.push({ role: "system", content: msg.content });
        continue;
      }

      if (msg.role === "user") {
        apiMessages.push({ role: "user", content: msg.content });
        continue;
      }

      if (msg.role === "assistant") {
        const m: any = { role: "assistant" };
        if (msg.content) m.content = msg.content;

        if (msg.toolCalls?.length) {
          m.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.function.name,
              arguments: JSON.stringify(tc.function.arguments ?? {})
            }
          }));
        }

        // 保持 interleaved thinking：把 reasoning_details 原样回传（与 Python 版一致）
        if (this.enableReasoningSplit && msg.thinking) {
          m.reasoning_details = [{ text: msg.thinking }];
        }

        apiMessages.push(m);
        continue;
      }

      if (msg.role === "tool") {
        apiMessages.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content
        });
      }
    }

    return apiMessages;
  }

  private parseResponse(data: any): LLMResponse {
    const choice = data.choices?.[0];
    const message = choice?.message ?? {};

    const content = message.content ?? "";

    // reasoning_details：数组形式
    let thinking = "";
    if (Array.isArray(message.reasoning_details)) {
      for (const d of message.reasoning_details) {
        if (d && typeof d.text === "string") thinking += d.text;
      }
    }

    const toolCalls: ToolCall[] = [];
    if (Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        const argsText = tc?.function?.arguments;
        let args: JsonObject = {};
        if (typeof argsText === "string" && argsText.trim()) {
          try {
            args = JSON.parse(argsText);
          } catch {
            // 兼容：如果服务端返回了非 JSON 字符串，把原文保存在参数中，便于模型自我修复。
            args = { _unparsed_arguments: argsText };
          }
        }

        toolCalls.push({
          id: String(tc.id),
          type: "function",
          function: {
            name: String(tc.function?.name ?? ""),
            arguments: args
          }
        });
      }
    }

    let usage: TokenUsage | undefined;
    if (data.usage) {
      usage = {
        promptTokens: Number(data.usage.prompt_tokens ?? 0) || 0,
        completionTokens: Number(data.usage.completion_tokens ?? 0) || 0,
        totalTokens: Number(data.usage.total_tokens ?? 0) || 0
      };
    }

    return {
      content,
      thinking: thinking || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      finishReason: String(choice?.finish_reason ?? "stop"),
      usage
    };
  }
}

function shouldEnableReasoningSplit(apiBase: string): boolean {
  try {
    const host = new URL(apiBase).hostname.toLowerCase();
    return host.includes("minimax");
  } catch {
    return apiBase.toLowerCase().includes("minimax");
  }
}`,
    },
    {
      id: 'agent-11',
      kind: 'snippet' as const,
      label: 'logger.ts',
      language: 'typescript',
      content: `import fs from "node:fs/promises";
import path from "node:path";
import type { JsonObject, Message, ToolCall } from "./schema.js";
import { getHomeDir } from "./utils/homeDir.js";

/**
 * AgentLogger（尽量对齐 Python 版 mini_agent/logger.py）
 *
 * 设计目标：
 * - “每次 run”生成一个独立日志文件
 * - 记录：LLM 请求 / LLM 响应 / 工具执行结果
 * - 让教学读者可以直接打开日志复盘：模型何时调用了什么工具、工具返回了什么、模型下一轮怎么继续
 *
 * 与 Python 版保持一致的点：
 * - 日志目录：~/.mini-agent/log/
 * - 文件名：agent_run_YYYYMMDD_HHMMSS.log
 * - 文本日志格式：带分隔线与递增 index
 */
export class AgentLogger {
  private logDirAbs = "";
  private logFileAbs = "";
  private logIndex = 0;

  constructor() {
    this.logDirAbs = path.resolve(getHomeDir(), ".mini-agent", "log");
  }

  async startNewRun(): Promise<void> {
    await fs.mkdir(this.logDirAbs, { recursive: true });
    const ts = formatTimestampForFilename(new Date());
    this.logFileAbs = path.resolve(this.logDirAbs, \`agent_run_\${ts}.log\`);
    this.logIndex = 0;

    const header =
      "=".repeat(80) +
      "\\n" +
      \`Agent Run Log - \${formatTimestampForHuman(new Date())}\\n\` +
      "=".repeat(80) +
      "\\n\\n";
    await fs.writeFile(this.logFileAbs, header, "utf-8");
  }

  getLogFilePath(): string {
    return this.logFileAbs;
  }

  async logRequest(opts: { messages: Message[]; toolNames: string[] }): Promise<void> {
    this.logIndex += 1;

    // 为了尽量对齐 Python 版日志：把 messages 结构完整写入（包含 thinking/toolCalls/toolCallId 等）
    const requestData: JsonObject = {
      messages: opts.messages.map((m) => ({
        role: m.role,
        content: m.content,
        thinking: m.thinking ?? null,
        tool_calls: (m.toolCalls ?? null) as any,
        tool_call_id: m.toolCallId ?? null,
        name: m.name ?? null
      })),
      tools: opts.toolNames
    };

    const content = "LLM Request:\\n\\n" + JSON.stringify(requestData, null, 2);
    await this.writeLog("REQUEST", content);
  }

  async logResponse(opts: {
    content: string;
    thinking?: string;
    toolCalls?: ToolCall[];
    finishReason?: string;
    usage?: JsonObject;
  }): Promise<void> {
    this.logIndex += 1;

    const responseData: JsonObject = {
      content: opts.content,
      thinking: opts.thinking ?? null,
      tool_calls: (opts.toolCalls ?? null) as any,
      finish_reason: opts.finishReason ?? null,
      usage: opts.usage ?? null
    };

    const content = "LLM Response:\\n\\n" + JSON.stringify(responseData, null, 2);
    await this.writeLog("RESPONSE", content);
  }

  async logToolResult(opts: {
    toolName: string;
    arguments: JsonObject;
    success: boolean;
    resultContent?: string;
    resultError?: string;
  }): Promise<void> {
    this.logIndex += 1;

    const toolData: JsonObject = {
      tool_name: opts.toolName,
      arguments: opts.arguments,
      success: opts.success,
      result: opts.success ? (opts.resultContent ?? "") : null,
      error: opts.success ? null : (opts.resultError ?? "Tool execution failed")
    };

    const content = "Tool Execution:\\n\\n" + JSON.stringify(toolData, null, 2);
    await this.writeLog("TOOL_RESULT", content);
  }

  private async writeLog(kind: string, content: string): Promise<void> {
    if (!this.logFileAbs) return;

    const entry =
      "\\n" +
      "-".repeat(80) +
      "\\n" +
      \`[\${this.logIndex}] \${kind}\\n\` +
      \`Timestamp: \${formatTimestampForHuman(new Date())}\\n\` +
      "-".repeat(80) +
      "\\n" +
      content +
      "\\n";

    await fs.appendFile(this.logFileAbs, entry, "utf-8");
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTimestampForFilename(d: Date): string {
  // YYYYMMDD_HHMMSS（用于文件名）
  return (
    String(d.getFullYear()) +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    "_" +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    pad2(d.getSeconds())
  );
}

function formatTimestampForHuman(d: Date): string {
  // YYYY-MM-DD HH:mm:ss.SSS（用于日志展示）
  return (
    String(d.getFullYear()) +
    "-" +
    pad2(d.getMonth() + 1) +
    "-" +
    pad2(d.getDate()) +
    " " +
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes()) +
    ":" +
    pad2(d.getSeconds()) +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}`,
    },
    {
      id: 'agent-12',
      kind: 'snippet' as const,
      label: 'retry.ts',
      language: 'typescript',
      content: `import type { RetryConfig } from "./config.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 一个简单但实用的异步重试器（与 Python 版的 RetryConfig 语义尽量保持一致）。
 *
 * 典型用法：
 * - 网络请求失败（超时、5xx、临时网络波动）
 * - 需要指数退避（exponential backoff）
 *
 * 说明：
 * - 教学项目里，我们把“什么错误值得重试”交给调用方判断：只要 throw，就会走重试逻辑。
 * - 真实项目建议：区分 4xx/5xx、超时、连接错误，并记录可观测性数据。
 */
export async function asyncRetry<T>(cfg: RetryConfig, fn: (attempt: number) => Promise<T>): Promise<T> {
  if (!cfg.enabled) return fn(0);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt >= cfg.maxRetries) break;

      // 退避：initial * base^attempt，封顶 maxDelay
      const delaySec = Math.min(cfg.maxDelaySec, cfg.initialDelaySec * Math.pow(cfg.exponentialBase, attempt));

      // 轻微 jitter，避免“惊群”
      const jitter = 0.2 + Math.random() * 0.2; // 0.2~0.4
      await sleep(delaySec * 1000 * jitter);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}`,
    },
    {
      id: 'agent-13',
      kind: 'snippet' as const,
      label: 'runtime/init.ts',
      language: 'typescript',
      content: `import path from "node:path";
import fs from "node:fs/promises";

import { Agent } from "../agent/Agent.js";
import { ConfigLoader, type AppConfig } from "../config.js";
import { LLMClient } from "../llm/LLMClient.js";
import { BashKillTool, BashOutputTool, BashTool, cleanupBashBackgroundShells } from "../tools/bashTool.js";
import { ReadFileTool, WriteFileTool, EditFileTool } from "../tools/fileTools.js";
import { defaultMemoryFile, RecallNotesTool, RecordNoteTool } from "../tools/noteTools.js";
import { cleanupMcpConnections, loadMcpTools, resolveMcpConfigPath } from "../tools/mcpLoader.js";
import { SkillLoader } from "../tools/skills/skillLoader.js";
import { GetSkillTool } from "../tools/skills/skillTool.js";
import type { Tool } from "../tools/Tool.js";

/**
 * 把 CLI 与 ACP 复用的“初始化逻辑”抽出来：
 * - 加载配置
 * - 初始化基础工具（bash/skills/mcp）
 * - 根据 workspace 追加 workspace 工具（file/note）
 * - 构造 system prompt（注入 skills metadata + workspace info 由 Agent 做）
 * - 构造 Agent 实例
 *
 * 这样做的好处：
 * - 与 Python 版一致：CLI 与 ACP server 共用同一套 Agent runtime
 * - 教学更清晰：读者能看到“工程化初始化”应该放在哪一层
 */

export async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

export async function resolveSkillsDir(config: AppConfig): Promise<string> {
  const skillsDir = config.tools.skillsDir;
  if (path.isAbsolute(skillsDir)) return skillsDir;

  // 与 Python 版类似：优先找开发目录，再找项目默认位置
  const candidates = [
    // 1) 相对 config.yaml 所在目录（与 Python 版“同目录放置 config/skills”习惯一致）
    path.resolve(config.configDirAbs, skillsDir),
    path.resolve(process.cwd(), skillsDir),
    path.resolve(process.cwd(), "mini-agent-typescript", skillsDir),
    path.resolve(process.cwd(), "mini-agent-typescript", "skills")
  ];

    for (const c of candidates) {
      try {
        const s = await fs.stat(c);
        if (s.isDirectory()) return c;
      } catch {
      // 忽略
      }
    }

  return path.resolve(process.cwd(), "mini-agent-typescript", "skills");
}

export async function initializeBaseTools(config: AppConfig): Promise<{
  tools: Tool[];
  skillLoader: SkillLoader | null;
}> {
  const tools: Tool[] = [];
  let skillLoader: SkillLoader | null = null;

  // 1) Bash 工具
  if (config.tools.enableBash) {
    tools.push(new BashTool(), new BashOutputTool(), new BashKillTool());
  }

  // 2) Skills（渐进式加载 / Progressive Disclosure）
  if (config.tools.enableSkills) {
    const skillsDirAbs = await resolveSkillsDir(config);
    skillLoader = new SkillLoader(skillsDirAbs);
    await skillLoader.discoverSkills();
    tools.push(new GetSkillTool(skillLoader));
  }

  // 3) MCP 工具
  if (config.tools.enableMcp) {
    try {
      const mcpPathAbs = resolveMcpConfigPath(config.configDirAbs, config.tools.mcpConfigPath);
      const mcpTools = await loadMcpTools(mcpPathAbs);
      tools.push(...mcpTools);
    } catch {
      // 教学项目：MCP 失败不阻塞主流程（与 Python 版 cli.py 的容错策略一致）
    }
  }

  return { tools, skillLoader };
}

export function addWorkspaceTools(tools: Tool[], config: AppConfig, workspaceDirAbs: string): void {
  // 文件工具：限制在 workspace 内
  if (config.tools.enableFileTools) {
    tools.push(new ReadFileTool(workspaceDirAbs), new WriteFileTool(workspaceDirAbs), new EditFileTool(workspaceDirAbs));
  }

  // Note 工具：持久化记忆
  if (config.tools.enableNote) {
    const mem = defaultMemoryFile(workspaceDirAbs);
    tools.push(new RecordNoteTool(mem), new RecallNotesTool(mem));
  }
}

export async function buildSystemPrompt(config: AppConfig, skillLoader: SkillLoader | null): Promise<string> {
  let systemPrompt = await ConfigLoader.loadSystemPrompt(config);
  if (skillLoader) {
    const meta = skillLoader.getSkillsMetadataPrompt();
    if (meta) systemPrompt = \`\${systemPrompt.trim()}\\n\\n\${meta}\`;
  }
  return systemPrompt;
}

export function createLLMClient(config: AppConfig): LLMClient {
  return new LLMClient({
    apiKey: config.llm.apiKey,
    apiBase: config.llm.apiBase,
    model: config.llm.model,
    provider: config.llm.provider,
    retry: config.retry
  });
}

export async function createAgentRuntime(opts: {
  config: AppConfig;
  workspaceDirAbs: string;
  baseTools: Tool[];
  skillLoader: SkillLoader | null;
  llm?: LLMClient;
  systemPrompt?: string;
  verbose?: boolean;
}): Promise<Agent> {
  const systemPrompt = opts.systemPrompt ?? (await buildSystemPrompt(opts.config, opts.skillLoader));
  const llm = opts.llm ?? createLLMClient(opts.config);

  const tools = [...opts.baseTools];
  addWorkspaceTools(tools, opts.config, opts.workspaceDirAbs);

  return new Agent({
    llm,
    systemPrompt,
    tools,
    maxSteps: opts.config.agent.maxSteps,
    tokenLimit: opts.config.agent.tokenLimit,
    workspaceDir: opts.workspaceDirAbs,
    verbose: opts.verbose ?? true
  });
}

export async function loadConfig(): Promise<AppConfig> {
  return ConfigLoader.load();
}

export async function cleanup(): Promise<void> {
  await cleanupMcpConnections();
  await cleanupBashBackgroundShells();
}`,
    },
    {
      id: 'agent-14',
      kind: 'snippet' as const,
      label: 'schema.ts',
      language: 'typescript',
      content: `export type Role = "system" | "user" | "assistant" | "tool";

// 说明：
// - 这里的 JsonValue 用于“工具参数/JSON Schema/LLM arguments”等场景
// - 允许 readonly array 是为了兼容 \`as const\` 产生的只读数组（例如 JSON Schema 的 required: ["x"] as const）
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
  // 可选：用于“思考/推理”分离（不同厂商字段不一样，内部统一存起来）
  thinking?: string;
  toolCalls?: ToolCall[];

  // tool message 需要关联 tool_call_id
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
      id: 'agent-15',
      kind: 'snippet' as const,
      label: 'tools/Tool.ts',
      language: 'typescript',
      content: `import type { JsonObject } from "../schema.js";

export interface ToolResult {
  success: boolean;
  content: string;
  error?: string;
}

/**
 * Tool 的参数使用 JSON Schema（简化版）来描述，便于对接 OpenAI/Anthropic 风格的 tool calling。
 * 教学项目里我们不做完整校验；真实项目建议引入 zod / ajv。
 */
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
    return {
      name: this.name,
      description: this.description,
      input_schema: this.parameters
    };
  }

  toOpenAISchema(): JsonObject {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    };
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }
}`,
    },
    {
      id: 'agent-16',
      kind: 'snippet' as const,
      label: 'tools/bashTool.ts',
      language: 'typescript',
      content: `import { exec, spawn } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { JsonObject } from "../schema.js";
import { BaseTool, type ToolResult } from "./Tool.js";

const execAsync = promisify(exec);

const MAX_OUTPUT_LINES = 20_000;

function asString(v: unknown, name: string): string {
  if (typeof v !== "string") throw new Error(\`Expected '\${name}' to be string\`);
  return v;
}

function asNumberOpt(v: unknown, name: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(\`Expected '\${name}' to be number\`);
  return v;
}

function asBoolOpt(v: unknown, name: string): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new Error(\`Expected '\${name}' to be boolean\`);
  return v;
}

type BackgroundShell = {
  bashId: string;
  command: string;
  startTime: number;
  status: "running" | "completed" | "failed" | "terminated";
  exitCode: number | null;
  outputLines: string[];
  lastReadIndex: number;
  droppedLines: number;
  proc: ReturnType<typeof spawn>;
};

/**
 * BackgroundShellManager（与 Python 版一致）：
 * - 管理所有后台进程（run_in_background=true）
 * - 缓存输出（按行），并支持增量读取（bash_output）
 * - 支持终止（bash_kill）
 *
 * 注意：
 * - 教学项目中我们把 stdout + stderr 合并（stderr -> stdout），与 Python 版保持一致。
 * - MCP / LLM 等长连接工具通常需要后台运行，这个能力是 Agent 工程里很常见的一块。
 */
class BackgroundShellManager {
  private static shells = new Map<string, BackgroundShell>();

  static add(shell: BackgroundShell): void {
    this.shells.set(shell.bashId, shell);
  }

  static get(id: string): BackgroundShell | undefined {
    return this.shells.get(id);
  }

  static listIds(): string[] {
    return [...this.shells.keys()];
  }

  static remove(id: string): void {
    this.shells.delete(id);
  }
}

function genId(): string {
  // 生成一个短 ID，方便用户手动粘贴（与 Python 版 uuid[:8] 的体验类似）
  return Math.random().toString(16).slice(2, 10);
}

function splitLines(chunk: Uint8Array): string[] {
  // 这里用 utf-8 解码；Windows 下 PowerShell 可能输出非 utf8，但教学项目先简化
  const text = Buffer.from(chunk).toString("utf-8");
  return text.split(/\\r?\\n/).filter((l) => l.length);
}

function pushOutputLines(shell: BackgroundShell, lines: string[]): void {
  if (!lines.length) return;
  shell.outputLines.push(...lines);

  const overflow = shell.outputLines.length - MAX_OUTPUT_LINES;
  if (overflow <= 0) return;

  shell.outputLines.splice(0, overflow);
  shell.lastReadIndex = Math.max(0, shell.lastReadIndex - overflow);
  shell.droppedLines += overflow;
}

function truncationNote(shell: BackgroundShell): string {
  return shell.droppedLines > 0 ? \`[output truncated: dropped \${shell.droppedLines} line(s)]\\n\` : "";
}

async function terminateShell(shell: BackgroundShell): Promise<void> {
  try {
    shell.proc.kill("SIGTERM");
  } catch {
    // 忽略
  }

  // 某些子进程（尤其是 Windows）可能不会很快触发 close 事件。
  await new Promise((r) => setTimeout(r, 500));
  if (shell.exitCode === null) {
    try {
      shell.proc.kill("SIGKILL");
    } catch {
      // 忽略
    }
  }

  shell.status = "terminated";
  BackgroundShellManager.remove(shell.bashId);
}

export async function cleanupBashBackgroundShells(): Promise<void> {
  const ids = BackgroundShellManager.listIds();
  for (const id of ids) {
    const shell = BackgroundShellManager.get(id);
    if (!shell) continue;
    await terminateShell(shell);
  }
}

function formatBashOutput(opts: {
  stdout: string;
  stderr: string;
  exitCode: number;
  bashId?: string;
}): string {
  let out = "";
  if (opts.stdout) out += opts.stdout;
  if (opts.stderr) out += \`\\n[stderr]:\\n\${opts.stderr}\`;
  if (opts.bashId) out += \`\\n[bash_id]:\\n\${opts.bashId}\`;
  if (opts.exitCode) out += \`\\n[exit_code]:\\n\${opts.exitCode}\`;
  return out.trim() || "(no output)";
}

/**
 * bash 工具（与 Python 版 BashTool 对齐）
 *
 * 参数：
 * - command: string（必填）
 * - timeout: number（秒，默认 120，最大 600；仅前台执行时生效）
 * - run_in_background: boolean（默认 false）
 */
export class BashTool extends BaseTool {
  readonly name = "bash";
  readonly description =
    "执行终端命令（Windows=PowerShell；macOS/Linux=bash）。支持前台/后台运行。不要用它做文件读写（请用 read_file/write_file/edit_file）。";
  readonly parameters = {
    type: "object",
    properties: {
      command: { type: "string", description: "要执行的命令字符串" },
      timeout: { type: "number", description: "超时（秒，默认 120，最大 600；仅前台执行）" },
      run_in_background: { type: "boolean", description: "是否后台运行（适用于 server/长任务）" }
    },
    required: ["command"]
  } as const;

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const command = asString(args.command, "command");
      const timeoutSec = Math.min(Math.max(asNumberOpt(args.timeout, "timeout") ?? 120, 1), 600);
      const runInBackground = asBoolOpt(args.run_in_background, "run_in_background") ?? false;

      const isWindows = os.platform() === "win32";

      if (runInBackground) {
        const bashId = genId();

        // Windows：powershell -Command <cmd>；其它平台：bash -lc <cmd>
        const proc = isWindows
          ? spawn("powershell.exe", ["-NoProfile", "-Command", command], { stdio: ["ignore", "pipe", "pipe"] })
          : spawn("bash", ["-lc", command], { stdio: ["ignore", "pipe", "pipe"] });

        const shell: BackgroundShell = {
          bashId,
          command,
          startTime: Date.now(),
          status: "running",
          exitCode: null,
          outputLines: [],
          lastReadIndex: 0,
          droppedLines: 0,
          proc
        };

        // 合并 stdout/stderr 到一份 outputLines（与 Python 版一致）
        proc.stdout?.on("data", (chunk: Uint8Array) => pushOutputLines(shell, splitLines(chunk)));
        proc.stderr?.on("data", (chunk: Uint8Array) => pushOutputLines(shell, splitLines(chunk)));
        proc.on("close", (code: number | null) => {
          shell.exitCode = code;
          if (shell.status !== "terminated") shell.status = code === 0 ? "completed" : "failed";
        });

        BackgroundShellManager.add(shell);

        return {
          success: true,
          content: formatBashOutput({
            stdout: \`Background command started with ID: \${bashId}\\n\\nCommand: \${command}\\nBash ID: \${bashId}\`,
            stderr: "",
            exitCode: 0,
            bashId
          })
        };
      }

      // 前台执行：用 exec + timeout
      const wrapped = isWindows
        ? \`powershell -NoProfile -ExecutionPolicy Bypass -Command \${JSON.stringify(command)}\`
        : \`bash -lc \${JSON.stringify(command)}\`;

      const { stdout, stderr } = await execAsync(wrapped, {
        timeout: timeoutSec * 1000,
        maxBuffer: 20 * 1024 * 1024
      });

      return {
        success: true,
        content: formatBashOutput({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 })
      };
    } catch (e) {
      // Node 的 exec 在“非 0 退出码”时也会抛错；错误对象通常包含 code/stdout/stderr。
      const err = e as { message?: string; stdout?: string; stderr?: string; code?: number };
      const exitCode = typeof err.code === "number" ? err.code : -1;
      const exitInfo = err.message ? \`Command failed: \${err.message}\` : "Command failed";
      return {
        success: false,
        content: "",
        error: formatBashOutput({
          stdout: err.stdout ?? "",
          stderr: err.stderr ? \`\${exitInfo}\\n\${err.stderr}\` : exitInfo,
          exitCode
        })
      };
    }
  }
}

/**
 * bash_output 工具（与 Python 版 BashOutputTool 对齐）
 *
 * 读取某个后台 bash_id 的“增量输出”：
 * - 每次调用只返回上次调用之后的新行（避免反复把旧输出塞回上下文）
 * - 可选 filter_str（正则）做筛选；未匹配的行将“被消费掉”（与 Python 版一致）
 */
export class BashOutputTool extends BaseTool {
  readonly name = "bash_output";
  readonly description = "读取后台 bash 进程的增量输出（可选正则过滤）。";
  readonly parameters = {
    type: "object",
    properties: {
      bash_id: { type: "string", description: "后台进程 ID（bash run_in_background=true 时返回）" },
      filter_str: {
        type: "string",
        description: "可选：用于过滤输出行的正则。未匹配的行也会被消费，不会在后续再出现。"
      }
    },
    required: ["bash_id"]
  } as const;

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const bashId = asString(args.bash_id, "bash_id");
      const filterStr = args.filter_str ? asString(args.filter_str, "filter_str") : undefined;

      const shell = BackgroundShellManager.get(bashId);
      if (!shell) {
        return {
          success: false,
          content: "",
          error: \`Shell not found: \${bashId}. Available: \${BackgroundShellManager.listIds().join(", ") || "none"}\`
        };
      }

      let newLines = shell.outputLines.slice(shell.lastReadIndex);
      shell.lastReadIndex = shell.outputLines.length;

      if (filterStr) {
        try {
          const re = new RegExp(filterStr);
          newLines = newLines.filter((l) => re.test(l));
        } catch {
          // 正则不合法：按“不过滤”处理
        }
      }

      const stdout = truncationNote(shell) + newLines.join("\\n");
      return {
        success: true,
        content: formatBashOutput({
          stdout,
          stderr: "",
          exitCode: shell.exitCode ?? 0,
          bashId
        })
      };
    } catch (e) {
      return { success: false, content: "", error: \`Failed to get bash output: \${(e as Error).message}\` };
    }
  }
}

/**
 * bash_kill 工具（与 Python 版 BashKillTool 对齐）
 *
 * - 终止后台 bash 进程，并清理 manager 中的状态
 * - 返回终止前最后一段增量输出，避免信息丢失
 */
export class BashKillTool extends BaseTool {
  readonly name = "bash_kill";
  readonly description = "终止一个后台 bash 进程（通过 bash_id）。";
  readonly parameters = {
    type: "object",
    properties: {
      bash_id: { type: "string", description: "后台进程 ID（bash run_in_background=true 时返回）" }
    },
    required: ["bash_id"]
  } as const;

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const bashId = asString(args.bash_id, "bash_id");
      const shell = BackgroundShellManager.get(bashId);
      if (!shell) {
        return {
          success: false,
          content: "",
          error: \`Shell not found: \${bashId}. Available: \${BackgroundShellManager.listIds().join(", ") || "none"}\`
        };
      }

      // 取剩余输出（并消费）
      const remaining = shell.outputLines.slice(shell.lastReadIndex);
      shell.lastReadIndex = shell.outputLines.length;

      await terminateShell(shell);

      return {
        success: true,
        content: formatBashOutput({
          stdout: truncationNote(shell) + remaining.join("\\n"),
          stderr: "",
          exitCode: shell.exitCode ?? 0,
          bashId
        })
      };
    } catch (e) {
      return { success: false, content: "", error: \`Failed to terminate bash shell: \${(e as Error).message}\` };
    }
  }
}`,
    },
    {
      id: 'agent-17',
      kind: 'snippet' as const,
      label: 'tools/fileTools.ts',
      language: 'typescript',
      content: `import fs from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../schema.js";
import { resolveInWorkspace } from "../utils/workspacePath.js";
import { BaseTool, type ToolResult } from "./Tool.js";

/**
 * 文件工具（与 Python 版 mini_agent/tools/file_tools.py 对齐）
 *
 * 设计目标：
 * - Agent 读文件时：输出带行号，方便模型做“精确定位与引用”
 * - Agent 写文件时：明确“会覆盖”，避免隐式修改导致不可控
 * - Agent 编辑文件时：采用“精确字符串替换”，保证修改是确定性的（避免模型自己拼 patch）
 *
 * 安全边界（非常重要）：
 * - 所有相对路径都必须解析到 workspaceDir 内，禁止 \`../\` 路径逃逸
 *   （生产级实现还需要处理符号链接等边界，这里是教学简化版）
 */

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
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const n = startLineNo + i;
    out.push(\`\${String(n).padStart(6, " ")}|\${lines[i]}\`);
  }
  return out.join("\\n");
}

/**
 * 教学项目里的“输出截断”：
 * - Python 版用 tiktoken 按 token 截断（更准确）
 * - TS 版为了零依赖，按字符截断，并保留 head+tail（便于看到开头/结尾信息）
 */
const DEFAULT_MAX_CHARS = 200_000;
function truncateText(text: string, maxChars = DEFAULT_MAX_CHARS): string {
  if (text.length <= maxChars) return text;
  const head = text.slice(0, Math.floor(maxChars * 0.6));
  const tail = text.slice(-Math.floor(maxChars * 0.4));
  return \`\${head}\\n\\n... [Content truncated: \${text.length} chars -> \${maxChars} chars limit] ...\\n\\n\${tail}\`;
}

export class ReadFileTool extends BaseTool {
  readonly name = "read_file";
  readonly description =
    "读取文件内容（输出包含行号：LINE|CONTENT，1 起）。支持 offset/limit 用于大文件分块读取。";
  readonly parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（绝对或相对工作区）" },
      offset: { type: "number", description: "起始行号（1 起）" },
      limit: { type: "number", description: "读取行数" }
    },
    required: ["path"]
  } as const;

  constructor(private readonly workspaceDirAbs: string) {
    super();
  }

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const p = asString(args.path, "path");
      const offset = asNumberOpt(args.offset, "offset");
      const limit = asNumberOpt(args.limit, "limit");

      // 关键：把路径限制在 workspace 内
      const absPath = resolveInWorkspace(this.workspaceDirAbs, p);
      const raw = await fs.readFile(absPath, "utf-8");
      const lines = raw.split(/\\r?\\n/);

      // offset/limit（1 起）用于大文件分块读取，避免一次把整个文件塞进上下文
      const start = Math.max(0, (offset ? offset - 1 : 0) | 0);
      const end = Math.min(lines.length, limit ? start + (limit | 0) : lines.length);
      const selected = lines.slice(start, end);

      const content = truncateText(withLineNumbers(selected, start + 1));
      return { success: true, content };
    } catch (e) {
      return { success: false, content: "", error: (e as Error).message };
    }
  }
}

export class WriteFileTool extends BaseTool {
  readonly name = "write_file";
  readonly description = "写入文件（会完全覆盖）。对已有文件，建议先 read_file 再写入。";
  readonly parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（绝对或相对工作区）" },
      content: { type: "string", description: "要写入的完整内容" }
    },
    required: ["path", "content"]
  } as const;

  constructor(private readonly workspaceDirAbs: string) {
    super();
  }

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const p = asString(args.path, "path");
      const content = asString(args.content, "content");
      const absPath = resolveInWorkspace(this.workspaceDirAbs, p);
      await fs.mkdir(path.dirname(absPath), { recursive: true });

      // 与 Python 版一致：write_file 是“全量覆盖”
      await fs.writeFile(absPath, content, "utf-8");
      return { success: true, content: \`Successfully wrote to \${absPath}\` };
    } catch (e) {
      return { success: false, content: "", error: (e as Error).message };
    }
  }
}

export class EditFileTool extends BaseTool {
  readonly name = "edit_file";
  readonly description =
    "对文件做“精确字符串替换”。old_str 必须在文件中唯一匹配，否则失败。使用前应先 read_file。";
  readonly parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "文件路径（绝对或相对工作区）" },
      old_str: { type: "string", description: "待替换的原始字符串（必须唯一匹配）" },
      new_str: { type: "string", description: "替换后的字符串" }
    },
    required: ["path", "old_str", "new_str"]
  } as const;

  constructor(private readonly workspaceDirAbs: string) {
    super();
  }

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const p = asString(args.path, "path");
      const oldStr = asString(args.old_str, "old_str");
      const newStr = asString(args.new_str, "new_str");
      const absPath = resolveInWorkspace(this.workspaceDirAbs, p);

      // “精确替换”的关键：必须唯一匹配，避免把多个位置都替换掉造成不可控修改
      const raw = await fs.readFile(absPath, "utf-8");
      const idx = raw.indexOf(oldStr);
      if (idx === -1) return { success: false, content: "", error: "old_str not found" };
      if (raw.indexOf(oldStr, idx + 1) !== -1) {
        return { success: false, content: "", error: "old_str is not unique in file" };
      }

      const next = raw.slice(0, idx) + newStr + raw.slice(idx + oldStr.length);
      await fs.writeFile(absPath, next, "utf-8");
      return { success: true, content: \`Edited \${absPath}\` };
    } catch (e) {
      return { success: false, content: "", error: (e as Error).message };
    }
  }
}`,
    },
    {
      id: 'agent-18',
      kind: 'snippet' as const,
      label: 'tools/mcpLoader.ts',
      language: 'typescript',
      content: `import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { JsonObject } from "../schema.js";
import { BaseTool, type Tool, type ToolResult } from "./Tool.js";

/**
 * MCP（Model Context Protocol）工具加载器（与 Python 版 mcp_loader.py 对齐）。
 *
 * 目标：
 * - 读取 mcp.json，启动 stdio MCP server 子进程
 * - 通过 JSON-RPC 调用 initialize / tools/list / tools/call
 * - 把 MCP server 暴露的工具包装成我们自己的 Tool，挂到 Agent 的 tools 列表中
 *
 * 注意：
 * - MCP 的“正式 TypeScript SDK”是 \`@modelcontextprotocol/sdk\`。
 * - 教学项目为了避免强依赖，我们实现一个“最小 JSON-RPC stdio 客户端”（足以跑起来/便于阅读）。
 * - 由于生态里存在不同实现差异，如果你遇到协议不兼容，建议直接换用官方 SDK。
 */

type McpServerConfig = {
  description?: string;
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
};

type McpConfigFile = {
  mcpServers?: Record<string, McpServerConfig>;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
};

const MAX_CONTENT_LENGTH_BYTES = 10 * 1024 * 1024; // 上限：10MB
const MAX_BUFFER_BYTES = 20 * 1024 * 1024; // 防护：避免畸形输入导致 buffer 无限制增长
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

class JsonRpcStdioClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer?: any }>();
  private buffer: Buffer = Buffer.from("");

  constructor(private readonly proc: ReturnType<typeof spawn>) {
    proc.stdout?.on("data", (chunk: Uint8Array) => this.onData(Buffer.from(chunk)));
    proc.stderr?.on("data", () => {
      // MCP server 不应向 stdout 打印日志；stderr 可忽略或用于调试
    });
    proc.on("close", () => {
      for (const [id, p] of this.pending) {
        if (p.timer) clearTimeout(p.timer);
        p.reject(new Error(\`MCP process closed (pending id=\${id})\`));
      }
      this.pending.clear();
    });
  }

  /**
   * MCP stdio 通常使用“Content-Length: N\\r\\n\\r\\n<json>”的 framing（类似 LSP）。
   * 我们在这里按这个格式解析。
   */
  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // 防护：对端若发送畸形数据（例如 header 永远不结束），避免内存无限增长。
    if (this.buffer.length > MAX_BUFFER_BYTES) {
      this.buffer = Buffer.from("");
      return;
    }

    while (true) {
      const headerEnd = this.buffer.indexOf("\\r\\n\\r\\n");
      if (headerEnd === -1) break;

      const headerText = this.buffer.slice(0, headerEnd).toString("utf-8");
      const m = /content-length:\\s*(\\d+)/i.exec(headerText);
      if (!m) {
        // 找不到 Content-Length：丢弃到下一个分隔符（容错）
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const len = Number(m[1]);
      if (!Number.isFinite(len) || len < 0 || len > MAX_CONTENT_LENGTH_BYTES) {
        // 长度不合法：丢弃当前 header，继续寻找下一帧。
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + len;
      if (this.buffer.length < bodyEnd) break; // 等更多数据

      const body = this.buffer.slice(bodyStart, bodyEnd).toString("utf-8");
      this.buffer = this.buffer.slice(bodyEnd);

      try {
        const msg = JSON.parse(body) as JsonRpcResponse;
        this.dispatch(msg);
      } catch {
        // 忽略畸形数据
      }
    }
  }

  private dispatch(resp: JsonRpcResponse): void {
    const p = this.pending.get(resp.id);
    if (!p) return;
    this.pending.delete(resp.id);

    if (resp.error) {
      p.reject(new Error(\`JSON-RPC error \${resp.error.code}: \${resp.error.message}\`));
      return;
    }
    p.resolve(resp.result);
  }

  async request<T = any>(method: string, params?: any, opts?: { timeoutMs?: number }): Promise<T> {
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const json = JSON.stringify(req);
    const frame = \`Content-Length: \${Buffer.byteLength(json, "utf-8")}\\r\\n\\r\\n\${json}\`;

    const timeoutMs = opts?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const result = await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(\`MCP request timeout after \${timeoutMs}ms (method=\${method}, id=\${id})\`));
      }, timeoutMs);

      this.pending.set(id, {
        timer,
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        }
      });

      if (!this.proc.stdin) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("MCP process stdin is not writable"));
        return;
      }
      this.proc.stdin.write(frame);
    });
    return result;
  }

  close(): void {
    try {
      this.proc.kill("SIGTERM");
    } catch {
      // 忽略
    }
  }
}

class McpTool extends BaseTool {
  constructor(
    readonly name: string,
    readonly description: string,
    readonly parameters: JsonObject,
    private readonly client: JsonRpcStdioClient
  ) {
    super();
  }

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      // MCP 标准：tools/call { name, arguments }
      const result = await this.client.request("tools/call", { name: this.name, arguments: args });

      // MCP tool 返回通常是 { content: [{type:'text', text:'...'}], isError?: boolean }
      const parts: string[] = [];
      const content = result?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item && typeof item.text === "string") parts.push(item.text);
          else parts.push(String(item));
        }
      } else if (typeof result === "string") {
        parts.push(result);
      } else {
        parts.push(JSON.stringify(result, null, 2));
      }

      const isError = Boolean(result?.isError);
      return { success: !isError, content: parts.join("\\n"), error: isError ? "Tool returned error" : undefined };
    } catch (e) {
      return { success: false, content: "", error: \`MCP tool execution failed: \${(e as Error).message}\` };
    }
  }
}

type McpConnection = {
  name: string;
  client: JsonRpcStdioClient;
  tools: Tool[];
};

const connections: McpConnection[] = [];

export async function loadMcpTools(configPathAbs: string): Promise<Tool[]> {
  const cfgText = await fs.readFile(configPathAbs, "utf-8");
  const cfg = JSON.parse(cfgText) as McpConfigFile;

  const servers = cfg.mcpServers ?? {};
  const tools: Tool[] = [];

  for (const [name, server] of Object.entries(servers)) {
    if (server.disabled) continue;
    if (!server.command) continue;

    const proc = spawn(server.command, server.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(server.env ?? {}) },
      shell: false
    });

    const client = new JsonRpcStdioClient(proc);

    // initialize：不同 server 的 params 可能不同；这里尽量用最小参数
    // 若你遇到初始化失败，建议直接使用官方 SDK（会自动带 capabilities）。
    await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mini-agent-typescript", version: "0.1.0" }
    });

    const list = await client.request("tools/list", {});
    const toolDefs = list?.tools ?? [];

    const wrapped: Tool[] = [];
    for (const t of toolDefs) {
      const params = (t?.inputSchema ?? {}) as JsonObject;
      wrapped.push(new McpTool(String(t.name), String(t.description ?? ""), params, client));
    }

    connections.push({ name, client, tools: wrapped });
    tools.push(...wrapped);
  }

  return tools;
}

export async function cleanupMcpConnections(): Promise<void> {
  for (const c of connections) c.client.close();
  connections.length = 0;
}

/**
 * 解析 mcp.json 路径（与 Python 版一致：相对路径相对于 config.yaml 所在目录）。
 */
export function resolveMcpConfigPath(configDirAbs: string, mcpConfigPath: string): string {
  return path.isAbsolute(mcpConfigPath) ? mcpConfigPath : path.resolve(configDirAbs, mcpConfigPath);
}`,
    },
    {
      id: 'agent-19',
      kind: 'snippet' as const,
      label: 'tools/noteTools.ts',
      language: 'typescript',
      content: `import fs from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../schema.js";
import { resolveInWorkspace } from "../utils/workspacePath.js";
import { BaseTool, type ToolResult } from "./Tool.js";

type Note = { timestamp: string; category: string; content: string };

/**
 * Session Note / Memory 工具（与 Python 版 mini_agent/tools/note_tool.py 对齐）
 *
 * 目标：
 * - 让 Agent 能“持久化”关键信息：用户偏好、重要决策、项目上下文
 * - 在后续对话中通过 recall_notes 取回（不需要每次用户手动重复说明）
 *
 * 设计取舍（教学项目）：
 * - 存储格式：JSON 数组（Note[]），易读易编辑
 * - 存储位置：工作区内 \`.mini-agent/agent_memory.json\`（更直观；也便于 gitignore）
 * - “懒创建”：只有第一次 record_note 才会创建目录与文件
 */

function asString(v: unknown, name: string): string {
  if (typeof v !== "string") throw new Error(\`Expected '\${name}' to be string\`);
  return v;
}

export function defaultMemoryFile(workspaceDirAbs: string): string {
  // 与 Python 版保持一致：默认放在 workspace 根目录下的隐藏文件。
  // Python 版默认是 "./workspace/.agent_memory.json"（相对路径），最终效果也是落在 workspace 内。
  return resolveInWorkspace(workspaceDirAbs, ".agent_memory.json");
}

async function loadNotes(fileAbs: string): Promise<Note[]> {
  try {
    const raw = await fs.readFile(fileAbs, "utf-8");
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as Note[]) : [];
  } catch {
    // 文件不存在或 JSON 损坏：按“无记录”处理（避免影响主流程）
    return [];
  }
}

async function saveNotes(fileAbs: string, notes: Note[]): Promise<void> {
  await fs.mkdir(path.dirname(fileAbs), { recursive: true });
  await fs.writeFile(fileAbs, JSON.stringify(notes, null, 2), "utf-8");
}

export class RecordNoteTool extends BaseTool {
  readonly name = "record_note";
  readonly description =
    "记录重要信息到“会话笔记/长期记忆”（带时间戳）。用于记录关键事实、用户偏好、决策结果，便于后续 recall_notes。";
  readonly parameters = {
    type: "object",
    properties: {
      content: { type: "string", description: "要记录的内容（尽量简洁但具体）" },
      category: { type: "string", description: "可选分类，如 user_preference/project_info/decision" }
    },
    required: ["content"]
  } as const;

  constructor(private readonly memoryFileAbs: string) {
    super();
  }

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const content = asString(args.content, "content");
      const category = (args.category ? asString(args.category, "category") : "general") || "general";
      const notes = await loadNotes(this.memoryFileAbs);
      notes.push({ timestamp: new Date().toISOString(), category, content });
      await saveNotes(this.memoryFileAbs, notes);
      return { success: true, content: \`Recorded note: \${content} (category: \${category})\` };
    } catch (e) {
      return { success: false, content: "", error: (e as Error).message };
    }
  }
}

export class RecallNotesTool extends BaseTool {
  readonly name = "recall_notes";
  readonly description = "读取所有已记录的会话笔记/长期记忆，可按 category 过滤。";
  readonly parameters = {
    type: "object",
    properties: {
      category: { type: "string", description: "可选：按分类过滤" }
    }
  } as const;

  constructor(private readonly memoryFileAbs: string) {
    super();
  }

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const category = args.category ? asString(args.category, "category") : undefined;
      const notes = await loadNotes(this.memoryFileAbs);
      if (!notes.length) return { success: true, content: "No notes recorded yet." };

      const filtered = category ? notes.filter((n) => n.category === category) : notes;
      if (category && !filtered.length) return { success: true, content: \`No notes found in category: \${category}\` };

      const out = filtered
        .map((n, i) => \`\${i + 1}. [\${n.category}] \${n.content}\\n   (recorded at \${n.timestamp})\`)
        .join("\\n");
      return { success: true, content: \`Recorded Notes:\\n\${out}\` };
    } catch (e) {
      return { success: false, content: "", error: (e as Error).message };
    }
  }
}`,
    },
    {
      id: 'agent-20',
      kind: 'snippet' as const,
      label: 'tools/skills/skillLoader.ts',
      language: 'typescript',
      content: `import fs from "node:fs/promises";
import path from "node:path";

export interface Skill {
  name: string;
  description: string;
  content: string;
  license?: string;
  allowedTools?: string[];
  metadata?: Record<string, string>;
  skillPathAbs: string;
}

/**
 * SkillLoader（与 Python 版 SkillLoader 对齐）：
 * - 递归扫描 skills_dir 下的所有 SKILL.md
 * - 解析 YAML frontmatter（仅取 name / description 等元数据）
 * - 生成“metadata-only prompt”（Progressive Disclosure Level 1）
 * - 通过 get_skill 工具按需返回完整 Skill 内容（Level 2）
 *
 * Skill 文件结构（与 skill.md 一致）：
 * skill-name/（技能目录）
 *   SKILL.md   # 必须：YAML frontmatter + 指令主体
 *   scripts/   # 可选：脚本
 *   reference/ # 可选：更多文档
 */
export class SkillLoader {
  private readonly loaded = new Map<string, Skill>();

  constructor(private readonly skillsDirAbs: string) {}

  listSkills(): string[] {
    return [...this.loaded.keys()];
  }

  getSkill(name: string): Skill | undefined {
    return this.loaded.get(name);
  }

  /**
   * Level 1：只返回 name + description，用于“让模型知道有哪些技能，但不提前把全部内容塞进上下文”。
   */
  getSkillsMetadataPrompt(): string {
    if (!this.loaded.size) return "";

    const lines: string[] = [];
    lines.push("## Available Skills");
    lines.push("");
    lines.push("You have access to specialized skills. Each skill provides expert guidance for specific tasks.");
    lines.push("Load a skill's full content using the get_skill tool when needed.");
    lines.push("");

    for (const sk of this.loaded.values()) {
      lines.push(\`- \\\`\${sk.name}\\\`: \${sk.description}\`);
    }

    return lines.join("\\n");
  }

  /**
   * 发现并加载所有 skills。
   */
  async discoverSkills(): Promise<Skill[]> {
    const files = await this.walk(this.skillsDirAbs);
    const skillFiles = files.filter((f) => f.endsWith(\`\${path.sep}SKILL.md\`) || f.endsWith("/SKILL.md"));

    const skills: Skill[] = [];
    for (const skillPathAbs of skillFiles) {
      const s = await this.loadSkill(skillPathAbs);
      if (s) {
        this.loaded.set(s.name, s);
        skills.push(s);
      }
    }
    return skills;
  }

  /**
   * 加载单个 SKILL.md。
   *
   * 与 Python 版保持一致的校验：
   * - 必须包含 YAML frontmatter（--- ... ---）
   * - frontmatter 必须包含 name / description
   */
  async loadSkill(skillPathAbs: string): Promise<Skill | null> {
    try {
      const raw = await fs.readFile(skillPathAbs, "utf-8");
      const parsed = parseFrontmatter(raw);
      if (!parsed) {
        // 教学项目：直接返回 null，不抛异常（避免一个坏 skill 影响全部加载）
        return null;
      }

      const { frontmatter, body } = parsed;
      const name = frontmatter.name;
      const description = frontmatter.description;
      if (!name || !description) return null;

      const skillDirAbs = path.dirname(skillPathAbs);
      const processedContent = await this.processSkillPaths(body.trim(), skillDirAbs);

      return {
        name,
        description,
        content: processedContent,
        license: frontmatter.license,
        allowedTools: parseAllowedTools(frontmatter["allowed-tools"]),
        metadata: parseMetadata(frontmatter.metadata),
        skillPathAbs
      };
    } catch {
      return null;
    }
  }

  /**
   * Progressive Disclosure Level 3：把 Skill 指令里提到的“相对路径资源”，替换为绝对路径。
   *
   * 为什么要做这一步？
   * - 模型在执行 Skill 的过程中经常会引用 scripts/xxx.py、reference/xxx.md 等文件
   * - 如果只写相对路径，当当前工作目录变化时就容易找不到
   * - 替换成绝对路径后，配合 read_file 工具就稳定了
   *
   * 与 Python 版一致：主要处理三类路径引用
   * 1) \`scripts/...\` / \`examples/...\` / \`templates/...\` / \`reference/...\`（常出现在代码块或反引号中）
   * 2) see/read/check xxx.md 这种“自然语言引用”
   * 3) Markdown 链接 [text](./reference/xxx.md)
   */
  private async processSkillPaths(content: string, skillDirAbs: string): Promise<string> {
    // 模式 1：匹配 (python\\s+|\`) 后跟 scripts/... 等相对路径
    const patternDirs = /(python\\s+|\`)((?:scripts|examples|templates|reference)\\/[^\\s\`\\)]+)/g;
    content = await replaceAsync(content, patternDirs, async (m, prefix, relPath) => {
      const abs = path.resolve(skillDirAbs, relPath);
      if (await exists(abs)) return \`\${prefix}\${abs}\`;
      return m;
    });

    // 模式 2：匹配 "see/read/refer to/check xxx.md" 这类自然语言引用
    const patternDocs = /(see|read|refer to|check)\\s+([a-zA-Z0-9_-]+\\.(?:md|txt|json|yaml))([.,;\\s])/gi;
    content = await replaceAsync(content, patternDocs, async (m, prefix, filename, suffix) => {
      const abs = path.resolve(skillDirAbs, filename);
      if (await exists(abs)) return \`\${prefix} \\\`\${abs}\\\` (use read_file to access)\${suffix}\`;
      return m;
    });

    // 模式 3：匹配 Markdown 链接（可带 Read/See/Check... 等前缀词）
    const patternMarkdown =
      /(?:(Read|See|Check|Refer to|Load|View)\\s+)?\\[(\`?[^\`\\]]+\`?)\\]\\(((?:\\.\\/)?[^)]+\\.(?:md|txt|json|yaml|js|py|html))\\)/gi;
    content = await replaceAsync(content, patternMarkdown, async (m, prefix, linkText, filepath) => {
      const clean = String(filepath).startsWith("./") ? String(filepath).slice(2) : String(filepath);
      const abs = path.resolve(skillDirAbs, clean);
      if (await exists(abs)) {
        const p = prefix ? \`\${prefix} \` : "";
        return \`\${p}[\${linkText}](\\\`\${abs}\\\`) (use read_file to access)\`;
      }
      return m;
    });

    return content;
  }

  private async walk(dirAbs: string): Promise<string[]> {
    const out: string[] = [];
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> = [];
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return out;
    }

    for (const ent of entries) {
      const p = path.join(dirAbs, ent.name);
      if (ent.isDirectory()) {
        out.push(...(await this.walk(p)));
      } else if (ent.isFile()) {
        out.push(p);
      }
    }
    return out;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isFile() || s.isDirectory();
  } catch {
    return false;
  }
}

/**
 * 解析 YAML frontmatter（极简版，仅用于 Skill 的 frontmatter）。
 *
 * Skill 的 frontmatter 通常很小，字段也固定，因此这里用“简化解析”：
 * - 只支持 key: value 的一层结构（不支持嵌套、数组）
 * - 足够满足 name/description/license 等字段
  */
function parseFrontmatter(input: string): { frontmatter: Record<string, string>; body: string } | null {
  // 同时支持 LF 与 CRLF（Windows 常见）。
  const m = /^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n([\\s\\S]*)$/m.exec(input);
  if (!m) return null;

  const rawYaml = m[1] ?? "";
  const body = m[2] ?? "";

  const frontmatter: Record<string, string> = {};
  for (const line of rawYaml.split(/\\r?\\n/)) {
    const trimmed = (line.split("#")[0] ?? "").trim();
    if (!trimmed) continue;
    const kv = /^([A-Za-z0-9_-]+)\\s*:\\s*(.*)$/.exec(trimmed);
    if (!kv) continue;
    const key = kv[1]!;
    let value: string = kv[2] ?? "";
    value = value.trim();
    const quoted = /^"(.*)"$/.exec(value) || /^'(.*)'$/.exec(value);
    if (quoted) value = quoted[1] ?? "";
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function parseAllowedTools(v: unknown): string[] | undefined {
  if (typeof v !== "string") return undefined;
  const raw = v.trim();
  if (!raw) return undefined;

  // 支持极简的行内列表："a, b" 或 "[a, b]"。
  const inner = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  const parts = inner
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(stripQuotes);
  return parts.length ? parts : undefined;
}

function parseMetadata(v: unknown): Record<string, string> | undefined {
  if (typeof v !== "string") return undefined;
  const raw = v.trim();
  if (!raw) return undefined;

  // 允许用 JSON 对象字符串作为紧凑的一行写法。
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(parsed as Record<string, unknown>)) {
        out[String(k)] = typeof val === "string" ? val : String(val);
      }
      return Object.keys(out).length ? out : undefined;
    }
  } catch {
    // 解析失败：继续尝试后备格式
  }

  // 兜底：解析 "k=v, a=b" 这种键值对写法。
  const out: Record<string, string> = {};
  for (const part of raw.split(/[;,]/)) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const key = p.slice(0, idx).trim();
    const value = p.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = stripQuotes(value);
  }
  return Object.keys(out).length ? out : undefined;
}

function stripQuotes(s: string): string {
  const quoted = /^"(.*)"$/.exec(s) || /^'(.*)'$/.exec(s);
  return quoted ? (quoted[1] ?? "") : s;
}

async function replaceAsync(
  input: string,
  regex: RegExp,
  replacer: (...args: any[]) => Promise<string>
): Promise<string> {
  const matches: Array<{ start: number; end: number; text: string; groups: any[] }> = [];
  input.replace(regex, (...args: any[]) => {
    const matchText = String(args[0]);
    const offset = Number(args[args.length - 2]); // 标准 replace 回调参数：... , offset, string
    matches.push({ start: offset, end: offset + matchText.length, text: matchText, groups: args });
    return matchText;
  });

  if (!matches.length) return input;

  // 从后往前替换，避免 offset 失效
  let out = input;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    const rep = await replacer(...m.groups);
    out = out.slice(0, m.start) + rep + out.slice(m.end);
  }
  return out;
}`,
    },
    {
      id: 'agent-21',
      kind: 'snippet' as const,
      label: 'tools/skills/skillTool.ts',
      language: 'typescript',
      content: `import type { JsonObject } from "../../schema.js";
import { BaseTool, type ToolResult } from "../Tool.js";
import type { Skill, SkillLoader } from "./skillLoader.js";

function asString(v: unknown, name: string): string {
  if (typeof v !== "string") throw new Error(\`Expected '\${name}' to be string\`);
  return v;
}

function skillToPrompt(skill: Skill): string {
  // 与 Python 版 Skill.to_prompt() 对齐：给模型一个清晰的“技能块”
  return \`\\n# Skill: \${skill.name}\\n\\n\${skill.description}\\n\\n---\\n\\n\${skill.content}\\n\`;
}

/**
 * Progressive Disclosure Level 2：
 * - 系统提示词里只放技能元数据（name/description）
 * - 当模型确认需要某个技能时，调用 get_skill 拉取该技能完整内容（SKILL.md 的主体）
 */
export class GetSkillTool extends BaseTool {
  readonly name = "get_skill";
  readonly description = "按名称获取某个 Skill 的完整内容（用于执行某类专业任务）。";
  readonly parameters = {
    type: "object",
    properties: {
      skill_name: { type: "string", description: "Skill 名称（可从系统提示词的 Available Skills 中查看）" }
    },
    required: ["skill_name"]
  } as const;

  constructor(private readonly loader: SkillLoader) {
    super();
  }

  async execute(args: JsonObject): Promise<ToolResult> {
    try {
      const name = asString(args.skill_name, "skill_name");
      const skill = this.loader.getSkill(name);
      if (!skill) {
        const available = this.loader.listSkills().join(", ");
        return {
          success: false,
          content: "",
          error: \`Skill '\${name}' does not exist. Available skills: \${available}\`
        };
      }
      return { success: true, content: skillToPrompt(skill) };
    } catch (e) {
      return { success: false, content: "", error: (e as Error).message };
    }
  }
}`,
    },
    {
      id: 'agent-22',
      kind: 'snippet' as const,
      label: 'utils/displayWidth.ts',
      language: 'typescript',
      content: `/**
 * 计算“终端显示宽度”（近似实现），用于对齐 banner/表格。
 *
 * 为什么需要它？
 * - 中文/日文/韩文等 CJK 字符在等宽终端里通常占 2 列宽
 * - 直接用 string.length 会导致对齐错位
 *
 * 教学取舍：
 * - 这里用常见 Unicode 区间做近似判断（够用）
 * - 生产级可换成成熟库（例如 wcwidth）
 */
export function calculateDisplayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += isWideChar(code) ? 2 : 1;
  }
  return w;
}

function isWideChar(code: number): boolean {
  // CJK Unified Ideographs
  if (code >= 0x4e00 && code <= 0x9fff) return true;
  // CJK Symbols and Punctuation
  if (code >= 0x3000 && code <= 0x303f) return true;
  // Hiragana / Katakana
  if (code >= 0x3040 && code <= 0x30ff) return true;
  // Hangul Syllables
  if (code >= 0xac00 && code <= 0xd7af) return true;
  // Fullwidth Forms
  if (code >= 0xff01 && code <= 0xff60) return true;

  return false;
}`,
    },
    {
      id: 'agent-23',
      kind: 'snippet' as const,
      label: 'utils/homeDir.ts',
      language: 'typescript',
      content: `/**
 * 跨平台获取“用户主目录”（供 config/log/history 使用）。
 *
 * 教学说明：
 * - 为了避免强依赖 @types/node + os.homedir()，这里用一个很小的实现。
 * - 在受限环境下兜底到 process.cwd()，保证程序仍可运行。
 */
export function getHomeDir(): string {
  return process.env.USERPROFILE || process.env.HOME || process.cwd();
}`,
    },
    {
      id: 'agent-24',
      kind: 'snippet' as const,
      label: 'utils/jsonRpcStdio.ts',
      language: 'typescript',
      content: `/**
 * 通过 stdio 传输的 JSON-RPC 2.0（使用 "Content-Length" 分帧，风格类似 LSP）。
 *
 * 这是 Agent/MCP/ACP 生态里非常常见的一种“进程间通信”方式：
 * - 父进程启动子进程
 * - 双方通过 stdin/stdout 发送消息
 * - 为了解决“粘包/拆包”，使用 Content-Length 头部标明 JSON 的字节长度
 *
 * 帧格式：
 *   Content-Length: <N>\\r\\n
 *   \\r\\n
 *   <N bytes JSON>
 *
 * 这个文件提供：
 * - 一个最小的 JSON-RPC stdio 连接类：负责
 *   1) 解析流式输入（按帧拆包）
 *   2) 分发 request / notification
 *   3) 发送 response / notification
 *
 * 说明（教学取舍）：
 * - 我们不追求 100% 覆盖所有边界情况（例如多种 header、字符集等）
 * - 但保证核心思路清晰，读者能把它迁移到真实项目中
 */

export type JsonRpcId = number | string;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: any;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: any;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: any;
  error?: { code: number; message: string; data?: any };
};

export type JsonRpcHandler = (params: any) => Promise<any> | any;

const MAX_CONTENT_LENGTH_BYTES = 10 * 1024 * 1024; // 上限：10MB
const MAX_BUFFER_BYTES = 20 * 1024 * 1024; // 防护：避免畸形输入导致 buffer 无限制增长

export class JsonRpcStdioConnection {
  private buffer: Buffer = Buffer.from("");
  private handlers = new Map<string, JsonRpcHandler>();

  constructor(
    private readonly stdin: { on(ev: "data", cb: (chunk: Uint8Array) => void): void },
    private readonly stdout: { write(data: string): void },
    private readonly onError: (err: Error) => void = () => {}
  ) {}

  on(method: string, handler: JsonRpcHandler): void {
    this.handlers.set(method, handler);
  }

  /**
   * 开始监听 stdin，并处理输入的 JSON-RPC 消息。
   */
  start(): void {
    this.stdin.on("data", (chunk: Uint8Array) => {
      try {
        this.onData(Buffer.from(chunk));
      } catch (e) {
        this.onError(e as Error);
      }
    });
  }

  notify(method: string, params?: any): void {
    const msg: JsonRpcNotification = { jsonrpc: "2.0", method, params };
    this.send(msg);
  }

  private send(msg: object): void {
    const json = JSON.stringify(msg);
    const frame = \`Content-Length: \${Buffer.byteLength(json, "utf-8")}\\r\\n\\r\\n\${json}\`;
    this.stdout.write(frame);
  }

  private async dispatchRequest(req: JsonRpcRequest): Promise<void> {
    const handler = this.handlers.get(req.method);
    if (!handler) {
      this.send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32601, message: \`Method not found: \${req.method}\` }
      } satisfies JsonRpcResponse);
      return;
    }

    try {
      const result = await handler(req.params);
      this.send({ jsonrpc: "2.0", id: req.id, result } satisfies JsonRpcResponse);
    } catch (e) {
      const msg = (e as Error).message || String(e);
      this.send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message: msg }
      } satisfies JsonRpcResponse);
    }
  }

  private dispatchNotification(note: JsonRpcNotification): void {
    const handler = this.handlers.get(note.method);
    if (!handler) return;
    Promise.resolve(handler(note.params)).catch((e) => this.onError(e as Error));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    // 防护：对端若发送畸形数据（例如 header 永远不结束），避免内存无限增长。
    if (this.buffer.length > MAX_BUFFER_BYTES) {
      this.onError(new Error(\`JSON-RPC buffer exceeded \${MAX_BUFFER_BYTES} bytes; dropping buffer\`));
      this.buffer = Buffer.from("");
      return;
    }

    // 流式解析：可能一次 data 里包含多个帧，也可能只包含半个帧
    while (true) {
      const headerEnd = this.buffer.indexOf("\\r\\n\\r\\n");
      if (headerEnd === -1) return;

      const headerText = this.buffer.slice(0, headerEnd).toString("utf-8");
      const m = /content-length:\\s*(\\d+)/i.exec(headerText);
      if (!m) {
        // 解析不到长度：丢弃 header，尝试继续（容错）
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const len = Number(m[1]);
      if (!Number.isFinite(len) || len < 0 || len > MAX_CONTENT_LENGTH_BYTES) {
        this.onError(new Error(\`Invalid Content-Length: \${String(m[1])}\`));
        // 丢弃当前 header，继续寻找下一帧（容错）。
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + len;
      if (this.buffer.length < bodyEnd) return; // 等更多数据

      const body = this.buffer.slice(bodyStart, bodyEnd).toString("utf-8");
      this.buffer = this.buffer.slice(bodyEnd);

      let msg: any;
      try {
        msg = JSON.parse(body);
      } catch {
        continue;
      }

      // JSON-RPC：有 id => request/response；无 id => notification
      const methodOk = typeof msg?.method === "string" && msg.method.length > 0;
      const idOk = typeof msg?.id === "number" || typeof msg?.id === "string";
      if (msg && msg.jsonrpc === "2.0" && methodOk && idOk) {
        void this.dispatchRequest(msg as JsonRpcRequest);
      } else if (msg && msg.jsonrpc === "2.0" && methodOk && msg.id === undefined) {
        this.dispatchNotification(msg as JsonRpcNotification);
      }
    }
  }
}`,
    },
    {
      id: 'agent-25',
      kind: 'snippet' as const,
      label: 'utils/workspacePath.ts',
      language: 'typescript',
      content: `import path from "node:path";

/**
 * 把用户给的相对路径解析到工作区，并阻止 \`..\` 逃逸。
 *
 * 说明：
 * - 教学项目里只做基础约束：最终路径必须以 workspaceDir 作为前缀（path.relative 不以 .. 开头）。
 * - 真实项目还需要处理符号链接、UNC 路径等边界情况。
 */
export function resolveInWorkspace(workspaceDirAbs: string, userPath: string): string {
  const abs = path.isAbsolute(userPath) ? path.normalize(userPath) : path.resolve(workspaceDirAbs, userPath);
  const rel = path.relative(workspaceDirAbs, abs);
  // rel === "" 表示就是 workspaceDir 本身，允许（用于写入目录等）
  if (rel === "") return abs;
  if (rel === ".." || rel.startsWith(\`..\${path.sep}\`)) {
    throw new Error(\`Path escapes workspace: \${userPath}\`);
  }
  return abs;
}`,
    }
  ] satisfies SourceItem[],
  teachingBrief: {
    topic: '从零实现一个 TypeScript AI Agent：完整架构与 Tool Calling',
    audience_level: 'intermediate' as const,
    core_question: '一个完整的 AI Agent 系统是如何架构的？从 LLM 调用、工具注册、交互式 REPL 到配置管理，各模块如何协作？',
    ignore_scope: 'MCP 协议、具体 LLM Provider 的 HTTP 实现细节、Docker 部署',
    output_language: '中文',
    desired_depth: 'deep' as const,
  } satisfies TeachingBrief,
}
