import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRouteErrorMessage } from '@/lib/api/route-errors';
import {
  getUserById,
  updateProfile as updateProfileService,
} from '@/lib/services/user-profile-service';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json(
        { message: '用户不存在', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: user.id,
      username: user.username ?? null,
      name: user.name ?? null,
      email: user.email ?? null,
      image: user.image ?? null,
      bio: user.bio ?? null,
    });
  } catch (err) {
    console.error('获取个人资料失败:', err);
    return NextResponse.json(
      { message: '获取个人资料失败', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 },
      );
    }

    const data = body as Record<string, unknown>;
    const updates: { name?: string; bio?: string } = {};

    if (typeof data.name === 'string') {
      const name = data.name.trim();
      if (name.length > 100) {
        return NextResponse.json(
          { message: '名称最多 100 个字符', code: 'VALIDATION_ERROR' },
          { status: 400 },
        );
      }
      updates.name = name;
    }
    if (typeof data.bio === 'string') {
      const bio = data.bio.trim();
      if (bio.length > 500) {
        return NextResponse.json(
          { message: '简介最多 500 个字符', code: 'VALIDATION_ERROR' },
          { status: 400 },
        );
      }
      updates.bio = bio;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: '没有可更新的字段', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    await updateProfileService(session.user.id, updates);

    // Return updated profile
    const user = await getUserById(session.user.id);
    return NextResponse.json({
      id: user!.id,
      username: user!.username ?? null,
      name: user!.name ?? null,
      email: user!.email ?? null,
      image: user!.image ?? null,
      bio: user!.bio ?? null,
    });
  } catch (err) {
    console.error('更新个人资料失败:', err);
    const message = getRouteErrorMessage(err, '更新个人资料失败');
    return NextResponse.json(
      { message, code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
