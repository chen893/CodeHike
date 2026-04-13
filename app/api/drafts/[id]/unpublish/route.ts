import { NextResponse } from 'next/server';
import { unpublishDraft } from '@/lib/services/unpublish-draft';
import { getRouteErrorMessage } from '@/lib/api/route-errors';
import { auth } from '@/auth';

export async function POST(
  _req: Request,
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

    await unpublishDraft(id, userId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('取消发布失败:', err);
    const message = getRouteErrorMessage(err, '取消发布失败');
    const code = message.includes('not published')
      ? 'NOT_FOUND'
      : 'UNPUBLISH_ERROR';

    const status = code === 'NOT_FOUND' ? 404 : 500;

    return NextResponse.json({ message, code }, { status });
  }
}
