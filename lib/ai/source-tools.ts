/**
 * AI SDK tools for the retrieval-based generation pipeline.
 *
 * Three groups:
 *   1. createSourceTools()       — outline phase: AI explores source repo
 *   2. createScopedSourceTools() — step-fill phase: AI reads current code + original repo
 *   3. buildDirectorySummary()   — formatted tree for prompt injection
 *
 * Server-side only — no 'use client'.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { preprocessSource } from './source-preprocessor';
import type { TokenBudgetSession } from './token-budget';
import { estimateTokens } from './token-budget';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal shape needed by source tools — intentionally decoupled from
 * SourceItem in schemas/source-item.ts so the tools accept any compatible
 * object without creating a hard import dependency.
 */
interface SourceItemLike {
  label: string;
  content: string;
  language?: string;
}

// ---------------------------------------------------------------------------
// Outline-phase tools
// ---------------------------------------------------------------------------

/**
 * Create tools for the outline phase where AI explores the full source repo.
 * AI uses these to decide which files are important for the teaching path.
 */
export function createSourceTools(
  sourceItems: SourceItemLike[],
  options?: {
    maxFileReadTokens?: number;
    budget?: TokenBudgetSession;
  },
) {
  const maxFileTokens = options?.maxFileReadTokens ?? 15000;
  const budget = options?.budget;
  const fileMap = new Map(sourceItems.map((item) => [item.label, item]));

  return {
    readFile: tool({
      description:
        '读取指定源码文件的完整内容。当你需要了解某个文件的实现细节时使用。',
      inputSchema: z.object({
        path: z.string().describe('文件路径（如 src/index.ts）'),
      }),
      execute: async ({ path }: { path: string }) => {
        const item = fileMap.get(path);
        if (!item) return { error: `文件不存在: ${path}` };

        const tokens = estimateTokens(item.content);

        // Over single-file limit -> downgrade to structure summary
        if (tokens > maxFileTokens) {
          const preprocessed = preprocessSource(item);
          return {
            content: '(文件过大，已截断为结构摘要)',
            structure: preprocessed.structure,
            lineCount: preprocessed.lineCount,
            truncated: true,
          };
        }

        // Over budget -> refuse
        if (budget && !budget.canAfford(item.content)) {
          return {
            error: `token 预算已用尽 (${budget.remainingInputTokens} 剩余)，无法读取更多文件`,
          };
        }

        budget?.consume(item.content, `readFile:${path}`);
        return {
          content: item.content,
          language: item.language ?? 'unknown',
          lineCount: item.content.split('\n').length,
        };
      },
    }),

    listStructure: tool({
      description:
        '获取文件的结构摘要（函数/类/导出签名列表）。用于快速了解文件内容，不读全文。',
      inputSchema: z.object({
        path: z.string().describe('文件路径'),
      }),
      execute: async ({ path }: { path: string }) => {
        const item = fileMap.get(path);
        if (!item) return { error: `文件不存在: ${path}` };
        const preprocessed = preprocessSource(item);
        return {
          structure: preprocessed.structure,
          lineCount: preprocessed.lineCount,
        };
      },
    }),

    searchInFiles: tool({
      description:
        '在所有文件中搜索包含指定关键词的文件。用于找到相关模块。',
      inputSchema: z.object({
        keyword: z
          .string()
          .describe('搜索关键词（函数名、类名、import 路径等）'),
      }),
      execute: async ({ keyword }: { keyword: string }) => {
        const results: { path: string; matches: string[] }[] = [];
        for (const item of sourceItems) {
          const lines = item.content.split('\n');
          const matches = lines
            .filter((line) => line.includes(keyword))
            .map((line) => line.trim())
            .slice(0, 5);
          if (matches.length > 0) {
            results.push({ path: item.label, matches });
          }
          if (results.length >= 30) break;
        }
        return {
          results,
          totalFiles: results.length,
          truncated: results.length >= 30,
        };
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Step-fill-phase tools
// ---------------------------------------------------------------------------

/**
 * Create tools for the step-fill phase where AI works with current code state.
 * AI reads current file snapshots (after previous patches) and can also
 * reference the original source repo.
 */
export function createScopedSourceTools(
  originalSourceItems: SourceItemLike[],
  currentFiles: Record<string, string>,
  options?: {
    maxFileReadTokens?: number;
    budget?: TokenBudgetSession;
  },
) {
  const maxFileTokens = options?.maxFileReadTokens ?? 15000;
  const budget = options?.budget;
  const originalMap = new Map(
    originalSourceItems.map((item) => [item.label, item]),
  );

  return {
    readCurrentFile: tool({
      description:
        '读取上一步结束时某个文件的当前代码。生成 patch 前必须读取目标文件。',
      inputSchema: z.object({
        path: z.string().describe('文件路径'),
      }),
      execute: async ({ path }: { path: string }) => {
        const content = currentFiles[path];
        if (content === undefined)
          return { error: `文件不存在于当前快照: ${path}` };

        const tokens = estimateTokens(content);
        if (tokens > maxFileTokens) {
          const lines = content.split('\n').length;
          return {
            content: `(文件过大: ${lines} 行，已截断显示前 ${Math.floor(maxFileTokens / 3)} 行)`,
            truncated: true,
            lineCount: lines,
          };
        }

        if (budget && !budget.canAfford(content)) {
          return {
            error: `token 预算已用尽 (${budget.remainingInputTokens} 剩余)`,
          };
        }

        budget?.consume(content, `readCurrentFile:${path}`);
        return { content, lineCount: content.split('\n').length };
      },
    }),

    listCurrentStructure: tool({
      description: '查看当前代码文件结构摘要，不读取全文。',
      inputSchema: z.object({
        path: z.string().describe('文件路径'),
      }),
      execute: async ({ path }: { path: string }) => {
        const content = currentFiles[path];
        if (content === undefined)
          return { error: `文件不存在于当前快照: ${path}` };
        const preprocessed = preprocessSource({ label: path, content });
        return {
          structure: preprocessed.structure,
          lineCount: preprocessed.lineCount,
        };
      },
    }),

    readOriginalFile: tool({
      description:
        '读取原始仓库文件，仅用于理解完整实现或对齐最终目标。不能把原始文件内容当作 patch find 的依据。',
      inputSchema: z.object({
        path: z.string().describe('文件路径'),
      }),
      execute: async ({ path }: { path: string }) => {
        const item = originalMap.get(path);
        if (!item) return { error: `原始文件不存在: ${path}` };

        const tokens = estimateTokens(item.content);
        if (tokens > maxFileTokens) {
          const preprocessed = preprocessSource(item);
          return {
            content: '(原始文件过大，已截断为结构摘要)',
            structure: preprocessed.structure,
            lineCount: preprocessed.lineCount,
            truncated: true,
          };
        }

        if (budget && !budget.canAfford(item.content)) {
          return { error: `token 预算已用尽` };
        }

        budget?.consume(item.content, `readOriginalFile:${path}`);
        return {
          content: item.content,
          language: item.language ?? 'unknown',
          lineCount: item.content.split('\n').length,
        };
      },
    }),

    searchOriginalFiles: tool({
      description:
        '在原始仓库中搜索关键词，返回受限数量的匹配文件和片段。',
      inputSchema: z.object({
        keyword: z.string().describe('搜索关键词'),
      }),
      execute: async ({ keyword }: { keyword: string }) => {
        const results: { path: string; matches: string[] }[] = [];
        for (const item of originalSourceItems) {
          const lines = item.content.split('\n');
          const matches = lines
            .filter((line) => line.includes(keyword))
            .map((line) => line.trim())
            .slice(0, 5);
          if (matches.length > 0) {
            results.push({ path: item.label, matches });
          }
          if (results.length >= 20) break;
        }
        return {
          results,
          totalFiles: results.length,
          truncated: results.length >= 20,
        };
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// Directory summary
// ---------------------------------------------------------------------------

/**
 * Generate a formatted directory tree with structure summaries.
 * Replaces full source code injection in the outline prompt.
 *
 * Example output:
 *   src/
 *     index.ts          (45 lines)  -- export function main(), export const config
 *     router.ts         (120 lines) -- export function createRouter(), class Route
 *     utils/
 *       auth.ts         (80 lines)  -- export function authenticate(), export function hashPassword
 */
export function buildDirectorySummary(sourceItems: SourceItemLike[]): string {
  // Group files by directory
  const tree: Record<
    string,
    { path: string; lineCount: number; structure: string[] }[]
  > = {};

  for (const item of sourceItems) {
    const preprocessed = preprocessSource(item);
    const dir = item.label.includes('/')
      ? item.label.substring(0, item.label.lastIndexOf('/'))
      : '.';
    if (!tree[dir]) tree[dir] = [];
    tree[dir].push({
      path: item.label,
      lineCount: preprocessed.lineCount,
      structure: preprocessed.structure.slice(0, 5),
    });
  }

  let output = '';
  for (const [dir, files] of Object.entries(tree)) {
    output += `\n${dir}/\n`;
    for (const file of files) {
      const name = file.path.split('/').pop();
      const sigs = file.structure.join(', ') || '(无结构信息)';
      output += `  ${name!.padEnd(25)} (${file.lineCount} lines)  -- ${sigs}\n`;
    }
  }
  return output;
}
