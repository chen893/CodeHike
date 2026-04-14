import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getMultipleFileContents,
  parseRepoUrl,
  getGitHubTokenForUser,
  GitHubRepoNotFoundError,
  GitHubRateLimitError,
} from '@/lib/services/github-repo-service';

const MAX_FILES = 15;
const MAX_TOTAL_LINES = 1500;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const { url, paths } = body as { url?: string; paths?: string[] };

    if (!url || !paths || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json(
        { message: '缺少 url 或 paths 参数', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (paths.length > MAX_FILES) {
      return NextResponse.json(
        { message: `最多选择 ${MAX_FILES} 个文件`, code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const parsed = parseRepoUrl(url);
    if (!parsed) {
      return NextResponse.json(
        { message: '无法解析仓库地址', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const token = await getGitHubTokenForUser(session.user.id);
    const fileMap = await getMultipleFileContents(parsed.owner, parsed.repo, paths, token);

    // Check total line count
    let totalLines = 0;
    for (const content of fileMap.values()) {
      totalLines += content.content.split('\n').length;
    }

    if (totalLines > MAX_TOTAL_LINES) {
      return NextResponse.json(
        {
          message: `选中的文件总行数 (${totalLines}) 超过上限 (${MAX_TOTAL_LINES})，请减少选择`,
          code: 'VALIDATION_ERROR',
          totalLines,
        },
        { status: 400 }
      );
    }

    const files = Array.from(fileMap.entries()).map(([path, content]) => ({
      path,
      name: content.name,
      content: content.content,
      size: content.size,
      lines: content.content.split('\n').length,
    }));

    return NextResponse.json({
      owner: parsed.owner,
      repo: parsed.repo,
      totalLines,
      files,
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
    console.error('获取文件内容失败:', err);
    return NextResponse.json(
      { message: '获取文件内容失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
