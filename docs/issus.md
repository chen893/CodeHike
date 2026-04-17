# Issues Notes

> 本页记录当前已知的关键问题与修复要点。详细根因分析见 [v3-implementation-issues.md](./v3-implementation-issues.md)。

## 当前问题要点

- 公开仓库导入原先被错误地绑到登录态，未登录用户直接 401，无法完成基础试用。
- GitHub `403` 被粗暴归类成“速率限制”，实际混杂了 token 权限、secondary rate limit 和 forbidden 等不同错误。
- `POST /api/github/file-content` 在 partial failure 时只返回失败文件，没有把成功文件一并返回，导致前端无法保留成功结果。
- 大仓库 `git/trees?recursive=1` 出现 `truncated=true` 时，前端没有继续按目录懒加载，文件树会不完整。

## 本次修复要点

- 公开仓库改为免登录可导入；如果用户已经通过 GitHub OAuth 登录，则仅复用 token 提升配额。
- 服务端新增更细的 GitHub 错误分类和重试/匿名回退逻辑，不再把所有 `403` 都当成 rate limit。
- `file-content` route 的 207 partial-success 响应现在会保留成功文件、`totalLines` 和 `rateLimit` 信息。
- create-draft 的文件树展开已接通 `repo-tree/subdirectory`，大仓库目录会按 `sha` 懒加载。

## 受影响文件

- `lib/services/github-repo-service.ts`
- `app/api/github/repo-tree/route.ts`
- `app/api/github/repo-tree/subdirectory/route.ts`
- `app/api/github/file-content/route.ts`
- `components/create-draft/github-client.ts`
- `components/create-draft/use-github-import-controller.ts`
- `components/create-draft/file-tree-browser.tsx`
- `components/create-draft/github-import-tab.tsx`
- `tests/github-import.test.js`

---

## 2026-04-16: DeepSeek Output.object 结构化输出失败

### 现象

使用 DeepSeek 模型生成教程时，Phase 1 大纲生成阶段报错：
```
大纲生成失败 — Failed to process successful response
```

### 根因

Vercel AI SDK 的 `Output.object({ schema })` 依赖底层 provider 的 `response_format: { type: "json_object" }` 能力。DeepSeek API 不支持此参数，导致：

1. AI SDK 发送请求时附带 `response_format`，DeepSeek 忽略它
2. DeepSeek 返回自由格式的 JSON（字段名与 schema 不匹配，如 `tutorial_title` 而非 `meta.title`）
3. AI SDK 的 `successfulResponseHandler` 尝试按 Zod schema 解析响应 → 验证失败
4. `@ai-sdk/provider-utils` 将 Zod 错误包装为 `APICallError: "Failed to process successful response"`，真实错误藏在 `cause` 链中

### 影响范围

所有使用 `Output.object()` 的 AI 生成调用均受影响：

| 文件 | 用途 | 状态 |
|------|------|------|
| `lib/ai/multi-phase-generator.ts` | v2 多阶段生成（大纲 + 步骤填充） | 已修复 |
| `lib/ai/tutorial-generator.ts` | v1 单次流式生成 + 步骤重生成 | 已修复 |
| `lib/ai/model-capabilities.ts` | 能力探测（`probeToolStructuredOutput`） | 保留（探测本身会正确 catch 失败） |

### 修复方案

**移除所有 `Output.object()` 调用**，改用 `generateText()` 获取原始 `result.text`，再手动提取并解析 JSON：

1. 新增 `parseJsonFromText<T>(text, schema, label)` 辅助函数，按优先级尝试：
   - 完整文本直接解析
   - 从 markdown code fence 提取（` ```json ... ``` `）
   - 提取最外层 `{ ... }` 块
   - 用 Zod schema 验证

2. 所有 `generateText()` 调用移除 `output` 参数
3. 所有 `streamText()` 调用移除 `output` 参数
4. 持久化层（`persistV1Content`）改为接收 `result.text` Promise，手动调用 `parseStreamedDraft()`

### 模型能力标记修正

`lib/ai/model-capabilities.ts` 中 DeepSeek 的能力标记已修正：

```diff
  'deepseek-chat': {
    supportsTools: true,
-   supportsStructuredOutput: true,
-   supportsToolStructuredOutput: 'probe',
+   supportsStructuredOutput: false,
+   supportsToolStructuredOutput: false,
  },
```

### 受影响文件

- `lib/ai/multi-phase-generator.ts` — 移除重复导入，移除 `Output` import，所有生成调用改为手动 JSON 解析
- `lib/ai/tutorial-generator.ts` — 移除 `Output` import，新增 `parseStreamedDraft()` 导出函数
- `lib/services/generate-tutorial-draft.ts` — `persistV1Content` 改为接收 `textPromise` 并手动解析
- `lib/ai/model-capabilities.ts` — DeepSeek 能力标记修正

### 注意事项

- OpenAI 系列（gpt-4o 等）**理论上支持** `Output.object`，但为统一兼容性，同样改为手动解析
- 如后续有 provider 原生支持 `response_format` 且确实需要流式结构化输出，可考虑按 provider 区分路径
- `model-capabilities.ts` 的探测函数仍使用 `Output.object`，这是故意的——它用来探测能力边界，失败会被正确 catch
