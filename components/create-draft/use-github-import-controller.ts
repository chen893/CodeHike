'use client';

import { useState, useCallback } from 'react';
import {
  fetchRepoTree,
  fetchSubdirectory,
  fetchFileContentsBatched,
  fileResultsToSourceItems,
  getSelectedFileStats,
  mergeLazyPathSet,
  mergeSubdirectoryIntoTree,
  type GitHubTreeNode,
} from './github-client';
import type { SourceItemDraft } from '../drafts/create-draft-form-utils';
import { MAX_FILES_TOTAL, MAX_TOTAL_LINES } from '@/lib/constants/github-import';

// ─── Types ──────────────────────────────────────────────────────────

export type ImportPhase = 'idle' | 'loading-tree' | 'selecting' | 'loading-content' | 'done' | 'error';

export interface GitHubImportState {
  phase: ImportPhase;
  repoUrl: string;
  owner: string;
  repo: string;
  tree: GitHubTreeNode[];
  truncated: boolean;
  lazyPaths: Set<string>;
  loadingDirectoryPaths: Set<string>;
  selectedPaths: Set<string>;
  importedItems: SourceItemDraft[];
  error: string | null;
  totalLines: number;
  loadingProgress: { loaded: number; total: number } | null;
}

// ─── Controller ─────────────────────────────────────────────────────

export function useGitHubImportController() {
  const [state, setState] = useState<GitHubImportState>({
    phase: 'idle',
    repoUrl: '',
    owner: '',
    repo: '',
    tree: [],
    truncated: false,
    lazyPaths: new Set(),
    loadingDirectoryPaths: new Set(),
    selectedPaths: new Set(),
    importedItems: [],
    error: null,
    totalLines: 0,
    loadingProgress: null,
  });

  const setRepoUrl = useCallback((url: string) => {
    setState((prev) => ({
      ...prev,
      repoUrl: url,
      error: null,
      // Reset tree and selection when URL changes
      ...(url !== prev.repoUrl ? {
        phase: 'idle' as ImportPhase,
        tree: [],
        truncated: false,
        lazyPaths: new Set(),
        loadingDirectoryPaths: new Set(),
        selectedPaths: new Set(),
        owner: '',
        repo: '',
        importedItems: [],
        totalLines: 0,
      } : {}),
    }));
  }, []);

  const togglePath = useCallback((path: string) => {
    setState((prev) => {
      const newSet = new Set(prev.selectedPaths);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        if (newSet.size >= MAX_FILES_TOTAL) {
          return { ...prev, error: `最多选择 ${MAX_FILES_TOTAL} 个文件` };
        }
        newSet.add(path);
      }

      const stats = getSelectedFileStats(prev.tree, newSet);
      return {
        ...prev,
        selectedPaths: newSet,
        error: null,
        totalLines: stats.estimatedLines,
      };
    });
  }, []);

  const ensureDirectoryLoaded = useCallback(async (path: string, sha?: string) => {
    if (!sha || !state.lazyPaths.has(path)) {
      return state.tree;
    }

    if (state.loadingDirectoryPaths.has(path)) {
      return state.tree;
    }

    setState((prev) => ({
      ...prev,
      error: null,
      loadingDirectoryPaths: new Set(prev.loadingDirectoryPaths).add(path),
    }));

    try {
      const result = await fetchSubdirectory(state.repoUrl, sha, path);
      let nextTree = state.tree;

      setState((prev) => {
        nextTree = mergeSubdirectoryIntoTree(prev.tree, path, result.tree);
        const nextLazyPaths = mergeLazyPathSet(prev.lazyPaths, path, result.lazyNodes);
        const nextLoadingPaths = new Set(prev.loadingDirectoryPaths);
        nextLoadingPaths.delete(path);
        return {
          ...prev,
          tree: nextTree,
          lazyPaths: nextLazyPaths,
          loadingDirectoryPaths: nextLoadingPaths,
        };
      });

      return nextTree;
    } catch (err) {
      setState((prev) => {
        const nextLoadingPaths = new Set(prev.loadingDirectoryPaths);
        nextLoadingPaths.delete(path);
        return {
          ...prev,
          error: err instanceof Error ? err.message : '加载子目录失败',
          loadingDirectoryPaths: nextLoadingPaths,
        };
      });
      return state.tree;
    }
  }, [state.lazyPaths, state.loadingDirectoryPaths, state.repoUrl, state.tree]);

  const toggleDirectory = useCallback(async (path: string, sha?: string) => {
    const tree = await ensureDirectoryLoaded(path, sha);

    setState((prev) => {
      const dirNode = findNodeByPath(tree, path);
      if (!dirNode || dirNode.type !== 'directory') return prev;

      const dirFiles = collectFilePaths(dirNode);
      const allSelected = dirFiles.every((fp) => prev.selectedPaths.has(fp));

      const newSet = new Set(prev.selectedPaths);
      if (allSelected) {
        // Deselect all files in directory
        for (const fp of dirFiles) newSet.delete(fp);
      } else {
        // Select all files in directory (respecting max limit)
        for (const fp of dirFiles) {
          if (newSet.size >= MAX_FILES_TOTAL) break;
          newSet.add(fp);
        }
      }

      const stats = getSelectedFileStats(tree, newSet);
      return {
        ...prev,
        tree,
        selectedPaths: newSet,
        error: null,
        totalLines: stats.estimatedLines,
      };
    });
  }, [ensureDirectoryLoaded]);

  const expandDirectory = useCallback(async (path: string, sha?: string) => {
    await ensureDirectoryLoaded(path, sha);
  }, [ensureDirectoryLoaded]);

  const loadTree = useCallback(async () => {
    if (!state.repoUrl.trim()) return;

    setState((prev) => ({ ...prev, phase: 'loading-tree', error: null }));

    try {
      const result = await fetchRepoTree(state.repoUrl);
      setState((prev) => ({
        ...prev,
        phase: 'selecting',
        tree: result.tree,
        truncated: result.truncated,
        lazyPaths: new Set(result.lazyNodes.map((node) => node.path)),
        loadingDirectoryPaths: new Set(),
        owner: result.owner,
        repo: result.repo,
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err.message : '加载仓库失败',
        loadingDirectoryPaths: new Set(),
      }));
    }
  }, [state.repoUrl]);

  const importFiles = useCallback(async () => {
    if (state.selectedPaths.size === 0) return;

    // Check line limit estimate before fetching
    if (state.totalLines > MAX_TOTAL_LINES) {
      setState((prev) => ({
        ...prev,
        error: `选中的文件估计总行数 (${state.totalLines}) 超过上限 (${MAX_TOTAL_LINES})`,
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      phase: 'loading-content',
      error: null,
      loadingProgress: { loaded: 0, total: prev.selectedPaths.size },
    }));

    try {
      const paths = Array.from(state.selectedPaths);
      const result = await fetchFileContentsBatched(
        state.repoUrl,
        paths,
        state.tree,
        (loaded, total) => {
          setState((prev) => ({ ...prev, loadingProgress: { loaded, total } }));
        },
      );

      const items = fileResultsToSourceItems(result.files);

      const failureWarning =
        result.failures.length > 0
          ? `${result.failures.length} 个文件获取失败: ${result.failures.map((f) => f.path).join(', ')}`
          : null;

      setState((prev) => ({
        ...prev,
        phase: 'done',
        importedItems: items,
        totalLines: result.totalLines,
        loadingProgress: null,
        error: failureWarning,
      }));

      return items;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err.message : '导入文件失败',
        loadingProgress: null,
      }));
      return undefined;
    }
  }, [state.selectedPaths, state.repoUrl, state.totalLines, state.tree]);

  const reset = useCallback(() => {
    setState({
      phase: 'idle',
      repoUrl: '',
      owner: '',
      repo: '',
      tree: [],
      truncated: false,
      lazyPaths: new Set(),
      loadingDirectoryPaths: new Set(),
      selectedPaths: new Set(),
      importedItems: [],
      error: null,
      totalLines: 0,
      loadingProgress: null,
    });
  }, []);

  return {
    state,
    setRepoUrl,
    loadTree,
    togglePath,
    toggleDirectory,
    expandDirectory,
    importFiles,
    reset,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function findNodeByPath(nodes: GitHubTreeNode[], path: string): GitHubTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (path.startsWith(node.path + '/')) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function collectFilePaths(node: GitHubTreeNode): string[] {
  const paths: string[] = [];
  if (node.type === 'file') {
    paths.push(node.path);
  } else {
    for (const child of node.children) {
      paths.push(...collectFilePaths(child));
    }
  }
  return paths;
}
