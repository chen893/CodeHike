import { NextResponse } from 'next/server';
import { unpublishDraft } from '@/lib/services/unpublish-draft';
import { getRouteErrorMessage } from '@/lib/api/route-errors';

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    await unpublishDraft(id);
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
