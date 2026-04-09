import { NextResponse } from 'next/server';
import { getRouteErrorMessage, isRouteValidationError } from '@/lib/api/route-errors';
import { appendDraftStep } from '@/lib/services/append-draft-step';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

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

    if (!body || typeof body !== 'object' || !('step' in body)) {
      return NextResponse.json(
        { message: '缺少 step 字段', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const draft = await appendDraftStep(id, (body as { step: unknown }).step);
    return NextResponse.json(draft);
  } catch (err) {
    console.error('添加步骤失败:', err);
    const message = getRouteErrorMessage(err, '添加步骤失败');
    const isNotFound = message.includes('not found');
    const isValidation = isRouteValidationError(err);
    const status = isNotFound ? 404 : isValidation ? 400 : 500;
    const code = isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_ERROR' : 'APPEND_STEP_ERROR';
    return NextResponse.json({ message, code }, { status });
  }
}
