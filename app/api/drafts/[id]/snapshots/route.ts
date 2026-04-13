import { NextResponse } from 'next/server';
import { getRouteErrorMessage } from '@/lib/api/route-errors';
import { createSnapshot, listSnapshots } from '@/lib/services/draft-snapshots';
import { auth } from '@/auth';

export async function GET(
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

    const snapshots = await listSnapshots(id, userId);
    return NextResponse.json(snapshots);
  } catch (err) {
    console.error('获取快照列表失败:', err);
    const message = getRouteErrorMessage(err, '获取快照列表失败');
    const isNotFound = message.includes('not found');
    const status = isNotFound ? 404 : 500;
    const code = isNotFound ? 'NOT_FOUND' : 'LIST_SNAPSHOTS_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}

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

    let body: Record<string, unknown> | undefined;
    try {
      body = await req.json();
    } catch {
      // No body is fine — label is optional
    }

    const label =
      body && typeof body === 'object' && 'label' in body
        ? String(body.label)
        : undefined;

    const snapshot = await createSnapshot(id, userId, label);
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error('创建快照失败:', err);
    const message = getRouteErrorMessage(err, '创建快照失败');
    const isNotFound = message.includes('not found');
    const status = isNotFound ? 404 : 500;
    const code = isNotFound ? 'NOT_FOUND' : 'CREATE_SNAPSHOT_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}
