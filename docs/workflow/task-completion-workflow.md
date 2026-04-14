# Task Completion Workflow

你是主 Agent，负责把路线图中的一个明确版本或任务包拆成可执行子任务，并按串行闭环完成交付。

本 workflow 通常在 `docs/workflow/roadmap-generation-workflow.md` 完成后使用。不要把整份路线图一次性当作执行任务；每次只处理一个阶段、一个版本目标，或一个边界清晰的任务包。

## 输入要求

开始前必须明确以下输入：

- `roadmap_file`：路线图主文件，格式应为 `docs/<run_id>.md`，例如 `docs/20260414-roadmap-post-current.md`
- `target_scope`：本次要执行的范围，例如 `近期版本 / VNext / v3.9-auth-hardening`
- `success_criteria`：本次完成后怎样判定任务通过
- `commit_policy`：是否需要在完成后提交 commit；未明确要求时，不自动提交

如果用户没有给出 `roadmap_file`，先在 `docs/` 下查找最新的 `*-roadmap-*.md`，并在执行记录中写明使用的是哪一个文件。

## 范围收敛

1. 先阅读 `roadmap_file`，只提取与 `target_scope` 相关的目标、前置依赖、风险和不做事项。
2. 如果 `target_scope` 仍然过大，必须先拆成多个任务包，并选择最靠前、依赖最少、可独立验证的任务包执行。
3. 不要把路线图里的中期、后续版本顺手提前做掉。
4. 不要因为实现时发现相邻问题就扩大范围；除非它是当前任务的阻塞依赖。
5. 如果路线图和当前代码现状冲突，以当前代码为准，并在执行记录中标注偏差和处理方式。

## 执行记录命名

每次执行生成一个 `task_run_id`，格式为 `<YYYYMMDD>-task-<scope>`：

- `YYYYMMDD` 使用执行当天日期
- `scope` 使用小写 kebab-case，描述本次任务范围
- 示例：`20260414-task-vnext-quality-baseline`

执行记录写入：

```text
docs/task-runs/<task_run_id>.md
```

记录文件至少包含：

- 使用的 `roadmap_file`
- 本次 `target_scope`
- 任务拆分
- 每个子任务的状态
- Review / Fix / Verify 结果
- 未完成项、风险和后续建议

不要使用 `task.md`、`todo.md`、`final.md`、`implementation.md` 等临时名。

## 子任务执行规则

1. 先拆解整体任务，明确子任务顺序和依赖关系。
2. 每个子任务开始前，子 Agent 必须先输出：
   - Task Understanding
   - Plan
   - Completion Criteria
3. 未输出 Plan 和 Completion Criteria 前，不得开始实施。
4. 子任务完成后，必须依次经过：
   - Implementation Summary：说明实际改了什么
   - Review：审查实现、代码质量、分层边界和回归风险
   - Fix：修复 Review 中发现的问题
   - Verify：验证功能、边界、回归和完成指标
5. 只有当前子任务满足以下全部条件后，才能进入下一个子任务：
   - 实现完成
   - Review 完成
   - 必须修复的问题已修复
   - Verify 通过，或明确说明无法验证的外部条件
   - 达到 Completion Criteria
6. 如果当前子任务未通过验证，禁止启动下一个子任务。
7. 子 Agent 必须严格限制在当前任务范围内，不得擅自扩展任务边界。
8. 主 Agent 必须以高质量闭环交付为目标，而不是追求表面完成。

每个子任务都必须输出：

- Task Understanding
- Plan
- Completion Criteria
- Implementation Summary
- Review
- Fix
- Verify
- Final Status（PASS / BLOCKED）

只有 `Final Status = PASS`，才允许进入下一个子任务。

## 验证要求

验证方式按改动风险选择：

- 触及纯函数、patch 链、schema、分层边界：优先补或运行 `npm test`
- 触及 Next.js 页面、route handler、Server Component：优先运行相关构建或最小可行检查
- 触及客户端交互：优先运行对应页面手动检查或 Playwright/截图检查
- 触及 DB schema、迁移、外部服务：说明所需环境变量、未执行项和替代验证
- 纯文档修改：检查链接、文件路径、命名规则和与现有文档是否冲突

如果因为缺少 `DATABASE_URL`、`DEEPSEEK_API_KEY` 或外部服务导致无法完整验证，必须在执行记录和最终回复中写清楚。

## 收尾要求

1. 更新执行记录 `docs/task-runs/<task_run_id>.md`。
2. 汇总修改文件、验证结果、未完成风险。
3. 如果 `commit_policy` 明确要求提交，先展示待提交变更范围，再创建 commit。
4. 如果没有明确要求提交，不自动 commit，只输出可提交变更摘要。
