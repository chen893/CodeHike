import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getRouteConflictCode,
  getRouteErrorMessage,
  isRouteConflictError,
  isRouteValidationError,
} from '@/lib/api/route-errors';
import { updateDraftOutline } from '@/lib/services/update-draft-outline';

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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const draft = await updateDraftOutline(id, session.user.id, body);
    return NextResponse.json(draft);
  } catch (err) {
    console.error('保存大纲失败:', err);
    const message = getRouteErrorMessage(err, '保存大纲失败');
    const isNotFound = message.includes('not found');
    const isConflict = isRouteConflictError(err);
    const isValidation = isRouteValidationError(err);
    const conflictCode = getRouteConflictCode(err, 'STRUCTURE_LOCKED');
    const status = isNotFound ? 404 : isConflict ? 409 : isValidation ? 400 : 500;
    const code = isNotFound
      ? 'NOT_FOUND'
      : isConflict
        ? conflictCode
        : isValidation
          ? 'VALIDATION_ERROR'
          : 'UPDATE_OUTLINE_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}
