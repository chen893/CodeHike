import { NextResponse } from 'next/server';
import { getRouteErrorMessage, isRouteValidationError } from '@/lib/api/route-errors';
import { regenerateDraftStep } from '@/lib/services/regenerate-draft-step';
import { auth } from '@/auth';

export const maxDuration = 120;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await context.params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const draft = await regenerateDraftStep(id, stepId, body as any, userId);
    return NextResponse.json(draft);
  } catch (err) {
    console.error('重新生成步骤失败:', err);
    const message = getRouteErrorMessage(err, '重新生成步骤失败');
    const isNotFound = message.includes('not found');
    const isValidation = isRouteValidationError(err);
    const status = isNotFound ? 404 : isValidation ? 400 : 500;
    const code = isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_ERROR' : 'REGENERATION_FAILED';
    return NextResponse.json({ message, code }, { status });
  }
}
