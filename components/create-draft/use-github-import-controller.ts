'use client';

import { useState, useCallback } from 'react';
import {
  fetchRepoTree,
  fetchFileContents,
  fileResultsToSourceItems,
  getSelectedFileStats,
  type GitHubTreeNode,
} from './github-client';
import type { SourceItemDraft } from '../drafts/create-draft-form-utils';
import { GITHUB_IMPORT_MAX_FILES, GITHUB_IMPORT_MAX_TOTAL_LINES } from '@/lib/constants';

// ─── Types ──────────────────────────────────────────────────────────

export type ImportPhase = 'idle' | 'loading-tree' | 'selecting' | 'loading-content' | 'done' | 'error';

export interface GitHubImportState {
  phase: ImportPhase;
  repoUrl: string;
  owner: string;
  repo: string;
  tree: GitHubTreeNode[];
  selectedPaths: Set<string>;
  importedItems: SourceItemDraft[];
  error: string | null;
  totalLines: number;
}

// ─── Controller ─────────────────────────────────────────────────────

export function useGitHubImportController() {
  const [state, setState] = useState<GitHubImportState>({
    phase: 'idle',
    repoUrl: '',
    owner: '',
    repo: '',
    tree: [],
    selectedPaths: new Set(),
    importedItems: [],
    error: null,
    totalLines: 0,
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
        if (newSet.size >= GITHUB_IMPORT_MAX_FILES) {
          return { ...prev, error: `最多选择 ${GITHUB_IMPORT_MAX_FILES} 个文件` };
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

  const toggleDirectory = useCallback((path: string, nodes: GitHubTreeNode[]) => {
    setState((prev) => {
      const dirNode = findNodeByPath(nodes, path);
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
          if (newSet.size >= GITHUB_IMPORT_MAX_FILES) break;
          newSet.add(fp);
        }
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

  const loadTree = useCallback(async () => {
    if (!state.repoUrl.trim()) return;

    setState((prev) => ({ ...prev, phase: 'loading-tree', error: null }));

    try {
      const result = await fetchRepoTree(state.repoUrl);
      setState((prev) => ({
        ...prev,
        phase: 'selecting',
        tree: result.tree,
        owner: result.owner,
        repo: result.repo,
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err.message : '加载仓库失败',
      }));
    }
  }, [state.repoUrl]);

  const importFiles = useCallback(async () => {
    if (state.selectedPaths.size === 0) return;

    // Check line limit estimate before fetching
    if (state.totalLines > GITHUB_IMPORT_MAX_TOTAL_LINES) {
      setState((prev) => ({
        ...prev,
        error: `选中的文件估计总行数 (${state.totalLines}) 超过上限 (${GITHUB_IMPORT_MAX_TOTAL_LINES})`,
      }));
      return;
    }

    setState((prev) => ({ ...prev, phase: 'loading-content', error: null }));

    try {
      const paths = Array.from(state.selectedPaths);
      const result = await fetchFileContents(state.repoUrl, paths);
      const items = fileResultsToSourceItems(result.files);

      setState((prev) => ({
        ...prev,
        phase: 'done',
        importedItems: items,
        totalLines: result.totalLines,
        error: null,
      }));

      return items;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        phase: 'error',
        error: err instanceof Error ? err.message : '导入文件失败',
      }));
      return undefined;
    }
  }, [state.selectedPaths, state.repoUrl, state.totalLines]);

  const reset = useCallback(() => {
    setState({
      phase: 'idle',
      repoUrl: '',
      owner: '',
      repo: '',
      tree: [],
      selectedPaths: new Set(),
      importedItems: [],
      error: null,
      totalLines: 0,
    });
  }, []);

  return {
    state,
    setRepoUrl,
    loadTree,
    togglePath,
    toggleDirectory,
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
