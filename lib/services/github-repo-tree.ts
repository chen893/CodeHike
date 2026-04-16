export interface RecursiveGitHubTreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  mode: string;
  size?: number;
  url: string;
}

export interface LazyNode {
  path: string;
  sha: string;
}

export interface RepoTreeResult {
  tree: RecursiveGitHubTreeItem[];
  truncated: boolean;
  lazyNodes: LazyNode[];
}

function prefixPath(rootPath: string, relativePath: string): string {
  return rootPath ? `${rootPath}/${relativePath}` : relativePath;
}

export function buildRepoTreeResult(
  items: RecursiveGitHubTreeItem[],
  truncated: boolean,
  rootPath = '',
): RepoTreeResult {
  const withPrefixedPaths = items.map((item) => ({
    ...item,
    path: prefixPath(rootPath, item.path),
  }));

  if (!truncated) {
    return { tree: withPrefixedPaths, truncated: false, lazyNodes: [] };
  }

  const depthBase = rootPath ? rootPath.split('/').length : 0;
  const visibleItems = withPrefixedPaths.filter((item) => {
    const depth = item.path.split('/').length - depthBase;
    return depth <= 2;
  });

  const lazyNodes = withPrefixedPaths
    .filter((item) => item.type === 'tree')
    .filter((item) => item.path.split('/').length - depthBase === 1)
    .map((item) => ({ path: item.path, sha: item.sha }));

  return {
    tree: visibleItems,
    truncated: true,
    lazyNodes,
  };
}
