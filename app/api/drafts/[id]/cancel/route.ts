import { NextResponse } from 'next/server';
import { requestGenerationCancelForUser } from '@/lib/services/generate-tutorial-draft';
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

    const cancelled = await requestGenerationCancelForUser(id, session.user.id);
    if (cancelled === null) {
      return NextResponse.json(
        { message: '草稿不存在或无权操作', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    if (!cancelled) {
      return NextResponse.json(
        { message: '没有正在进行的生成任务', code: 'NOT_RUNNING' },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('取消生成失败:', err);
    return NextResponse.json(
      { message: err.message || '取消生成失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
