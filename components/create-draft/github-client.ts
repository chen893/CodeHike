'use client';

import { withBasePath } from '@/lib/base-path';
import type { SourceItemDraft } from '../drafts/create-draft-form-utils';

// ─── Types ──────────────────────────────────────────────────────────

export interface GitHubTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children: GitHubTreeNode[];
}

export interface RepoTreeResponse {
  owner: string;
  repo: string;
  tree: GitHubTreeNode[];
}

export interface GitHubFileResult {
  path: string;
  name: string;
  content: string;
  size: number;
  lines: number;
}

export interface FileContentResponse {
  owner: string;
  repo: string;
  totalLines: number;
  files: GitHubFileResult[];
}

// ─── API Calls ──────────────────────────────────────────────────────

async function readApiErrorMessage(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as Partial<{ message: string }>;
    return typeof payload.message === 'string' ? payload.message : fallback;
  } catch {
    return fallback;
  }
}

export async function fetchRepoTree(url: string): Promise<RepoTreeResponse> {
  const response = await fetch(withBasePath(`/api/github/repo-tree?url=${encodeURIComponent(url)}`));

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, '获取仓库文件树失败'));
  }

  return response.json() as Promise<RepoTreeResponse>;
}

export async function fetchFileContents(url: string, paths: string[]): Promise<FileContentResponse> {
  const response = await fetch(withBasePath('/api/github/file-content'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, paths }),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, '获取文件内容失败'));
  }

  return response.json() as Promise<FileContentResponse>;
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Detect language from file extension */
function detectLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
  };
  return map[ext] ?? ext;
}

/** Convert GitHub file results to SourceItemDraft[] */
export function fileResultsToSourceItems(files: GitHubFileResult[]): SourceItemDraft[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    label: file.path,
    language: detectLanguage(file.name),
    content: file.content,
  }));
}

/** Flatten tree to get all file paths */
export function flattenFilePaths(node: GitHubTreeNode[]): string[] {
  const paths: string[] = [];
  function walk(n: GitHubTreeNode[]) {
    for (const item of n) {
      if (item.type === 'file') {
        paths.push(item.path);
      } else {
        walk(item.children);
      }
    }
  }
  walk(node);
  return paths;
}

/** Count files in a tree */
export function countFilesInTree(nodes: GitHubTreeNode[]): number {
  let count = 0;
  function walk(n: GitHubTreeNode[]) {
    for (const item of n) {
      if (item.type === 'file') count++;
      else walk(item.children);
    }
  }
  walk(nodes);
  return count;
}

/** Count selected files and estimate total size from tree */
export function getSelectedFileStats(
  tree: GitHubTreeNode[],
  selectedPaths: Set<string>
): { count: number; estimatedLines: number } {
  let count = 0;
  let estimatedLines = 0;

  function walk(nodes: GitHubTreeNode[]) {
    for (const node of nodes) {
      if (node.type === 'file' && selectedPaths.has(node.path)) {
        count++;
        // Rough estimate: ~30 bytes per line for typical code
        estimatedLines += Math.ceil((node.size ?? 0) / 30);
      } else if (node.type === 'directory') {
        walk(node.children);
      }
    }
  }

  walk(tree);
  return { count, estimatedLines };
}
