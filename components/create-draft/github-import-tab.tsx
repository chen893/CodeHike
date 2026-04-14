'use client';

import { Search, Loader2, GitBranch, ArrowRight, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileTreeBrowser } from './file-tree-browser';
import { useGitHubImportController, type ImportPhase } from './use-github-import-controller';
import type { SourceItemDraft } from '../drafts/create-draft-form-utils';

// ─── Types ──────────────────────────────────────────────────────────

interface GitHubImportTabProps {
  onImportComplete: (items: SourceItemDraft[]) => void;
}

// ─── Main Component ─────────────────────────────────────────────────

export function GitHubImportTab({ onImportComplete }: GitHubImportTabProps) {
  const {
    state,
    setRepoUrl,
    loadTree,
    togglePath,
    toggleDirectory,
    importFiles,
    reset,
  } = useGitHubImportController();

  const handleImport = async () => {
    const items = await importFiles();
    if (items) {
      onImportComplete(items);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadTree();
    }
  };

  return (
    <div className="space-y-4">
      {/* URL Input */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-muted-foreground">GitHub 仓库地址</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <GitBranch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              className="pl-9 rounded-md"
              value={state.repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://github.com/owner/repo 或 owner/repo"
              disabled={state.phase === 'loading-tree' || state.phase === 'loading-content'}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={loadTree}
            disabled={
              !state.repoUrl.trim() ||
              state.phase === 'loading-tree' ||
              state.phase === 'loading-content'
            }
            className="gap-2 px-4"
          >
            {state.phase === 'loading-tree' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            浏览
          </Button>
        </div>
      </div>

      {/* Repository info */}
      {state.owner && state.repo && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          <span>
            {state.owner}/{state.repo}
          </span>
          <button
            type="button"
            onClick={reset}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* File tree (selecting phase) */}
      {(state.phase === 'selecting' || state.phase === 'loading-content' || state.phase === 'error') && state.tree.length > 0 && (
        <FileTreeBrowser
          tree={state.tree}
          selectedPaths={state.selectedPaths}
          onToggleFile={togglePath}
          onToggleDirectory={toggleDirectory}
          maxFiles={15}
          estimatedLines={state.totalLines}
          maxLines={1500}
        />
      )}

      {/* Import button */}
      {state.phase === 'selecting' && state.selectedPaths.size > 0 && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleImport}
            className="gap-2"
            disabled={state.phase !== 'selecting' || state.totalLines > 1500}
          >
            导入选中的 {state.selectedPaths.size} 个文件
            <ArrowRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            约 {state.totalLines} 行代码
          </span>
        </div>
      )}

      {/* Loading content state */}
      {state.phase === 'loading-content' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载文件内容...
        </div>
      )}

      {/* Done state */}
      {state.phase === 'done' && state.importedItems.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          已导入 {state.importedItems.length} 个文件（{state.totalLines} 行）
        </div>
      )}

      {/* Error state */}
      {state.error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {/* Help text */}
      {state.phase === 'idle' && (
        <div className="space-y-2 rounded-md bg-muted/50 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground/70">支持公开仓库</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>输入 GitHub 仓库 URL 或 owner/repo</li>
            <li>浏览仓库文件并选择需要的源码文件</li>
            <li>最多选择 15 个文件，总计不超过 1500 行</li>
            <li>支持 JavaScript、TypeScript、Python、Go、Rust 等语言</li>
          </ul>
        </div>
      )}
    </div>
  );
}
