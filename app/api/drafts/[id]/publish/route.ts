import { NextResponse } from 'next/server';
import { publishDraft } from '@/lib/services/publish-draft';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const body = await req.json().catch(() => ({}));
    const published = await publishDraft(id, body);
    return NextResponse.json(published, { status: 201 });
  } catch (err: any) {
    console.error('发布草稿失败:', err);
    const message = err.message || '发布失败';
    const code = message.includes('not found') || message.includes('no tutorial content')
      ? 'NOT_FOUND'
      : message.includes('reserved') || message.includes('taken')
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
