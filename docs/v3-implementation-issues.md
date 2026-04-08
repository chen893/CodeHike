# VibeDocs v3.0 实施问题记录

> 记录实施过程中遇到的问题、根因分析和解决方案。

---

## 问题 1：Zod v4 UUID 校验更严格

**现象**：`POST /api/drafts` 返回 `Invalid UUID` 错误，传入的 `00000000-0000-0000-0000-000000000001` 被拒绝。

**根因**：项目安装了 Zod v4（4.3.6），其 `z.string().uuid()` 严格遵循 RFC 4122，只接受 v1-v8 版本的 UUID，拒绝全零等非标准 UUID。

**解决**：使用标准 v4 UUID（如 `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d`）。前端 `create-draft-form.tsx` 使用 `crypto.randomUUID()` 生成，不会有此问题。

---

## 问题 2：`@ai-sdk/openai` v3 使用 Responses API（非 Chat Completions）

**现象**：调用 DeepSeek API 时返回 404，请求 URL 为 `https://api.deepseek.com/responses`。

**根因**：`@ai-sdk/openai` v3.x 默认使用 OpenAI 的 **Responses API**（`/responses` 端点），而非 Chat Completions API（`/chat/completions`）。DeepSeek 等 OpenAI 兼容供应商只支持 Chat Completions API。

**解决**：使用 `@ai-sdk/openai-compatible` 替代 `@ai-sdk/openai`。前者走 `/chat/completions` 端点，兼容所有 OpenAI 兼容供应商。

**影响文件**：`lib/ai/tutorial-generator.ts`

---

## 问题 3：MiniMax 不支持 `response_format`

**现象**：MiniMax M2.7 的 `partialOutputStream` 无数据产出，`Output.object` 无法工作。

**根因**：MiniMax API 不支持 `response_format: { type: "json_object" }` 参数（社区已确认的已知限制）。AI SDK 的 `Output.object` 依赖此参数约束 JSON 输出。

**解决**：切换到 DeepSeek，其 API 完整支持 `response_format: json_object` + 流式输出。

**参考**：[MiniMax M2.5 response_format 限制](https://github.com/MiniMax-AI/MiniMax-M2.5/issues/4)

---

## 问题 4：DeepSeek `max_tokens` 上限为 8192

**现象**：DeepSeek API 返回 `Invalid max_tokens value, the valid range of max_tokens is [1, 8192]`。

**根因**：DeepSeek Chat 模型的 `max_tokens` 上限是 8192，而代码中设置了 16000。

**解决**：将 `maxOutputTokens` 改为 8192。

**注意**：如果生成的教程 JSON 超过 8192 tokens，会被截断。后续可考虑使用 DeepSeek 的更大上下文模型（如 deepseek-reasoner）或分段生成。

**影响文件**：`lib/ai/tutorial-generator.ts`

---

## 问题 5：`partialOutputStream` 与 `toTextStreamResponse()` 不能同时消费

**现象**：使用 `toTextStreamResponse()` 返回的 SSE 流客户端收到空数据。

**根因**：AI SDK 的 `streamText` 返回的 `StreamTextResult` 中，`partialOutputStream`、`textStream`、`toTextStreamResponse()` 共享同一个底层流。先消费 `partialOutputStream`（后台持久化）会耗尽数据，导致 `toTextStreamResponse()` 的 body 为空。

**解决**：改用 `result.textStream` 手动构建 SSE Response：
1. 遍历 `textStream`，每个 chunk 包装为 `data: {text: "..."}\n\n` SSE 事件
2. 流结束后在后台解析完整 JSON 并持久化
3. 客户端 `GenerationProgress` 组件用 `fetch` + `ReadableStream` 消费 SSE

**影响文件**：
- `lib/services/generate-tutorial-draft.ts` — 手动构建 ReadableStream
- `components/generation-progress.tsx` — 从 useObject 改为原生 SSE 消费
- `app/api/drafts/[id]/generate/route.ts` — 返回自定义 SSE Response

---

## 问题 6：AI SDK v6 参数名变化

| 旧参数（v4/v5） | 新参数（v6） | 说明 |
|---|---|---|
| `maxTokens` | `maxOutputTokens` | 最大输出 token 数 |

---

## 当前可用的 AI 供应商配置

| 供应商 | Provider 包 | 端点 | response_format | SSE 流式 |
|---|---|---|---|---|
| DeepSeek | `@ai-sdk/openai-compatible` | `/chat/completions` | 支持 | 支持 |
| MiniMax | `@ai-sdk/openai-compatible` | `/chat/completions` | 不支持 | 不确定 |
| OpenAI | `@ai-sdk/openai` | `/responses` 或 `/chat/completions` | 支持 | 支持 |

**推荐**：使用 DeepSeek + `@ai-sdk/openai-compatible`，兼容性最好。

---

## 问题 7：AI 生成的 patch find 文本与代码不精确匹配

**现象**：生成校验失败 `Patch 匹配失败: 找不到: ...`。AI 在 baseCode 中放置了占位函数（如 `dispatch: () => {}`），patch 的 find 文本与实际代码存在空白/格式差异。

**根因**：原始 prompt 对 patch 精确匹配的约束不够强。AI 倾向于：
1. 在 baseCode 中写占位符而非真实代码
2. find 字段凭想象编写而非从上一步代码逐字复制
3. 空格、缩进、换行与实际代码不一致

**解决**：大幅强化 prompt 中的 patch 规则：
- 明确禁止在 baseCode 中使用占位符
- 要求 baseCode 必须是真实可运行的代码
- 要求 find 从上一步代码中"逐字复制"
- 增加"每步代码变化不超过 15 行"的约束
- 用醒目的分隔线和警告符号突出关键规则

**验证**：优化 prompt 后，Redux 300 行源码教程生成成功，6 步全部通过可执行校验。

**影响文件**：`lib/ai/prompt-templates.ts`
