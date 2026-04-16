import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getMultipleFileContents,
  parseRepoUrl,
  getGitHubTokenForUser,
  GitHubForbiddenError,
  GitHubRepoNotFoundError,
  GitHubRateLimitError,
  serializeGitHubFileBatchResult,
} from '@/lib/services/github-repo-service';
import { MAX_FILES_PER_REQUEST, MAX_LINES_PER_REQUEST } from '@/lib/constants/github-import';

export async function POST(req: Request) {
  try {
    const session = await auth();

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

    if (paths.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { message: `最多选择 ${MAX_FILES_PER_REQUEST} 个文件`, code: 'VALIDATION_ERROR' },
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

    console.log('[github-import] file-content request', {
      hasSessionUser: Boolean(session?.user?.id),
      userId: session?.user?.id ?? null,
      repoUrl: url,
      pathCount: paths.length,
    });

    const token = session?.user?.id ? await getGitHubTokenForUser(session.user.id) : null;
    const result = await getMultipleFileContents(parsed.owner, parsed.repo, paths, token);
    const payload = serializeGitHubFileBatchResult(parsed.owner, parsed.repo, result);

    if (result.files.size === 0 && result.failures.length > 0) {
      const status = result.failures.every((failure) => failure.code === 'RATE_LIMITED') ? 429 : 502;
      return NextResponse.json(
        {
          message:
            status === 429
              ? 'GitHub API 速率限制已耗尽，请稍后重试'
              : `文件获取失败: ${result.failures.map((failure) => failure.path).join(', ')}`,
          code: status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR',
          failures: result.failures,
          ...payload,
        },
        { status }
      );
    }

    if (payload.totalLines > MAX_LINES_PER_REQUEST) {
      return NextResponse.json(
        {
          message: `选中的文件总行数 (${payload.totalLines}) 超过上限 (${MAX_LINES_PER_REQUEST})，请减少选择`,
          code: 'VALIDATION_ERROR',
          totalLines: payload.totalLines,
        },
        { status: 400 }
      );
    }

    if (result.failures.length > 0) {
      return NextResponse.json(
        {
          message: `部分文件获取失败: ${result.failures.map((failure) => failure.path).join(', ')}`,
          code: 'PARTIAL_FAILURE',
          failures: result.failures,
          ...payload,
        },
        { status: 207 }
      );
    }

    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof GitHubRepoNotFoundError) {
      return NextResponse.json(
        { message: err.message, code: 'NOT_FOUND' },
        { status: 404 }
      );
    }
    if (err instanceof GitHubRateLimitError) {
      return NextResponse.json(
        {
          message: err.message,
          code: 'RATE_LIMITED',
          rateLimit: err.rateLimit
            ? {
                remaining: err.rateLimit.remaining,
                limit: err.rateLimit.limit,
                resetAt: err.rateLimit.resetAt.toISOString(),
              }
            : null,
        },
        { status: 429 }
      );
    }
    if (err instanceof GitHubForbiddenError) {
      return NextResponse.json(
        { message: err.message, code: 'FORBIDDEN' },
        { status: 403 }
      );
    }
    console.error('获取文件内容失败:', err);
    return NextResponse.json(
      { message: '获取文件内容失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
