import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { deleteTag, renameTag, updateTagType } from '@/lib/services/tag-service';
import { getRouteErrorMessage } from '@/lib/api/route-errors';

// TODO: [admin-role] Add admin role check when role system is implemented.
// These destructive operations (delete, rename, type change) should be
// restricted to admin role only. Currently any logged-in user can access.

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { id } = await params;
    await deleteTag(id);
    return NextResponse.json({ message: '标签已删除' });
  } catch (err: any) {
    console.error('[api/admin/tags/id] DELETE failed:', err);
    return NextResponse.json(
      { message: getRouteErrorMessage(err, '删除标签失败'), code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { id } = await params;

    let body: unknown;
    try { body = await req.json(); } catch {
      return NextResponse.json({ message: '请求体不是合法的 JSON', code: 'INVALID_JSON' }, { status: 400 });
    }

    const data = body as Record<string, unknown>;

    // Support both rename and type update in one request
    if (data.name && typeof data.name === 'string') {
      const tag = await renameTag(id, data.name);
      return NextResponse.json(tag);
    }

    if (data.tagType !== undefined) {
      const validTypes = ['technology', 'category', 'level', null];
      if (data.tagType !== null && !validTypes.includes(data.tagType)) {
        return NextResponse.json(
          { message: 'tagType 必须是 technology/category/level 或 null', code: 'VALIDATION_ERROR' },
          { status: 400 },
        );
      }
      const tag = await updateTagType(id, data.tagType as 'technology' | 'category' | 'level' | null);
      return NextResponse.json(tag);
    }

    return NextResponse.json(
      { message: '请提供 name 或 tagType 字段', code: 'VALIDATION_ERROR' },
      { status: 400 },
    );
  } catch (err: any) {
    console.error('[api/admin/tags/id] PUT failed:', err);
    return NextResponse.json(
      { message: getRouteErrorMessage(err, '更新标签失败'), code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
