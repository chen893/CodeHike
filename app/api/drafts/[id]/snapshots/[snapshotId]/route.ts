import { NextResponse } from 'next/server';
import { getRouteErrorMessage } from '@/lib/api/route-errors';
import { restoreSnapshot, deleteSnapshot } from '@/lib/services/draft-snapshots';
import { auth } from '@/auth';

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string; snapshotId: string }> }
) {
  const { id, snapshotId } = await context.params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const draft = await restoreSnapshot(id, userId, snapshotId);
    return NextResponse.json(draft);
  } catch (err) {
    console.error('恢复快照失败:', err);
    const message = getRouteErrorMessage(err, '恢复快照失败');
    const isNotFound = message.includes('not found');
    const status = isNotFound ? 404 : 500;
    const code = isNotFound ? 'NOT_FOUND' : 'RESTORE_SNAPSHOT_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; snapshotId: string }> }
) {
  const { id, snapshotId } = await context.params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    const result = await deleteSnapshot(id, userId, snapshotId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('删除快照失败:', err);
    const message = getRouteErrorMessage(err, '删除快照失败');
    const isNotFound = message.includes('not found');
    const status = isNotFound ? 404 : 500;
    const code = isNotFound ? 'NOT_FOUND' : 'DELETE_SNAPSHOT_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}
