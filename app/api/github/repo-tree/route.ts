import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getRepoTree,
  buildFileTree,
  parseRepoUrl,
  getGitHubTokenForUser,
  GitHubRepoNotFoundError,
  GitHubRateLimitError,
} from '@/lib/services/github-repo-service';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

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

    const token = await getGitHubTokenForUser(session.user.id);
    const treeItems = await getRepoTree(parsed.owner, parsed.repo, token);
    const fileTree = buildFileTree(treeItems);

    return NextResponse.json({
      owner: parsed.owner,
      repo: parsed.repo,
      tree: fileTree,
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
    console.error('获取仓库树失败:', err);
    return NextResponse.json(
      { message: '获取仓库文件树失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
