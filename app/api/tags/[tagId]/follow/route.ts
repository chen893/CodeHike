import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { followTagById, unfollowTagById, isFollowingById } from '@/lib/services/follow-service';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tagId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { tagId } = await params;
    await followTagById(session.user.id, tagId);
    return NextResponse.json({ following: true });
  } catch (err: any) {
    console.error('[api/tags/tagId/follow] POST failed:', err);
    return NextResponse.json(
      { message: err.message || '关注失败', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tagId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: '请先登录', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const { tagId } = await params;
    await unfollowTagById(session.user.id, tagId);
    return NextResponse.json({ following: false });
  } catch (err: any) {
    console.error('[api/tags/tagId/follow] DELETE failed:', err);
    return NextResponse.json(
      { message: err.message || '取消关注失败', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tagId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ following: false });
    }
    const { tagId } = await params;
    const following = await isFollowingById(session.user.id, tagId);
    return NextResponse.json({ following });
  } catch (err: any) {
    console.error('[api/tags/tagId/follow] GET failed:', err);
    return NextResponse.json({ following: false });
  }
}
