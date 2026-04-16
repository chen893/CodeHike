'use client';

import { withBasePath } from '@/lib/base-path';
import type { SourceItemDraft } from '../drafts/create-draft-form-utils';
import {
  MAX_FILES_PER_REQUEST,
  MAX_LINES_PER_REQUEST,
  BATCH_DELAY_MS,
  RATE_LIMIT_BUFFER,
} from '@/lib/constants/github-import';

// ─── Types ──────────────────────────────────────────────────────────

export interface GitHubTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  sha?: string;
  children: GitHubTreeNode[];
}

export interface RepoTreeResponse {
  owner: string;
  repo: string;
  tree: GitHubTreeNode[];
  truncated: boolean;
  lazyNodes: { path: string; sha: string }[];
}

export interface GitHubFileResult {
  path: string;
  name: string;
  content: string;
  size: number;
  lines: number;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface FileContentResponse {
  owner: string;
  repo: string;
  totalLines: number;
  files: GitHubFileResult[];
  rateLimit: RateLimitInfo | null;
}

export interface GitHubFileFailure {
  path: string;
  message: string;
  code: string;
}

export interface BatchedImportResult {
  owner: string;
  repo: string;
  totalLines: number;
  files: GitHubFileResult[];
  failures: GitHubFileFailure[];
}

interface RawFileContentResult {
  status: number;
  data: FileContentResponse | null;
  failures: GitHubFileFailure[];
  errorMessage: string | null;
}

interface ApiErrorPayload {
  message?: string;
  failures?: GitHubFileFailure[];
  files?: GitHubFileResult[];
  totalLines?: number;
  owner?: string;
  repo?: string;
  rateLimit?: RateLimitInfo | null;
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

export async function fetchSubdirectory(
  url: string,
  sha: string,
  path: string,
): Promise<RepoTreeResponse> {
  const params = new URLSearchParams({ url, sha, path });
  const response = await fetch(
    withBasePath(`/api/github/repo-tree/subdirectory?${params}`),
  );

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, '获取子目录失败'));
  }

  return response.json() as Promise<RepoTreeResponse>;
}

/**
 * Low-level helper that returns the raw response alongside parsed data.
 * Does NOT throw on 207 (partial failure) — returns whatever the server sent.
 */
async function fetchFileContentsRaw(
  url: string,
  paths: string[],
): Promise<RawFileContentResult> {
  const response = await fetch(withBasePath('/api/github/file-content'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, paths }),
  });

  const readPayload = async (): Promise<ApiErrorPayload | null> => {
    try {
      return (await response.json()) as ApiErrorPayload;
    } catch {
      return null;
    }
  };

  // 207 Partial Failure — some files succeeded, some failed
  if (response.status === 207) {
    const payload = await readPayload();
    return {
      status: 207,
      data: {
        owner: payload?.owner ?? '',
        repo: payload?.repo ?? '',
        totalLines: payload?.totalLines ?? 0,
        files: payload?.files ?? [],
        rateLimit: payload?.rateLimit ?? null,
      },
      failures: payload?.failures ?? [],
      errorMessage: payload?.message ?? '部分文件获取失败',
    };
  }

  if (!response.ok) {
    const payload = await readPayload();
    return {
      status: response.status,
      data: payload
        ? {
            owner: payload.owner ?? '',
            repo: payload.repo ?? '',
            totalLines: payload.totalLines ?? 0,
            files: payload.files ?? [],
            rateLimit: payload.rateLimit ?? null,
          }
        : null,
      failures: payload?.failures ?? [],
      errorMessage: payload?.message ?? '获取文件内容失败',
    };
  }

  const data = (await response.json()) as FileContentResponse;
  return { status: 200, data, failures: [], errorMessage: null };
}

export function shouldRetryWithSmallerBatch(
  raw: RawFileContentResult,
  batch: string[],
): boolean {
  if (batch.length <= 1) return false;
  if (raw.status !== 400) return false;
  if (!raw.errorMessage) return false;
  return raw.errorMessage.includes('总行数') || raw.errorMessage.includes('超过上限');
}

function splitBatch(batch: string[]): [string[], string[]] {
  const midpoint = Math.ceil(batch.length / 2);
  return [batch.slice(0, midpoint), batch.slice(midpoint)];
}

function mergeBatchResult(
  left: BatchedImportResult,
  right: BatchedImportResult,
): BatchedImportResult {
  return {
    owner: left.owner || right.owner,
    repo: left.repo || right.repo,
    totalLines: left.totalLines + right.totalLines,
    files: [...left.files, ...right.files],
    failures: [...left.failures, ...right.failures],
  };
}

async function fetchBatchWithFallback(
  repoUrl: string,
  batch: string[],
): Promise<BatchedImportResult> {
  const raw = await fetchFileContentsRaw(repoUrl, batch);

  if (raw.status === 429) {
    throw new Error(raw.errorMessage ?? 'GitHub API 速率限制已耗尽，请稍后重试');
  }

  if (shouldRetryWithSmallerBatch(raw, batch)) {
    const [leftBatch, rightBatch] = splitBatch(batch);
    const leftResult = await fetchBatchWithFallback(repoUrl, leftBatch);
    const rightResult = await fetchBatchWithFallback(repoUrl, rightBatch);
    return mergeBatchResult(leftResult, rightResult);
  }

  if (raw.status >= 400 && raw.status !== 207) {
    throw new Error(raw.errorMessage ?? '获取文件内容失败');
  }

  return {
    owner: raw.data?.owner ?? '',
    repo: raw.data?.repo ?? '',
    totalLines: raw.data?.totalLines ?? 0,
    files: raw.data?.files ?? [],
    failures: raw.failures,
  };
}

/**
 * Single-batch file content fetch (backward compatible).
 * Throws on any non-success response.
 */
export async function fetchFileContents(url: string, paths: string[]): Promise<FileContentResponse> {
  const { status, data, errorMessage } = await fetchFileContentsRaw(url, paths);

  if (status === 207) {
    throw new Error(errorMessage ?? '部分文件获取失败');
  }

  if (!data) {
    throw new Error(errorMessage ?? '获取文件内容失败');
  }

  return data;
}

// ─── Batch helpers ──────────────────────────────────────────────────

/** Estimate lines for a single file path by walking the tree */
function estimateLinesFromPath(tree: GitHubTreeNode[], path: string): number {
  function walk(nodes: GitHubTreeNode[]): number {
    for (const node of nodes) {
      if (node.path === path && node.type === 'file') {
        return Math.ceil((node.size ?? 0) / 30);
      }
      if (node.type === 'directory') {
        const result = walk(node.children);
        if (result > 0) return result;
      }
    }
    return 0;
  }
  return walk(tree);
}

/**
 * Split an array of file paths into batches, respecting both
 * MAX_FILES_PER_REQUEST and MAX_LINES_PER_REQUEST limits.
 */
export function packFileContentBatches(
  paths: string[],
  tree: GitHubTreeNode[],
): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let estimatedLines = 0;

  for (const path of paths) {
    const fileLines = estimateLinesFromPath(tree, path);
    const wouldExceedFiles = current.length >= MAX_FILES_PER_REQUEST;
    const wouldExceedLines =
      current.length > 0 && estimatedLines + fileLines > MAX_LINES_PER_REQUEST;

    if (wouldExceedFiles || wouldExceedLines) {
      batches.push(current);
      current = [];
      estimatedLines = 0;
    }

    current.push(path);
    estimatedLines += fileLines;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

// ─── Batched import ─────────────────────────────────────────────────

/**
 * Fetch file contents in batches, automatically splitting by file count
 * and estimated line limits.
 *
 * - Reports progress via `onProgress(loaded, total)`.
 * - Aggregates partial failures (207) into `result.failures`.
 * - Handles rate-limit (429) by waiting until reset or throwing.
 */
export async function fetchFileContentsBatched(
  repoUrl: string,
  paths: string[],
  tree: GitHubTreeNode[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<BatchedImportResult> {
  const batches = packFileContentBatches(paths, tree);
  const allFiles: GitHubFileResult[] = [];
  const allFailures: GitHubFileFailure[] = [];
  let totalLines = 0;
  let owner = '';
  let repo = '';
  let loaded = 0;

  for (let i = 0; i < batches.length; i++) {
    const raw = await fetchFileContentsRaw(repoUrl, batches[i]);
    const retryWithSmallerBatch = shouldRetryWithSmallerBatch(raw, batches[i]);
    const result = retryWithSmallerBatch
      ? await fetchBatchWithFallback(repoUrl, batches[i])
      : {
          owner: raw.data?.owner ?? '',
          repo: raw.data?.repo ?? '',
          totalLines: raw.data?.totalLines ?? 0,
          files: raw.data?.files ?? [],
          failures: raw.failures,
        };

    if (raw.status === 429) {
      throw new Error(
        raw.errorMessage ?? 'GitHub API 速率限制已耗尽，请稍后重试',
      );
    }

    if (raw.status >= 400 && raw.status !== 207 && !retryWithSmallerBatch) {
      throw new Error(raw.errorMessage ?? '获取文件内容失败');
    }

    allFailures.push(...result.failures);
    allFiles.push(...result.files);
    totalLines += result.totalLines;
    owner = result.owner || owner;
    repo = result.repo || repo;

    // Check rate-limit remaining and optionally wait before next batch
    if (
      raw.data?.rateLimit &&
      raw.data.rateLimit.remaining <= RATE_LIMIT_BUFFER &&
      i < batches.length - 1
    ) {
      const resetAt = new Date(raw.data.rateLimit.resetAt).getTime();
      const waitMs = resetAt - Date.now() + 1000;

      if (waitMs > 0 && waitMs < 60_000) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      } else if (waitMs >= 60_000) {
        throw new Error(
          `GitHub API 速率限制即将耗尽，请在 ${new Date(resetAt).toLocaleTimeString()} 后重试`,
        );
      }
    }

    loaded += batches[i].length;
    onProgress?.(loaded, paths.length);

    // Delay between batches to be gentle on rate limit
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return {
    owner,
    repo,
    totalLines,
    files: allFiles,
    failures: allFailures,
  };
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

export function mergeSubdirectoryIntoTree(
  tree: GitHubTreeNode[],
  targetPath: string,
  children: GitHubTreeNode[],
): GitHubTreeNode[] {
  const resolvedChildren =
    children.length === 1 &&
    children[0].type === 'directory' &&
    children[0].path === targetPath
      ? children[0].children
      : children;

  return tree.map((node) => {
    if (node.path === targetPath) {
      return {
        ...node,
        children: resolvedChildren,
      };
    }

    if (node.type === 'directory' && targetPath.startsWith(node.path + '/')) {
      return {
        ...node,
        children: mergeSubdirectoryIntoTree(node.children, targetPath, resolvedChildren),
      };
    }

    return node;
  });
}

export function mergeLazyPathSet(
  currentLazyPaths: Set<string>,
  resolvedPath: string,
  nextLazyNodes: { path: string; sha: string }[],
): Set<string> {
  const next = new Set(currentLazyPaths);
  next.delete(resolvedPath);
  for (const node of nextLazyNodes) {
    next.add(node.path);
  }
  return next;
}
