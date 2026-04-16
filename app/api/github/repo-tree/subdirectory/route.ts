import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  buildFileTree,
  fetchSubdirectory,
  parseRepoUrl,
  getGitHubTokenForUser,
  GitHubForbiddenError,
  GitHubRepoNotFoundError,
  GitHubRateLimitError,
} from '@/lib/services/github-repo-service';

export async function GET(req: Request) {
  try {
    const session = await auth();

    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const sha = searchParams.get('sha');
    const path = searchParams.get('path');

    if (!url || !sha) {
      return NextResponse.json(
        { message: '缺少 url 或 sha 参数', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const parsed = parseRepoUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { message: '无法解析仓库地址', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const token = session?.user?.id ? await getGitHubTokenForUser(session.user.id) : null;
    const rootPath = path ?? '';
    const treeResult = await fetchSubdirectory(parsed.owner, parsed.repo, sha, rootPath, token);

    const subtree = buildFileTree(treeResult.tree);
    const tree =
      rootPath && subtree.length === 1 && subtree[0]?.path === rootPath
        ? subtree[0].children
        : subtree;

    return NextResponse.json({
      owner: parsed.owner,
      repo: parsed.repo,
      path: rootPath,
      sha,
      tree,
      truncated: treeResult.truncated,
      lazyNodes: treeResult.lazyNodes,
    });
  } catch (err) {
    if (err instanceof GitHubRepoNotFoundError) {
      return NextResponse.json(
        { message: err.message, code: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    if (err instanceof GitHubRateLimitError) {
      return NextResponse.json(
        { message: err.message, code: 'RATE_LIMITED' },
        { status: 429 },
      );
    }
    if (err instanceof GitHubForbiddenError) {
      return NextResponse.json(
        { message: err.message, code: 'FORBIDDEN' },
        { status: 403 },
      );
    }
    console.error('获取子目录失败:', err);
    return NextResponse.json(
      { message: '获取子目录失败', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
