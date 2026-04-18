import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { mergeTags } from '@/lib/services/tag-service';
import { getRouteErrorMessage } from '@/lib/api/route-errors';

// TODO: [admin-role] Add admin role check when role system is implemented.
// Currently any logged-in user can access these endpoints.
// These destructive operations (merge, delete) should be restricted to admin role only.

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ message: '请求体不是合法的 JSON', code: 'INVALID_JSON' }, { status: 400 });
    }

    const data = body as Record<string, unknown>;
    const sourceTagId = data.sourceTagId;
    const targetTagId = data.targetTagId;

    if (typeof sourceTagId !== 'string' || typeof targetTagId !== 'string') {
      return NextResponse.json(
        { message: 'sourceTagId 和 targetTagId 必须是字符串', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    await mergeTags(sourceTagId, targetTagId);
    return NextResponse.json({ message: '标签合并成功' });
  } catch (err: any) {
    console.error('[api/admin/tags/merge] POST failed:', err);
    return NextResponse.json(
      { message: getRouteErrorMessage(err, '标签合并失败'), code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
