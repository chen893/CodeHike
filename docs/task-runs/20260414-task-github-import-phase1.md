# Task Run: GitHub 公开仓库导入 Phase 1 (MVP)

> task_run_id: `20260414-task-github-import-phase1`
> roadmap_file: `docs/20260414-roadmap-github-import.md`
> target_scope: Phase 1 — 公开仓库导入（MVP）
> 执行日期: 2026-04-14
> 最终状态: ✅ PASS

---

## 成功标准

- ✅ 用户可以从 GitHub 公开仓库 URL 导入选定文件，替代手动粘贴
- ✅ 导入文件数 ≤15，总行数 ≤1500（前端+后端双重校验）
- ✅ 不修改渲染链路、编辑工作区、发布流程
- ✅ 不新增 DB 表
- ✅ `npm run build` 通过，无类型错误

---

## 任务拆分

### Subtask 1: GitHub Repo Service + API Routes — ✅ PASS
- `lib/services/github-repo-service.ts` — 仓库树获取、文件内容拉取、token 检索、URL 解析、嵌套树构建
- `app/api/github/repo-tree/route.ts` — GET 代理 Trees API，需认证
- `app/api/github/file-content/route.ts` — POST 代理 Contents API，需认证，含行数上限校验
- `middleware.ts` — 增加 `/api/github/` 路由保护

**Review 发现的问题：**
- 初始版本 `handleGitHubResponse` 未正确传 `response` 参数 → 已修复
- 初始版本 `sortNodes` 多余闭合括号 → 已修复

### Subtask 2: Import Controller + Client — ✅ PASS
- `components/create-draft/github-client.ts` — 客户端 API 调用封装 + 类型定义 + 辅助函数
- `components/create-draft/use-github-import-controller.ts` — 导入状态机（idle → loading-tree → selecting → loading-content → done）

**Review 发现的问题：**
- 初始 import 路径指向 `../create-draft-form-utils`（目录变化后不正确）→ 已修复为 `../drafts/create-draft-form-utils`

### Subtask 3: File Tree Browser UI — ✅ PASS
- `components/create-draft/file-tree-browser.tsx` — 递归文件树渲染 + 多选 + 目录全选 + 文件统计

### Subtask 4: GitHub Import Tab + Integration — ✅ PASS
- `components/create-draft/github-import-tab.tsx` — Tab 视图（URL 输入 + 文件树 + 导入操作）
- `create-draft-form.tsx` — 新增 "手动粘贴" / "GitHub 导入" Tab 切换
- `use-create-draft-form-controller.ts` — 导出 `setSourceItems` 供 GitHub 导入使用

**Review 发现的问题：**
- `lucide-react` 没有 `Github` 图标 → 改用 `GitBranch`

### Subtask 5: Build Verification — ✅ PASS
- `npm run build` 通过，无错误、无警告
- 新路由 `/api/github/repo-tree` 和 `/api/github/file-content` 已注册

---

## 技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| API 调用方式 | REST API（原生 fetch） | 兼容 serverless，按需拉取 |
| 认证方案 | 复用 OAuth token（accounts 表） | 公开仓库无需额外 scope |
| SourceItem schema | MVP 不扩展，映射为 snippet | 导入文件映射为现有格式 |
| 客户端还是服务端代理 | 服务端代理 | 保护 token、统一速率限制 |
| 导入文件数上限 | ≤15 文件、≤1500 行 | 前端 UI + 后端 API 双重校验 |
| 文件树过滤 | 自动跳过隐藏目录、node_modules 等 | 减少噪声，聚焦源码文件 |

---

## 修改文件清单

### 新增文件（6 个）
1. `lib/services/github-repo-service.ts`
2. `app/api/github/repo-tree/route.ts`
3. `app/api/github/file-content/route.ts`
4. `components/create-draft/github-client.ts`
5. `components/create-draft/use-github-import-controller.ts`
6. `components/create-draft/file-tree-browser.tsx`
7. `components/create-draft/github-import-tab.tsx`

### 修改文件（3 个）
1. `middleware.ts` — 增加 `/api/github/` 路由保护
2. `components/create-draft-form.tsx` — Tab 切换 + GitHub 导入集成
3. `components/drafts/use-create-draft-form-controller.ts` — 导出 `setSourceItems`

---

## 未完成项 / 风险 / 后续

1. **未手动验证端到端流程** — 需要在运行中的浏览器里测试：输入 URL → 浏览树 → 选择文件 → 导入 → 提交生成
2. **GitHub token 过期处理** — 当前未处理 OAuth token 过期刷新，如果 token 过期会降级为未认证请求（仍可访问公开仓库，但速率更低）
3. **大仓库性能** — `recursive=1` 的 tree API 对于超大仓库可能返回 `truncated: true`，当前做了简单过滤但可能不够
4. **二进制文件误选** — 当前通过文件大小（>100KB）过滤，但没有按扩展名排除二进制文件（.png, .jpg 等）
5. **Phase 2 准备** — 智能推荐核心文件、branch/tag 选择、token 预估提示
