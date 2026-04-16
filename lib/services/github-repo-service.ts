import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  GITHUB_API_BATCH_CONCURRENCY,
  MAX_FILE_BYTES,
  RETRY_ATTEMPTS,
} from '@/lib/constants/github-import';
import {
  buildRepoTreeResult,
  type RepoTreeResult,
  type LazyNode,
} from './github-repo-tree';

// ─── Types ───────────────────────────────────────────────────────────

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  size?: number;
  sha: string;
  url: string;
}

export interface GitHubTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  /** Git tree SHA for lazy loading subdirectories. Only present for directories in truncated trees. */
  sha?: string;
  children: GitHubTreeNode[];
}

export interface GitHubFileContent {
  name: string;
  path: string;
  content: string;
  encoding: string;
  size: number;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: Date;
}

export interface GitHubFileFailure {
  path: string;
  message: string;
  code: 'NOT_FOUND' | 'RATE_LIMITED' | 'DECODE_ERROR' | 'FORBIDDEN' | 'UNKNOWN';
}

export interface GitHubFileBatchResult {
  files: Map<string, GitHubFileContent>;
  failures: GitHubFileFailure[];
  rateLimit: RateLimitInfo | null;
}

export interface ParsedRepoUrl {
  owner: string;
  repo: string;
}

export interface SerializedGitHubFileContent {
  path: string;
  name: string;
  content: string;
  size: number;
  lines: number;
}

export interface SerializedGitHubFileBatchResult {
  owner: string;
  repo: string;
  totalLines: number;
  files: SerializedGitHubFileContent[];
  rateLimit: {
    remaining: number;
    limit: number;
    resetAt: string;
  } | null;
}

// ─── Token Retrieval ────────────────────────────────────────────────

export async function getGitHubTokenForUser(userId: string): Promise<string | null> {
  const result = await db
    .select({ access_token: accounts.access_token })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
    .limit(1);

  const token = result[0]?.access_token ?? null;
  console.log('[github-import] resolved token', {
    userId,
    hasToken: Boolean(token),
    tokenLength: token?.length ?? 0,
  });

  return token;
}

// ─── GitHub REST API Helpers ────────────────────────────────────────

const GITHUB_API_BASE = 'https://api.github.com';

function githubHeaders(token?: string | null): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'VibeDocs',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

interface GitHubApiError {
  status: number;
  message: string;
}

async function parseGitHubError(response: Response): Promise<GitHubApiError> {
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    message: (body as Record<string, unknown>).message as string || response.statusText,
  };
}

function isRateLimitedResponse(response: Response, message: string): boolean {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;

  const rateLimit = extractRateLimitInfo(response.headers);
  if (rateLimit.remaining <= 0) return true;

  const lowered = message.toLowerCase();
  return lowered.includes('rate limit') || lowered.includes('secondary rate limit') || lowered.includes('abuse detection');
}

async function handleGitHubResponse<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const error = await parseGitHubError(response);

    if (response.status === 404) {
      throw new GitHubRepoNotFoundError(context);
    }
    if (isRateLimitedResponse(response, error.message)) {
      throw new GitHubRateLimitError(error.message, extractRateLimitInfo(response.headers));
    }
    if (response.status === 403) {
      throw new GitHubForbiddenError(error.message);
    }
    throw new GitHubApiErrorImpl(response.status, `GitHub API 错误: ${error.message}`);
  }

  return response.json() as Promise<T>;
}

// ─── Rate Limit & Failure Helpers ────────────────────────────────────

function extractRateLimitInfo(headers: Headers): RateLimitInfo {
  return {
    remaining: parseInt(headers.get('X-RateLimit-Remaining') ?? '5000'),
    limit: parseInt(headers.get('X-RateLimit-Limit') ?? '5000'),
    resetAt: new Date(parseInt(headers.get('X-RateLimit-Reset') ?? '0') * 1000),
  };
}

function classifyFailure(err: unknown): GitHubFileFailure['code'] {
  if (err instanceof GitHubRepoNotFoundError) return 'NOT_FOUND';
  if (err instanceof GitHubRateLimitError) return 'RATE_LIMITED';
  if (err instanceof GitHubForbiddenError) return 'FORBIDDEN';
  if (err instanceof Error && err.message.includes('base64')) return 'DECODE_ERROR';
  return 'UNKNOWN';
}

function shouldFallbackWithoutToken(err: unknown): boolean {
  if (err instanceof GitHubForbiddenError) return true;
  if (err instanceof GitHubRepoNotFoundError) return true;
  return err instanceof GitHubApiErrorImpl && [401, 403, 404].includes(err.status);
}

function shouldRetryGitHubError(err: unknown): boolean {
  if (err instanceof GitHubRateLimitError) {
    if (!err.rateLimit) return true;
    return err.rateLimit.resetAt.getTime() - Date.now() <= 10_000;
  }

  return err instanceof GitHubApiErrorImpl && err.status >= 500;
}

function computeRetryDelayMs(err: unknown, attempt: number): number {
  if (err instanceof GitHubRateLimitError && err.rateLimit) {
    return Math.max(0, Math.min(err.rateLimit.resetAt.getTime() - Date.now() + 1000, 10_000));
  }

  return Math.min(1000 * 2 ** attempt, 5000);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Error Types ────────────────────────────────────────────────────

export class GitHubRepoNotFoundError extends Error {
  constructor(repo: string) {
    super(`仓库不存在或无法访问: ${repo}`);
    this.name = 'GitHubRepoNotFoundError';
  }
}

export class GitHubRateLimitError extends Error {
  rateLimit: RateLimitInfo | null;

  constructor(detail: string, rateLimit: RateLimitInfo | null = null) {
    super(`GitHub API 速率限制: ${detail}`);
    this.name = 'GitHubRateLimitError';
    this.rateLimit = rateLimit;
  }
}

export class GitHubForbiddenError extends Error {
  constructor(detail: string) {
    super(`GitHub API 拒绝访问: ${detail}`);
    this.name = 'GitHubForbiddenError';
  }
}

export class GitHubApiErrorImpl extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

// ─── Repo Tree ──────────────────────────────────────────────────────

interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

/**
 * Parse "owner/repo" from a GitHub URL or return the string as-is if already in that format.
 */
export function parseRepoUrl(input: string): ParsedRepoUrl | null {
  const trimmed = input.trim();

  // Direct "owner/repo" format
  const directMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (directMatch) {
    return { owner: directMatch[1], repo: directMatch[2] };
  }

  // Full GitHub URL
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname === 'github.com' || url.hostname === 'www.github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
      }
    }
  } catch {
    // Not a valid URL
  }

  return null;
}

async function requestGitHubJson<T>(
  url: string,
  context: string,
  token?: string | null
): Promise<{ data: T; rateLimit: RateLimitInfo }> {
  const tokenCandidates = token ? [token, null] : [null];
  let lastError: unknown = null;

  for (const currentToken of tokenCandidates) {
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, { headers: githubHeaders(currentToken) });
        const rateLimit = extractRateLimitInfo(response.headers);
        console.log('[github-import] github response', {
          context,
          url,
          attempt,
          usingToken: Boolean(currentToken),
          status: response.status,
          remaining: rateLimit.remaining,
          limit: rateLimit.limit,
          resetAt: rateLimit.resetAt.toISOString(),
        });
        const data = await handleGitHubResponse<T>(response, context);
        return { data, rateLimit };
      } catch (err) {
        lastError = err;
        console.warn('[github-import] github request failed', {
          context,
          url,
          attempt,
          usingToken: Boolean(currentToken),
          errorName: err instanceof Error ? err.name : typeof err,
          errorMessage: err instanceof Error ? err.message : String(err),
        });

        if (currentToken && shouldFallbackWithoutToken(err)) {
          console.warn('[github-import] falling back to anonymous GitHub request', {
            context,
            url,
          });
          break;
        }

        if (!shouldRetryGitHubError(err) || attempt === RETRY_ATTEMPTS - 1) {
          throw err;
        }

        await sleep(computeRetryDelayMs(err, attempt));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('GitHub 请求失败');
}

/**
 * Fetch the file tree for a public GitHub repository.
 * Returns a flat list of tree items along with truncation status.
 * When the tree is truncated, top-level directory SHAs are collected for lazy loading.
 */
export async function getRepoTree(
  owner: string,
  repo: string,
  token?: string | null
): Promise<RepoTreeResult> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/HEAD?recursive=1`;
  const { data } = await requestGitHubJson<GitHubTreeResponse>(url, `${owner}/${repo}`, token);

  return buildRepoTreeResult(data.tree, data.truncated);
}

/**
 * Convert flat tree items into a nested tree structure for UI rendering.
 * Filters out common non-code directories and large files.
 */
export function buildFileTree(items: GitHubTreeItem[]): GitHubTreeNode[] {
  // Filter out hidden dirs, common non-code dirs, and oversized files
  const filtered = items.filter((item) => {
    const parts = item.path.split('/');
    // Skip hidden directories and files (e.g., .git, .next)
    if (parts.some((p) => p.startsWith('.') && p !== '.github')) return false;
    // Skip common non-code directories
    if (parts.some((p) => ['node_modules', 'dist', 'build', '__pycache__', 'vendor', '.next'].includes(p))) return false;
    // Skip very large files (> 100KB)
    if (item.type === 'blob' && (item.size ?? 0) > MAX_FILE_BYTES) return false;
    return true;
  });

  const root: GitHubTreeNode[] = [];

  for (const item of filtered) {
    const parts = item.path.split('/');
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (isLast) {
        if (item.type === 'blob') {
          currentLevel.push({
            name: part,
            path: currentPath,
            type: 'file',
            size: item.size,
            children: [],
          });
        } else {
          // Directory — preserve SHA from tree item for lazy loading
          let existing = currentLevel.find((n) => n.path === currentPath);
          if (!existing) {
            existing = {
              name: part,
              path: currentPath,
              type: 'directory',
              sha: item.type === 'tree' ? item.sha : undefined,
              children: [],
            };
            currentLevel.push(existing);
          } else if (item.type === 'tree' && !existing.sha) {
            // Backfill SHA if the directory was created without one
            existing.sha = item.sha;
          }
        }
      } else {
        let existing = currentLevel.find((n) => n.path === currentPath);
        if (!existing) {
          existing = {
            name: part,
            path: currentPath,
            type: 'directory',
            sha: item.type === 'tree' ? item.sha : undefined,
            children: [],
          };
          currentLevel.push(existing);
        } else if (item.type === 'tree' && !existing.sha) {
          existing.sha = item.sha;
        }
        currentLevel = existing.children;
      }
    }
  }

  // Sort: directories first, then files, alphabetically within each group
  const sortNodes = (nodes: GitHubTreeNode[]): GitHubTreeNode[] => {
    return nodes
      .map((node) => ({
        ...node,
        children: sortNodes(node.children),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  };

  return sortNodes(root);
}

/**
 * Fetch the full tree for a subdirectory using its Git tree SHA.
 * Used for lazy-loading directories that were truncated in the initial response.
 */
export async function fetchSubdirectory(
  owner: string,
  repo: string,
  treeSha: string,
  rootPath: string,
  token?: string | null
): Promise<RepoTreeResult> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`;
  const { data } = await requestGitHubJson<GitHubTreeResponse>(url, `subdirectory ${treeSha}`, token);
  return buildRepoTreeResult(data.tree, data.truncated, rootPath);
}

// ─── File Content ───────────────────────────────────────────────────

interface GitHubContentResponse {
  name: string;
  path: string;
  content: string;
  encoding: string;
  size: number;
}

/**
 * Fetch the content of a single file from a public GitHub repository.
 * Returns the decoded file content and rate limit info from response headers.
 */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string | null
): Promise<{ content: GitHubFileContent; rateLimit: RateLimitInfo }> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`;
  const { data, rateLimit } = await requestGitHubJson<GitHubContentResponse>(
    url,
    `${owner}/${repo}/${path}`,
    token
  );

  // GitHub returns content as base64
  const decoded = data.encoding === 'base64'
    ? Buffer.from(data.content, 'base64').toString('utf-8')
    : data.content;

  return {
    content: {
      name: data.name,
      path: data.path,
      content: decoded,
      encoding: 'utf-8',
      size: data.size,
    },
    rateLimit,
  };
}

/**
 * Fetch multiple files in parallel.
 * Returns a batch result with successful files, failures, and rate limit info.
 */
export async function getMultipleFileContents(
  owner: string,
  repo: string,
  paths: string[],
  token?: string | null
): Promise<GitHubFileBatchResult> {
  const files = new Map<string, GitHubFileContent>();
  const failures: GitHubFileFailure[] = [];
  let rateLimit: RateLimitInfo | null = null;

  const batchSize = GITHUB_API_BATCH_CONCURRENCY;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const responses = await Promise.allSettled(
      batch.map((path) => getFileContent(owner, repo, path, token))
    );

    for (let j = 0; j < responses.length; j++) {
      const result = responses[j];
      if (result.status === 'fulfilled') {
        files.set(batch[j], result.value.content);
        rateLimit = result.value.rateLimit;
      } else {
        const reason = result.reason;
        failures.push({
          path: batch[j],
          message: reason?.message ?? 'Unknown error',
          code: classifyFailure(reason),
        });
      }
    }
  }

  return { files, failures, rateLimit };
}

export function serializeGitHubFileBatchResult(
  owner: string,
  repo: string,
  result: GitHubFileBatchResult
): SerializedGitHubFileBatchResult {
  let totalLines = 0;
  const files = Array.from(result.files.entries()).map(([path, content]) => {
    const lines = content.content.split('\n').length;
    totalLines += lines;
    return {
      path,
      name: content.name,
      content: content.content,
      size: content.size,
      lines,
    };
  });

  return {
    owner,
    repo,
    totalLines,
    files,
    rateLimit: result.rateLimit
      ? {
          remaining: result.rateLimit.remaining,
          limit: result.rateLimit.limit,
          resetAt: result.rateLimit.resetAt.toISOString(),
        }
      : null,
  };
}
