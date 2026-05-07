import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  getRouteErrorMessage,
  isRouteValidationError,
} from '@/lib/api/route-errors';
import { retryDraftFromStep } from '@/lib/services/retry-draft-from-step';

export const maxDuration = 300;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const routeAuth = auth as unknown as () => Promise<{
      user?: { id?: string | null } | null;
    } | null>;
    const session = await routeAuth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const draft = await retryDraftFromStep(id, body as any, session.user.id);
    return NextResponse.json(draft);
  } catch (err) {
    console.error('从失败步骤重试失败:', err);
    const message = getRouteErrorMessage(err, '从失败步骤重试失败');
    const isNotFound = message.includes('not found');
    const isValidation = isRouteValidationError(err);
    const status = isNotFound ? 404 : isValidation ? 400 : 500;
    const code = isNotFound
      ? 'NOT_FOUND'
      : isValidation
        ? 'VALIDATION_ERROR'
        : 'RETRY_FROM_STEP_FAILED';
    return NextResponse.json({ message, code }, { status });
  }
}
