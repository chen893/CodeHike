import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getRouteErrorMessage } from '@/lib/api/route-errors';
import {
  setUsername as setUsernameService,
  getUserById,
} from '@/lib/services/user-profile-service';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 },
      );
    }

    // Check if user already has a username
    const existingUser = await getUserById(session.user.id);
    if (!existingUser) {
      return NextResponse.json(
        { message: '用户不存在', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }
    if (existingUser.username) {
      return NextResponse.json(
        { message: '用户名已设置，不可更改', code: 'CONFLICT' },
        { status: 409 },
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
    const username = data.username;

    if (typeof username !== 'string' || !username.trim()) {
      return NextResponse.json(
        { message: '用户名不能为空', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    try {
      await setUsernameService(session.user.id, username.trim());
    } catch (err) {
      const message = getRouteErrorMessage(err, '设置用户名失败');
      return NextResponse.json(
        { message, code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    // Return updated user
    const updatedUser = await getUserById(session.user.id);
    return NextResponse.json({
      id: updatedUser!.id,
      username: updatedUser!.username,
      name: updatedUser!.name ?? null,
      email: updatedUser!.email ?? null,
      image: updatedUser!.image ?? null,
      bio: updatedUser!.bio ?? null,
    });
  } catch (err) {
    console.error('设置用户名失败:', err);
    const message = getRouteErrorMessage(err, '设置用户名失败');
    return NextResponse.json(
      { message, code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
