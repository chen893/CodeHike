import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import type { TutorialOutline } from '../schemas/tutorial-outline';
import { findProgressivePlaceholderTargets } from './progressive-snapshot-base-code';
import { analyzeSourceCollectionShape } from '../utils/source-collection-shape';

const MAX_ORIGINAL_REFERENCE_CHARS = 20_000;

// ---------------------------------------------------------------------------
// Shared prompt fragments (reused by both legacy and retrieval paths)
// ---------------------------------------------------------------------------

function buildStepFillSystemPromptCore(
  stepIndex: number,
  isMultiFile: boolean,
): string {
  return `你正在生成一篇逐步构建式教程的第 ${stepIndex + 1} 步。

你必须输出严格的 JSON 格式，遵循以下结构：
{
  "id": "步骤id",
  "eyebrow": "步骤标签（可选）",
  "title": "步骤标题",
  "lead": "步骤导语（可选）",
  "paragraphs": ["段落1", "段落2"],
  "patches": [
    { "find": "精确的旧代码", "replace": "精确的新代码"${isMultiFile ? ', "file": "目标文件名"' : ''} }
  ],
  "focus": { "find": "要高亮的代码区域"${isMultiFile ? ', "file": "目标文件名"' : ''} },
  "marks": [
    { "find": "要标记的行", "color": "#颜色值"${isMultiFile ? ', "file": "目标文件名"' : ''} }
  ]
}

═══════════════════════════════════════
⚠️ 关键规则 — 必须严格遵守
═══════════════════════════════════════

## Patch 精确匹配规则（最重要！）

1. find 必须是"当前代码"中的**精确子串**，逐字逐字符匹配
2. find 在当前代码中必须**只出现一次**
3. patches 按数组顺序依次应用
4. find 必须从"当前代码"中逐字复制，不可凭记忆编造

## 叙事结构要求

paragraphs 必须遵循"问题 → 解决 → 收束"三段结构：
1. 第一段：描述当前代码的不足或新需求（为什么需要这一步）
2. （代码变化通过 patches 展示）
3. 第二段：解释代码解决了什么问题，与上一步的衔接

禁止的模式：
- 用"接下来我们添加 XX 功能"作为开头（应改为"当前的实现有一个问题：XX"）
- 只描述代码做了什么，不解释为什么
- 教科书式的平铺直叙

## 代码变化控制（严格遵守，违反会被拒绝）

- patches 的总代码变化必须控制在 {STEP_LOC_MIN}-{STEP_LOC_MAX} 行（find 和 replace 的行数差）
- 这是硬性约束，不是建议。如果本步需要超过 {STEP_LOC_MAX} 行变化，只实现最核心的部分
- 不要一次性添加完整函数——先添加核心逻辑，错误处理和边界检查留给后续步骤
- focus.find 指向本次变化的核心区域
- marks 标记关键的新增或修改行`;
}

// ---------------------------------------------------------------------------
// Legacy: full source injection
// ---------------------------------------------------------------------------

export function buildStepFillPrompt(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  outline: TutorialOutline,
  stepIndex: number,
  previousCodeOrFiles: string | Record<string, string>,
  errorMessage?: string
): { systemPrompt: string; userPrompt: string } {
  const outlineStep = outline.steps[stepIndex];
  const isMultiFile = typeof previousCodeOrFiles !== 'string';
  const sourceShape = analyzeSourceCollectionShape(sourceItems);

  let systemPrompt = buildStepFillSystemPromptCore(stepIndex, isMultiFile);
  if (sourceShape.mode === 'progressive_snapshots') {
    systemPrompt += `

## 渐进式快照序列（必须遵守）

输入源码是一组按阶段演进的快照，而不是普通并列模块。

- 当前步骤应尽量贴近相邻快照之间的真实能力差异
- 不要跨越多个里程碑一次性塞入大段架构
- 不要声称“完整”“自主”“企业级”等超出当前 patch 实际实现范围的结论
- lead 不能为空，paragraphs 里禁止出现“自动生成失败”“请手动编辑”这类元信息`;
  }

  const sourceCodeSection = sourceItems
    .map((item) => `### ${item.label}${item.language ? ` (${item.language})` : ''}\n\`\`\`\n${item.content}\n\`\`\``)
    .join('\n\n');

  const currentCodeSection = typeof previousCodeOrFiles === 'string'
    ? `\`\`\`${outline.meta.lang || ''}\n${previousCodeOrFiles}\n\`\`\``
    : Object.entries(previousCodeOrFiles)
        .map(([fileName, code]) => `### ${fileName}\n\`\`\`\n${code}\n\`\`\``)
        .join('\n\n');

  const sourceShapeSection = sourceShape.mode === 'progressive_snapshots'
    ? `## 源码形态分析
检测到这是一组渐进式快照序列：
${sourceShape.orderedLabels.map((label, index) => `${index + 1}. ${label}`).join('\n')}

本步应优先对齐这些里程碑之间的真实演进，而不是凭空跨越多个阶段。`
    : '';

  const userPrompt = `${sourceShapeSection ? `${sourceShapeSection}\n\n` : ''}## 教学目标
${outlineStep.teachingGoal}

## 引入的概念
${outlineStep.conceptIntroduced}

## 当前代码（上一步结束时的完整代码）
${currentCodeSection}

## 步骤在教程中的位置
- 教程标题：${outline.meta.title}
- 当前步骤：第 ${stepIndex + 1} / ${outline.steps.length} 步
- 前一步：${stepIndex > 0 ? outline.steps[stepIndex - 1].title : '（baseCode）'}
- 后一步：${stepIndex < outline.steps.length - 1 ? outline.steps[stepIndex + 1].title : '（最后一步）'}

## 教学意图
- 主题：${teachingBrief.topic}
- 目标读者水平：${teachingBrief.audience_level}
- 核心问题：${teachingBrief.core_question}
- 输出语言：${teachingBrief.output_language}

${
  errorMessage
    ? `## ⚠️ 上次生成失败的原因\n${errorMessage}\n\n请修正上述问题，确保 find 字段从"当前代码"中逐字精确复制。`
    : ''
}

## 要求
1. 先用 1-2 段话解释"为什么需要引入这个概念"（问题驱动）
2. 再展示代码变化（{STEP_LOC_MIN}-{STEP_LOC_MAX} 行）
3. 最后用 1 段话解释"这段代码解决了什么问题"（收束）
4. patch 的 find 必须从上面的"当前代码"中逐字复制
5. focus 指向本次变化的核心区域
6. 步骤 id 使用：${outlineStep.id}${isMultiFile ? '\n7. patches/focus/marks 必须指定 "file" 字段来指明操作哪个文件' : ''}`;

  return { systemPrompt, userPrompt };
}

// ---------------------------------------------------------------------------
// Retrieval: target files + scoped tools
// ---------------------------------------------------------------------------

export function buildRetrievalStepFillPrompt(
  sourceItems: SourceItem[],
  teachingBrief: TeachingBrief,
  outline: TutorialOutline,
  stepIndex: number,
  previousFiles: Record<string, string>,
  stepScope: { targetFiles: string[]; contextFiles: string[] },
  snapshotSummary: string,
  errorMessage?: string,
  options: { toolsEnabled?: boolean } = {},
): { systemPrompt: string; userPrompt: string } {
  const outlineStep = outline.steps[stepIndex];
  const isMultiFile = Object.keys(previousFiles).length > 1;
  const sourceShape = analyzeSourceCollectionShape(sourceItems);
  const placeholderTargets = findProgressivePlaceholderTargets(previousFiles, stepScope.targetFiles);
  const toolsEnabled = options.toolsEnabled ?? true;
  const sourceMap = new Map(sourceItems.map((item) => [item.label, item]));
  const originalReferenceFiles = [...new Set([...stepScope.targetFiles, ...stepScope.contextFiles])];
  const originalReferenceSection = originalReferenceFiles
    .map((file) => {
      const item = sourceMap.get(file);
      if (!item) return null;
      const content = item.content.length > MAX_ORIGINAL_REFERENCE_CHARS
        ? `${item.content.slice(0, MAX_ORIGINAL_REFERENCE_CHARS)}\n/* ...truncated... */`
        : item.content;
      return `### ${file}\n\`\`\`\n${content}\n\`\`\``;
    })
    .filter((value): value is string => Boolean(value))
    .join('\n\n');

  const core = buildStepFillSystemPromptCore(stepIndex, isMultiFile);

  const toolAddendum = toolsEnabled ? `

## 可用工具

你可以使用以下工具来读取代码：
- readCurrentFile(path)：读取上一步结束时某个文件的当前代码。生成 patch 前必须读取目标文件。
- listCurrentStructure(path)：查看当前代码文件结构摘要，不读取全文。
- readOriginalFile(path)：读取原始仓库文件，仅用于理解完整实现。
- searchOriginalFiles(keyword)：在原始仓库中搜索关键词。

规则：
- patches/focus/marks 只能作用于你已经精读过的当前代码文件。
- 如果要修改未注入的文件，先调用 readCurrentFile(path) 读取当前快照。
- readOriginalFile(path) 只用于理解原始仓库实现，不能把原始文件内容当作 patch find 的依据。` : `

## 无工具模式（必须遵守）

本轮不会提供读取工具。你已经拿到了当前目标文件代码和原始源码参考。

- 不要输出“我需要查看文件”“让我读取目录”之类的过程性文字
- 不要要求调用工具
- 直接基于下方已注入内容生成最终 JSON
- patch.find 必须来自“当前代码目标文件”，不能来自“原始源码参考”`;

  let systemPrompt = core + toolAddendum;
  if (sourceShape.mode === 'progressive_snapshots') {
    systemPrompt += `

## 渐进式快照序列（必须遵守）

当前输入是一组编号演进快照。

- targetFiles 应优先覆盖当前里程碑对应的真实文件
- patches 必须至少命中一个 targetFiles，不要为了方便而把所有变化都落到同一个主文件
- 如果 targetFiles 中存在占位文件，必须直接替换该目标文件的占位内容，而不是改动更早的文件来“代替”
- 若当前 patch 只是 stub、占位或未实现骨架，paragraphs 不得把它描述成“完整能力”
- lead 必须非空，paragraphs 不得包含任何生成失败或提示人工编辑的元信息`;
  }

  // Build current code section only for target files
  const targetCodeSection = stepScope.targetFiles
    .filter((f) => previousFiles[f] !== undefined)
    .map((f) => `### ${f}\n\`\`\`\n${previousFiles[f]}\n\`\`\``)
    .join('\n\n');

  const sourceShapeSection = sourceShape.mode === 'progressive_snapshots'
    ? `## 源码形态分析
检测到这是一组渐进式快照序列：
${sourceShape.orderedLabels.map((label, index) => `${index + 1}. ${label}`).join('\n')}

请优先围绕这些里程碑设计本步的真实变化。`
    : '';

  const userPrompt = `${sourceShapeSection ? `${sourceShapeSection}\n\n` : ''}## 教学目标
${outlineStep.teachingGoal}

## 引入的概念
${outlineStep.conceptIntroduced}

## 当前代码目标文件（上一步结束时）
${targetCodeSection || '（无注入文件，请使用 readCurrentFile 工具读取目标文件）'}

## 当前代码文件清单（摘要，不含全文）
${snapshotSummary}

## 本步文件锚点
- targetFiles: ${stepScope.targetFiles.length > 0 ? stepScope.targetFiles.join(', ') : '（未提供，默认回退到主文件）'}
- contextFiles: ${stepScope.contextFiles.length > 0 ? stepScope.contextFiles.join(', ') : '（无）'}${
  placeholderTargets.length > 0
    ? `\n- 占位目标文件: ${placeholderTargets.join(', ')}（本步必须替换这些文件中的占位内容）`
    : ''
}

## 原始源码参考（只能作为目标形态，不可作为 patch.find）
${originalReferenceSection || '（无额外原始源码参考）'}

## 步骤在教程中的位置
- 教程标题：${outline.meta.title}
- 当前步骤：第 ${stepIndex + 1} / ${outline.steps.length} 步
- 前一步：${stepIndex > 0 ? outline.steps[stepIndex - 1].title : '（baseCode）'}
- 后一步：${stepIndex < outline.steps.length - 1 ? outline.steps[stepIndex + 1].title : '（最后一步）'}

## 教学意图
- 主题：${teachingBrief.topic}
- 目标读者水平：${teachingBrief.audience_level}
- 核心问题：${teachingBrief.core_question}
- 输出语言：${teachingBrief.output_language}

${
  errorMessage
    ? `## ⚠️ 上次生成失败的原因\n${errorMessage}\n\n请修正上述问题，确保 find 字段从"当前代码"中逐字精确复制。`
    : ''
}

## 要求
1. 先用 1-2 段话解释"为什么需要引入这个概念"（问题驱动）
2. 再展示代码变化（{STEP_LOC_MIN}-{STEP_LOC_MAX} 行）
3. 最后用 1 段话解释"这段代码解决了什么问题"（收束）
4. patch 的 find 必须从当前代码中逐字复制（已注入或通过 readCurrentFile 读取）
5. focus 指向本次变化的核心区域
6. 如果提供了 targetFiles，至少有一条 patch 必须落在这些文件上
7. 步骤 id 使用：${outlineStep.id}${isMultiFile ? '\n8. patches/focus/marks 必须指定 "file" 字段来指明操作哪个文件' : ''}`;

  return { systemPrompt, userPrompt };
}

/**
 * Build a compact summary of all files in the current snapshot.
 * Shows file names + line counts, not full content.
 */
export function buildCurrentSnapshotSummary(
  currentFiles: Record<string, string>,
): string {
  return Object.entries(currentFiles)
    .map(([path, content]) => {
      const lines = content.split('\n').length;
      return `${path} (${lines} lines)`;
    })
    .join('\n');
}
