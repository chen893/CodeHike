import { NextResponse } from 'next/server';
import { getRouteErrorMessage, isRouteValidationError } from '@/lib/api/route-errors';
import { updateChapter, deleteChapter } from '@/lib/services/chapter-crud';
import { auth } from '@/auth';

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id, chapterId } = await context.params;

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
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const data: { title?: string; description?: string } = {};
    if (typeof body.title === 'string' && body.title.trim()) {
      data.title = body.title.trim();
    }
    if (typeof body.description === 'string') {
      data.description = body.description;
    }

    const draft = await updateChapter(id, chapterId, userId, data);
    return NextResponse.json(draft);
  } catch (err) {
    console.error('更新章节失败:', err);
    const message = getRouteErrorMessage(err, '更新章节失败');
    const isNotFound = message.includes('not found');
    const isValidation = isRouteValidationError(err);
    const status = isNotFound ? 404 : isValidation ? 400 : 500;
    const code = isNotFound
      ? 'NOT_FOUND'
      : isValidation
        ? 'VALIDATION_ERROR'
        : 'UPDATE_CHAPTER_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; chapterId: string }> }
) {
  const { id, chapterId } = await context.params;

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
      const raw = await req.text();
      if (raw.length > 1024) {
        return NextResponse.json(
          { message: '请求体过大', code: 'PAYLOAD_TOO_LARGE' },
          { status: 413 }
        );
      }
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    if (!body.moveStepsToChapterId || typeof body.moveStepsToChapterId !== 'string') {
      return NextResponse.json(
        { message: '必须指定 moveStepsToChapterId', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const draft = await deleteChapter(
      id,
      chapterId,
      userId,
      body.moveStepsToChapterId
    );
    return NextResponse.json(draft);
  } catch (err) {
    console.error('删除章节失败:', err);
    const message = getRouteErrorMessage(err, '删除章节失败');
    const isNotFound = message.includes('not found');
    const isValidation = isRouteValidationError(err);
    const status = isNotFound ? 404 : isValidation ? 400 : 500;
    const code = isNotFound
      ? 'NOT_FOUND'
      : isValidation
        ? 'VALIDATION_ERROR'
        : 'DELETE_CHAPTER_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}
