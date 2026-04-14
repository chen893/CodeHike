import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

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
  children: GitHubTreeNode[];
}

export interface GitHubFileContent {
  name: string;
  path: string;
  content: string;
  encoding: string;
  size: number;
}

// ─── Token Retrieval ────────────────────────────────────────────────

export async function getGitHubTokenForUser(userId: string): Promise<string | null> {
  const result = await db
    .select({ access_token: accounts.access_token })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, 'github')))
    .limit(1);

  return result[0]?.access_token ?? null;
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

async function handleGitHubResponse<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error: GitHubApiError = {
      status: response.status,
      message: (body as Record<string, unknown>).message as string || response.statusText,
    };

    if (response.status === 404) {
      throw new GitHubRepoNotFoundError(context);
    }
    if (response.status === 403) {
      throw new GitHubRateLimitError(error.message);
    }
    throw new GitHubApiErrorImpl(response.status, `GitHub API 错误: ${error.message}`);
  }

  return response.json() as Promise<T>;
}

// ─── Error Types ────────────────────────────────────────────────────

export class GitHubRepoNotFoundError extends Error {
  constructor(repo: string) {
    super(`仓库不存在或无法访问: ${repo}`);
    this.name = 'GitHubRepoNotFoundError';
  }
}

export class GitHubRateLimitError extends Error {
  constructor(detail: string) {
    super(`GitHub API 速率限制: ${detail}`);
    this.name = 'GitHubRateLimitError';
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
export function parseRepoUrl(input: string): { owner: string; repo: string } | null {
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

/**
 * Fetch the file tree for a public GitHub repository.
 * Returns a flat list of tree items (files and directories).
 */
export async function getRepoTree(
  owner: string,
  repo: string,
  token?: string | null
): Promise<GitHubTreeItem[]> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/HEAD?recursive=1`;

  // Try with token first; fall back to unauthenticated for public repos if token is bad
  let response = await fetch(url, { headers: githubHeaders(token) });
  if (response.status === 401 && token) {
    response = await fetch(url, { headers: githubHeaders() });
  }

  const data = await handleGitHubResponse<GitHubTreeResponse>(response, `${owner}/${repo}`);

  if (data.truncated) {
    // Tree is too large; filter to keep only reasonable files
    return data.tree.filter(
      (item) => item.type === 'tree' || (item.type === 'blob' && (item.size ?? 0) <= 100_000)
    );
  }

  return data.tree;
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
    if (item.type === 'blob' && (item.size ?? 0) > 100_000) return false;
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
          // Directory
          let existing = currentLevel.find((n) => n.path === currentPath);
          if (!existing) {
            existing = {
              name: part,
              path: currentPath,
              type: 'directory',
              children: [],
            };
            currentLevel.push(existing);
          }
        }
      } else {
        let existing = currentLevel.find((n) => n.path === currentPath);
        if (!existing) {
          existing = {
            name: part,
            path: currentPath,
            type: 'directory',
            children: [],
          };
          currentLevel.push(existing);
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
 * Returns the decoded file content.
 */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  token?: string | null
): Promise<GitHubFileContent> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`;

  let response = await fetch(url, { headers: githubHeaders(token) });
  if (response.status === 401 && token) {
    response = await fetch(url, { headers: githubHeaders() });
  }

  const data = await handleGitHubResponse<GitHubContentResponse>(response, `${owner}/${repo}/${path}`);

  // GitHub returns content as base64
  const decoded = data.encoding === 'base64'
    ? Buffer.from(data.content, 'base64').toString('utf-8')
    : data.content;

  return {
    name: data.name,
    path: data.path,
    content: decoded,
    encoding: 'utf-8',
    size: data.size,
  };
}

/**
 * Fetch multiple files in parallel.
 * Returns results as a map of path → content.
 */
export async function getMultipleFileContents(
  owner: string,
  repo: string,
  paths: string[],
  token?: string | null
): Promise<Map<string, GitHubFileContent>> {
  const results = new Map<string, GitHubFileContent>();

  // Fetch in batches of 5 to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const responses = await Promise.allSettled(
      batch.map((path) => getFileContent(owner, repo, path, token))
    );

    for (let j = 0; j < responses.length; j++) {
      const result = responses[j];
      if (result.status === 'fulfilled') {
        results.set(batch[j], result.value);
      }
    }
  }

  return results;
}
