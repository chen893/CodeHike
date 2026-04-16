'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Loader2 } from 'lucide-react';
import type { GitHubTreeNode } from './github-client';

// ─── Types ──────────────────────────────────────────────────────────

interface FileTreeBrowserProps {
  tree: GitHubTreeNode[];
  truncated: boolean;
  lazyPaths: Set<string>;
  loadingDirectoryPaths: Set<string>;
  selectedPaths: Set<string>;
  onToggleFile: (path: string) => void;
  onToggleDirectory: (path: string, sha?: string) => Promise<void>;
  onExpandDirectory: (path: string, sha?: string) => Promise<void>;
  maxFiles: number;
  estimatedLines: number;
  maxLines: number;
}

// ─── Main Component ─────────────────────────────────────────────────

export function FileTreeBrowser({
  tree,
  truncated,
  lazyPaths,
  loadingDirectoryPaths,
  selectedPaths,
  onToggleFile,
  onToggleDirectory,
  onExpandDirectory,
  maxFiles,
  estimatedLines,
  maxLines,
}: FileTreeBrowserProps) {
  const selectedCount = selectedPaths.size;
  const isOverFiles = selectedCount > maxFiles;
  const isOverLines = estimatedLines > maxLines;
  const warnLines = maxLines * 0.75; // yellow warning at 75%
  const isWarnLines = !isOverLines && estimatedLines > warnLines;

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className={isOverFiles ? 'text-destructive font-medium' : 'text-muted-foreground'}>
            已选 {selectedCount}/{maxFiles} 文件
          </span>
          <span className={isOverLines ? 'text-destructive font-medium' : isWarnLines ? 'text-amber-600 font-medium' : 'text-muted-foreground'}>
            ~{estimatedLines}/{maxLines} 行
          </span>
        </div>
        {selectedCount > 0 && (
          <span className="text-primary font-medium">
            {selectedCount} 个文件待导入
          </span>
        )}
      </div>

      {truncated && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          大仓库已切换为按目录懒加载。展开目录时会继续向 GitHub 请求完整子树。
        </div>
      )}

      {/* Progress bar for line count */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isOverLines ? 'bg-destructive' : isWarnLines ? 'bg-amber-500' : 'bg-primary/60'
          }`}
          style={{ width: `${Math.min(100, (estimatedLines / maxLines) * 100)}%` }}
        />
      </div>

      {/* Tree */}
      <div className="max-h-[400px] overflow-y-auto rounded-md border border-border bg-background overscroll-contain">
        {tree.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            仓库为空
          </div>
        ) : (
          <div className="py-1">
            {tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                lazyPaths={lazyPaths}
                loadingDirectoryPaths={loadingDirectoryPaths}
                selectedPaths={selectedPaths}
                onToggleFile={onToggleFile}
                onToggleDirectory={onToggleDirectory}
                onExpandDirectory={onExpandDirectory}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tree Node ──────────────────────────────────────────────────────

interface TreeNodeProps {
  node: GitHubTreeNode;
  depth: number;
  lazyPaths: Set<string>;
  loadingDirectoryPaths: Set<string>;
  selectedPaths: Set<string>;
  onToggleFile: (path: string) => void;
  onToggleDirectory: (path: string, sha?: string) => Promise<void>;
  onExpandDirectory: (path: string, sha?: string) => Promise<void>;
}

function TreeNode({
  node,
  depth,
  lazyPaths,
  loadingDirectoryPaths,
  selectedPaths,
  onToggleFile,
  onToggleDirectory,
  onExpandDirectory,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isDirectory = node.type === 'directory';
  const isSelected = selectedPaths.has(node.path);
  const isLazyDirectory = isDirectory && lazyPaths.has(node.path);
  const isLoadingDirectory = isDirectory && loadingDirectoryPaths.has(node.path);

  // For directories: check if all children are selected
  const childPaths = isDirectory ? collectPaths(node) : [];
  const allChildrenSelected = isDirectory && childPaths.length > 0 && childPaths.every((p) => selectedPaths.has(p));
  const someChildrenSelected = isDirectory && childPaths.some((p) => selectedPaths.has(p));

  const handleToggle = useCallback(() => {
    if (isDirectory) {
      void onToggleDirectory(node.path, node.sha);
    } else {
      onToggleFile(node.path);
    }
  }, [isDirectory, node.path, node.sha, onToggleFile, onToggleDirectory]);

  const handleExpand = useCallback(async () => {
    if (isDirectory) {
      const nextExpanded = !expanded;
      setExpanded(nextExpanded);
      if (nextExpanded && isLazyDirectory) {
        await onExpandDirectory(node.path, node.sha);
      }
      if (!isMountedRef.current) return;
    }
  }, [expanded, isDirectory, isLazyDirectory, node.path, node.sha, onExpandDirectory]);

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 py-1 pr-3 text-sm hover:bg-muted/50 cursor-pointer ${
          isSelected || allChildrenSelected ? 'bg-primary/5' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleToggle}
      >
        {/* Expand/collapse chevron */}
        {isDirectory ? (
          <button
            type="button"
            className="flex-shrink-0 p-0"
            onClick={async (e) => {
              e.stopPropagation();
              await handleExpand();
            }}
          >
            {isLoadingDirectory ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-3.5 flex-shrink-0" />
        )}

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isDirectory ? allChildrenSelected : isSelected}
          ref={(el) => {
            if (el && isDirectory && someChildrenSelected && !allChildrenSelected) {
              el.indeterminate = true;
            }
          }}
          onChange={() => {}} // Handled by parent click
          className="h-3.5 w-3.5 rounded border-border flex-shrink-0 cursor-pointer"
          tabIndex={-1}
        />

        {/* Icon */}
        {isDirectory ? (
          expanded ? (
            <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
          )
        ) : (
          <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}

        {/* Name */}
        <span className="truncate text-foreground">{node.name}</span>

        {/* Size for files */}
        {node.type === 'file' && node.size != null && (
          <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">
            {formatSize(node.size)}
          </span>
        )}

        {/* File count for directories */}
        {isDirectory && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {isLazyDirectory && !isLoadingDirectory ? <span>展开加载</span> : null}
            <span>{childPaths.length} 文件</span>
          </div>
        )}
      </div>

      {/* Children */}
      {isDirectory && expanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              lazyPaths={lazyPaths}
              loadingDirectoryPaths={loadingDirectoryPaths}
              selectedPaths={selectedPaths}
              onToggleFile={onToggleFile}
              onToggleDirectory={onToggleDirectory}
              onExpandDirectory={onExpandDirectory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function collectPaths(node: GitHubTreeNode): string[] {
  if (node.type === 'file') return [node.path];
  return node.children.flatMap(collectPaths);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
