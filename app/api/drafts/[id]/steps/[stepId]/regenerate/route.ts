import { NextResponse } from 'next/server';
import { regenerateDraftStep } from '@/lib/services/regenerate-draft-step';

export const maxDuration = 120;

export async function POST(
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

    const draft = await regenerateDraftStep(id, stepId, body as any);
    return NextResponse.json(draft);
  } catch (err: any) {
    console.error('重新生成步骤失败:', err);
    const message = err.message || '重新生成步骤失败';
    const isNotFound = message.includes('not found');
    const isValidation = message.includes('validation');
    const status = isNotFound ? 404 : isValidation ? 400 : 500;
    const code = isNotFound ? 'NOT_FOUND' : isValidation ? 'VALIDATION_ERROR' : 'REGENERATION_FAILED';
    return NextResponse.json({ message, code }, { status });
  }
}
