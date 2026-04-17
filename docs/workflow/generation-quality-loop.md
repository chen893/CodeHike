# Generation Quality Loop

> 用于持续改进教程生成质量的标准工作流。目标不是“感觉更好”，而是用统一 rubric、可追溯 CSV 和可回退的实验节奏，把 prompt / 流程改进变成可比较的工程循环。

---

## 1. 目标

每轮循环都要回答四个问题：

1. 当前生成结果到底几分，差在哪里？
2. 这些问题更像是 `outline prompt`、`step-fill prompt`，还是 pipeline / validation 的问题？
3. 本轮只改一个方向，改完后分数是变好还是变差？
4. 是否已经达到结束条件，可以停止继续调 prompt？

---

## 2. 标准评分体系

总分 `0-100`，由以下 6 个维度组成：

| 维度 | 权重 | 评估内容 |
|------|------|----------|
| `contentIntegrity` | 25% | 是否存在失败占位内容、坏链步骤、明显伪代码/元信息泄漏 |
| `pedagogicalProgression` | 20% | 认知递进是否成立，lead/paragraphs 是否完整，章节是否顺滑 |
| `sourceCoverage` | 20% | 输入源码是否被真实覆盖，是否出现多文件塌缩、单文件过度集中 |
| `scrollytellingReadiness` | 15% | `patches/focus/marks/lead` 是否足够支撑阅读和滚动代码展示 |
| `publishReadiness` | 10% | 最终校验是否通过，是否还残留明显不可发布内容 |
| `promptAlignment` | 10% | 当前问题是否表明 prompt 约束失效或流程兜底放水 |

### Critical blocker

以下任一问题出现，默认视为 `critical`：

- 步骤正文包含“自动生成失败 / 请手动编辑 / Failed to parse JSON”之类占位内容
- 最终 `validationValid = false`
- 无法组装出可评估的 `tutorialDraft`

---

## 3. 量化结束条件

循环结束必须同时满足：

- `totalScore >= 90`
- `contentIntegrity >= 90`
- `sourceCoverage >= 90`
- `publishReadiness >= 90`
- `critical issue count = 0`

只满足总分，不满足 blocker 条件，不能停。

---

## 4. 每轮执行步骤

### 4.1 建立 baseline

先对已有草稿做一次标准 review：

```bash
npm run review:generation -- \
  --draft-id <draftId> \
  --variant baseline-current-draft \
  --mode existing \
  --round r0 \
  --change-summary "baseline review before prompt/flow changes"
```

产物：

- `dataset/generation-quality-loop.csv`
- `dataset/generation-quality-reports/<runId>.json`

### 4.2 读分数，不直接改代码

先看 report 里的：

- `scorecard`
- `issues[].code`
- `promptReview`
- `stopCondition`

把问题分类到三个层次之一：

- `outline`：认知弧线、章节划分、source scope、baseCode 选择错误
- `step_fill`：lead/paragraphs/patch/focus/marks 质量差，文件锚定漂移
- `pipeline`：失败步骤被兜底吞掉、validation 放过坏内容、错误恢复策略不对

### 4.3 一轮只改一个方向

推荐方向示例：

- `prompt-outline-progressive-snapshots`
- `prompt-step-fill-file-anchoring`
- `pipeline-stop-on-step-fill-exhaustion`
- `validation-reject-placeholder-steps`

不要一轮同时改多个互相耦合的方向，否则评分变好/变坏都无法归因。

### 4.4 重新生成并复评

```bash
npm run review:generation -- \
  --draft-id <draftId> \
  --variant <variant-name> \
  --mode generate \
  --model deepseek-chat \
  --parent-run-id <baselineRunId> \
  --round r1 \
  --change-summary "<what changed>" \
  --next-direction "<what to try next if this works>"
```

脚本会：

- 直接调用多阶段生成链路
- 产出新的 review report
- 和上一轮比较
- 自动给出 `baseline / keep / revert` 建议
- 追加一行到 CSV

### 4.5 根据结果决定保留还是回退

- 如果 `recommendedDecision = keep`，而且关键维度变好：保留本轮改动，继续沿当前方向细化
- 如果 `recommendedDecision = revert`：回退本轮改动，换一个方向

禁止“明知变差还继续叠 prompt”。

---

## 5. CSV 字段约定

`dataset/generation-quality-loop.csv` 至少包含这些字段：

- `run_id`
- `round`
- `mode`
- `draft_id`
- `variant`
- `parent_run_id`
- `decision`
- `total_score`
- 6 个分项分数
- `critical_issue_count`
- `major_issue_count`
- `placeholder_step_count`
- `source_coverage_ratio`
- `patch_file_coverage_ratio`
- `patch_concentration_ratio`
- `validation_valid`
- `stop_condition_met`
- `issues`
- `prompt_files`
- `change_summary`
- `next_direction`
- `decision_reason`

这张表是 prompt / 流程实验的事实记录，不是主观会议纪要。

---

## 6. 常见问题与归因建议

| 问题代码 | 优先检查 |
|---------|----------|
| `PLACEHOLDER_STEP_CONTENT` | `lib/ai/step-fill-prompt.ts`, `lib/ai/multi-phase-generator.ts`, `lib/utils/validation.ts` |
| `SOURCE_COVERAGE_COLLAPSE` | `lib/ai/outline-prompt.ts`, `lib/ai/step-fill-prompt.ts`, `lib/ai/progressive-snapshot-base-code.ts`, `lib/ai/multi-phase-generator.ts` |
| `PATCH_FILE_CONCENTRATION` | `lib/ai/step-fill-prompt.ts`, `lib/ai/multi-phase-generator.ts` |
| `SCROLLY_METADATA_GAPS` | `lib/ai/step-fill-prompt.ts` |
| `PUBLISH_VALIDATION_FAILED` | `lib/utils/validation.ts`, `lib/services/generate-tutorial-draft.ts` |
| `OUTLINE_SOURCE_SCOPE_MISSING` | `lib/ai/outline-prompt.ts`, `lib/ai/outline-source-scope.ts` |

---

## 7. 当前落地文件

- `lib/review/generation-quality-review.ts` — 标准 review rubric 与 keep/revert 建议
- `lib/utils/source-collection-shape.ts` — 输入源码形态分析（普通多文件 / 渐进式快照）
- `scripts/generation-quality-loop.ts` — review + CSV + JSON report CLI
- `dataset/generation-quality-loop.csv` — 每轮实验记录
- `dataset/generation-quality-reports/*.json` — 每轮完整报告

---

## 8. 实施原则

- Review 结论优先于直觉
- Prompt 调整和流程调整分开归因
- 一轮只改一个方向
- 变差就回退
- 分数达标才停止
