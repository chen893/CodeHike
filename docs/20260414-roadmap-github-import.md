# 路线图：GitHub 仓库导入生成教程

> Run ID: `20260414-roadmap-github-import`
> 调研日期：2026-04-14
> 范围：GitHub 仓库导入后生成教程的技术可行性与实施路线
> 过程稿目录：`docs/roadmaps/20260414-roadmap-github-import/`

---

## 核心判断

**可行，且与现有架构天然匹配。** GitHub 仓库导入本质上是一种新的源码输入方式，导入完成后仍产出 `SourceItem[]` + `TeachingBrief`，完全复用现有生成、编辑、发布管道。

**硬约束：** 当前 AI prompt 全量注入源码。面向整个仓库时，必须在导入环节做文件筛选，否则 token 溢出。

---

## 建议分三个阶段推进

### Phase 1：公开仓库导入（MVP）

| 维度 | 内容 |
|------|------|
| **目标** | 用户从 GitHub 公开仓库 URL 导入选定文件，替代手动粘贴 |
| **为什么现在做** | 手动粘贴 3+ 文件需 20-30 分钟，是当前最大输入摩擦 |
| **核心能力** | 仓库 URL 解析 → 文件树浏览多选 → 拉取内容 → 映射 SourceItem[] → 预填 Teaching Brief → 复用生成管道 |
| **不做** | 私有仓库、branch 选择、自动推荐、仓库历史 |
| **技术要求** | 新增 2 个 API 路由（repo-tree / file-content）+ 1 个 service + 1 个 UI 组件 + 1 个 controller |
| **前置依赖** | 无（现有 OAuth token 可访问公开仓库） |
| **风险** | 大仓库 token 溢出 — 通过文件选择器 + 行数上限缓解 |
| **成功标准** | 输入 3+ 文件场景从 20-30 分钟降至 3 分钟以内 |

**新增模块：**

- `lib/services/github-repo-service.ts` — 仓库树获取、文件内容拉取
- `app/api/github/repo-tree/route.ts` — 代理 Trees API
- `app/api/github/file-content/route.ts` — 代理 Contents API
- `components/create-draft/file-tree-browser.tsx` — 文件树多选 UI
- `components/create-draft/use-github-import-controller.ts` — 导入状态机
- `components/create-draft/github-import-tab.tsx` — Tab 视图

**不改的模块：** 渲染链路、编辑工作区、发布流程、探索/搜索/标签、用户档案。

### Phase 2：智能导入增强

| 维度 | 内容 |
|------|------|
| **目标** | 降低用户选择负担，提高导入后生成质量 |
| **核心能力** | 自动推荐核心文件、Token 预估提示、branch/tag 选择、源码分层注入 prompt |
| **前置依赖** | Phase 1 上线 + 生成质量数据积累 |

### Phase 3：深度集成

| 维度 | 内容 |
|------|------|
| **目标** | 支持私有仓库 + 仓库变更追踪 |
| **核心能力** | GitHub App 集成、私有仓库、仓库更新提醒、批量生成 |
| **前置依赖** | Phase 2 验证用户需求后推进 |

---

## 关键技术决策

| 决策点 | 建议 | 理由 |
|--------|------|------|
| API 调用方式 | REST API（非 git clone） | 兼容 Vercel serverless，按需拉取 |
| 认证方案 | 复用现有 OAuth token | 公开仓库无需额外 scope |
| 是否需要 @octokit/rest | 不需要 | 原生 fetch 足够，减少依赖 |
| SourceItem schema 是否扩展 | MVP 不扩展 | 导入文件映射为 snippet 即可 |
| 客户端还是服务端代理 | 服务端代理 | 保护 token、统一速率限制 |
| 导入文件数上限 | 建议 ≤15 文件、≤1500 行 | 控制 AI token 消耗和生成质量 |

---

## 竞品差异化

| 产品 | 能力 | 与 VibeDocs 的差异 |
|------|------|-------------------|
| DeepWiki | 仓库文档生成（静态 Markdown） | 不生成交互式教程 |
| Codec8 | 代码导览（JSON 步骤） | 非教学导向，无 AI 生成 |
| CodeSee | 代码地图可视化 | 侧重理解而非教学 |
| **VibeDocs** | **交互式 scrollytelling 教程** | **市场空白，无直接竞品** |

---

## 明确不做什么

- 不引入 @octokit/rest 等 SDK
- 不在 MVP 支持 git clone
- 不在 MVP 支持私有仓库
- 不修改渲染链路和编辑器
- 不新增 DB 表（MVP 阶段）
- 不改变现有手动粘贴流程
