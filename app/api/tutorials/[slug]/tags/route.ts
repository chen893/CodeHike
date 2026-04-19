import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getTutorialTags, setTutorialTagsByName } from '@/lib/services/tag-service';
import { getPublishedBySlug } from '@/lib/repositories/published-tutorial-repository';
import { getRouteErrorMessage } from '@/lib/api/route-errors';

async function resolveTutorialId(slug: string): Promise<string | null> {
  const tutorial = await getPublishedBySlug(slug);
  return tutorial?.id ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const tutorialId = await resolveTutorialId(slug);
    if (!tutorialId) {
      return NextResponse.json({ message: '教程未找到', code: 'NOT_FOUND' }, { status: 404 });
    }
    const tags = await getTutorialTags(tutorialId);
    return NextResponse.json(tags);
  } catch (err) {
    console.error('[api/tutorials/slug/tags] GET failed:', err);
    return NextResponse.json(
      { message: getRouteErrorMessage(err, '获取标签失败'), code: 'FETCH_ERROR' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    const { slug } = await params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 },
      );
    }

    const data = body as Record<string, unknown>;
    const tagNames = data.tags;

    if (!Array.isArray(tagNames) || tagNames.some((t) => typeof t !== 'string')) {
      return NextResponse.json(
        { message: 'tags 必须是字符串数组', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    // Validate tag names: max 64 chars, non-empty
    const validNames = (tagNames as string[]).filter((n) => {
      const trimmed = n.trim();
      return trimmed.length > 0 && trimmed.length <= 64;
    });

    const tutorialId = await resolveTutorialId(slug);
    if (!tutorialId) {
      return NextResponse.json({ message: '教程未找到', code: 'NOT_FOUND' }, { status: 404 });
    }

    const tags = await setTutorialTagsByName(tutorialId, validNames);
    return NextResponse.json(tags);
  } catch (err) {
    console.error('[api/tutorials/slug/tags] PUT failed:', err);
    return NextResponse.json(
      { message: getRouteErrorMessage(err, '更新标签失败'), code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
