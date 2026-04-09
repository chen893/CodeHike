import { NextResponse } from 'next/server';
import { getRouteErrorMessage, isRouteValidationError } from '@/lib/api/route-errors';
import { updateDraftStep } from '@/lib/services/update-draft-step';

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await context.params;

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: '请求体不是合法的 JSON', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    const draft = await updateDraftStep(id, stepId, body as any);
    return NextResponse.json(draft);
  } catch (err) {
    console.error('更新步骤失败:', err);
    const message = getRouteErrorMessage(err, '更新步骤失败');
    const isNotFound = message.includes('not found');
    const isValidation = isRouteValidationError(err);
    const status = isNotFound ? 404 : isValidation ? 400 : 500;
    const code = isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_ERROR' : 'UPDATE_STEP_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}
