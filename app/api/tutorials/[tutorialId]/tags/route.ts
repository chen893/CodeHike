import { NextResponse } from 'next/server';
import { getTutorialTags, setTutorialTagsByName } from '@/lib/services/tag-service';
import { getRouteErrorMessage } from '@/lib/api/route-errors';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tutorialId: string }> },
) {
  try {
    const { tutorialId } = await params;
    const tags = await getTutorialTags(tutorialId);
    return NextResponse.json(tags);
  } catch (err) {
    console.error('[api/tutorials/tutorialId/tags] GET failed:', err);
    return NextResponse.json(
      { message: getRouteErrorMessage(err, '获取标签失败'), code: 'FETCH_ERROR' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ tutorialId: string }> },
) {
  try {
    const { tutorialId } = await params;
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

    const tags = await setTutorialTagsByName(tutorialId, tagNames as string[]);
    return NextResponse.json(tags);
  } catch (err) {
    console.error('[api/tutorials/tutorialId/tags] PUT failed:', err);
    return NextResponse.json(
      { message: getRouteErrorMessage(err, '更新标签失败'), code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
