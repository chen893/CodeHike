import { NextResponse } from 'next/server';
import { getRouteErrorMessage, isRouteValidationError } from '@/lib/api/route-errors';
import { deleteDraft } from '@/lib/services/delete-draft';
import { getDraftDetail } from '@/lib/services/draft-queries';
import { updateDraft } from '@/lib/services/update-draft';
import { auth } from '@/auth';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const draft = await getDraftDetail(id, userId);

    if (!draft) {
      return NextResponse.json(
        { message: '草稿不存在', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(draft);
  } catch (err) {
    console.error('获取草稿失败:', err);
    return NextResponse.json(
      { message: '获取草稿失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const updated = await updateDraft(id, body, userId);
    return NextResponse.json(updated);
  } catch (err) {
    console.error('更新草稿失败:', err);
    const message = getRouteErrorMessage(err, '更新草稿失败');
    const isNotFound = message.includes('not found');
    const code = isNotFound
      ? 'NOT_FOUND'
      : isRouteValidationError(err)
        ? 'VALIDATION_ERROR'
        : 'INTERNAL_ERROR';
    return NextResponse.json(
      { message, code },
      { status: code === 'NOT_FOUND' ? 404 : code === 'VALIDATION_ERROR' ? 400 : 500 }
    );
  }
}

export async function DELETE(
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

    const result = await deleteDraft(id, userId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('删除草稿失败:', err);
    const message = getRouteErrorMessage(err, '删除草稿失败');
    const isNotFound = message.includes('not found');
    const isConflict = err instanceof Error && err.message.toLowerCase().startsWith('conflict:');
    const status = isNotFound ? 404 : isConflict ? 409 : 500;
    const code = isNotFound ? 'NOT_FOUND' : isConflict ? 'CONFLICT' : 'DELETE_DRAFT_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}
