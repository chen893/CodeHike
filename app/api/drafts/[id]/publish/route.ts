import { NextResponse } from 'next/server';
import { publishDraft } from '@/lib/services/publish-draft';
import { PublishSlugConflictError } from '@/lib/errors/error-types';
import { auth } from '@/auth';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const body = await req.json().catch(() => ({}));
    const published = await publishDraft(id, body, userId);
    return NextResponse.json(published, { status: 201 });
  } catch (err: any) {
    // Structured slug conflict — authoritative 409 from DB unique constraint
    if (err instanceof PublishSlugConflictError) {
      return NextResponse.json(
        { code: 'PUBLISH_SLUG_CONFLICT', message: '该 URL 已被占用' },
        { status: 409 }
      );
    }

    console.error('发布草稿失败:', err);
    const message = err.message || '发布失败';
    const code = message.includes('not found') || message.includes('no tutorial content')
      ? 'NOT_FOUND'
      : message.includes('reserved')
        ? 'CONFLICT'
        : message.includes('sync') || message.includes('validation')
          ? 'PRECONDITION_FAILED'
          : 'PUBLISH_ERROR';

    const status =
      code === 'NOT_FOUND'
        ? 404
        : code === 'CONFLICT'
          ? 409
          : code === 'PRECONDITION_FAILED'
            ? 412
            : 500;

    return NextResponse.json({ message, code }, { status });
  }
}
