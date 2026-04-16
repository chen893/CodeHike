import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getRepoTree,
  buildFileTree,
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

    if (!url) {
      return NextResponse.json(
        { message: '缺少 url 参数', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const parsed = parseRepoUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { message: '无法解析仓库地址，请输入 GitHub 仓库 URL 或 owner/repo 格式', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    console.log('[github-import] repo-tree request', {
      hasSessionUser: Boolean(session?.user?.id),
      userId: session?.user?.id ?? null,
      repoUrl: url,
    });

    const token = session?.user?.id ? await getGitHubTokenForUser(session.user.id) : null;
    const treeResult = await getRepoTree(parsed.owner, parsed.repo, token);
    const fileTree = buildFileTree(treeResult.tree);

    return NextResponse.json({
      owner: parsed.owner,
      repo: parsed.repo,
      tree: fileTree,
      truncated: treeResult.truncated,
      lazyNodes: treeResult.lazyNodes,
    });
  } catch (err) {
    if (err instanceof GitHubRepoNotFoundError) {
      return NextResponse.json(
        { message: err.message, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }
    if (err instanceof GitHubRateLimitError) {
      return NextResponse.json(
        { message: err.message, code: 'RATE_LIMITED' },
        { status: 429 }
      );
    }
    if (err instanceof GitHubForbiddenError) {
      return NextResponse.json(
        { message: err.message, code: 'FORBIDDEN' },
        { status: 403 }
      );
    }
    console.error('获取仓库树失败:', err);
    return NextResponse.json(
      { message: '获取仓库文件树失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
