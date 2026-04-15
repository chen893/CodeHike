import { NextResponse } from 'next/server';
import { getRouteErrorMessage, isRouteValidationError } from '@/lib/api/route-errors';
import { updateDraftStructure } from '@/lib/services/update-draft-structure';
import { auth } from '@/auth';

export async function PUT(
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const draft = await updateDraftStructure(id, userId, body);
    return NextResponse.json(draft);
  } catch (err) {
    console.error('更新章节结构失败:', err);
    const message = getRouteErrorMessage(err, '更新章节结构失败');
    const isNotFound = message.includes('not found');
    const isValidation = isRouteValidationError(err);
    const status = isNotFound ? 404 : isValidation ? 400 : 500;
    const code = isNotFound
      ? 'NOT_FOUND'
      : isValidation
        ? 'VALIDATION_ERROR'
        : 'UPDATE_STRUCTURE_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}
