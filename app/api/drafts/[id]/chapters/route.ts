import { NextResponse } from 'next/server';
import { getRouteErrorMessage, isRouteValidationError } from '@/lib/api/route-errors';
import { addChapter } from '@/lib/services/chapter-crud';
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

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine for add chapter — use defaults
    }

    const data: { title?: string; description?: string } = {};
    if (typeof body.title === 'string' && body.title.trim()) {
      data.title = body.title.trim();
    }
    if (typeof body.description === 'string') {
      data.description = body.description;
    }

    const draft = await addChapter(id, userId, data);
    return NextResponse.json(draft);
  } catch (err) {
    console.error('添加章节失败:', err);
    const message = getRouteErrorMessage(err, '添加章节失败');
    const isNotFound = message.includes('not found');
    const isValidation = isRouteValidationError(err);
    const status = isNotFound ? 404 : isValidation ? 400 : 500;
    const code = isNotFound
      ? 'NOT_FOUND'
      : isValidation
        ? 'VALIDATION_ERROR'
        : 'ADD_CHAPTER_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}
