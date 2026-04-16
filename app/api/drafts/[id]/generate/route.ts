import { NextResponse } from 'next/server';
import { initiateGeneration, getGenerationJobFailureUpdate } from '@/lib/services/generate-tutorial-draft';
import { auth } from '@/auth';
import { ERROR_CODE_RECOVERABILITY } from '@/lib/errors/error-types';
import type { GenerationJobErrorCode } from '@/lib/errors/error-types';

export const maxDuration = 300;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: '请先登录', code: 'UNAUTHORIZED', recoverability: 'none' as const },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    let modelId: string | undefined;
    try {
      const body = await req.json();
      modelId = body.modelId || undefined;
    } catch {
      // Empty body or invalid JSON — use defaults
    }

    if (modelId && (modelId.length > 64 || !/^[a-zA-Z0-9\/\-_.]+$/.test(modelId))) {
      return NextResponse.json(
        { message: '无效的模型 ID', code: 'INVALID_MODEL' },
        { status: 400 }
      );
    }

    return await initiateGeneration(id, modelId, userId);
  } catch (err: any) {
    console.error('生成教程失败:', err);

    // Attempt to extract a structured error code via the same logic
    // used by the generation job system.
    let code: GenerationJobErrorCode | 'GENERATION_FAILED' = 'GENERATION_FAILED';
    let recoverability: 'retry_full' | 'retry_from_step' | 'none' = 'retry_full';

    try {
      const failure = getGenerationJobFailureUpdate(err);
      code = failure.errorCode;
      recoverability = ERROR_CODE_RECOVERABILITY[failure.errorCode] ?? 'retry_full';
    } catch {
      // getGenerationJobFailureUpdate may throw for unexpected error shapes;
      // fall back to the generic GENERATION_FAILED code.
    }

    return NextResponse.json(
      {
        message: err.message || '生成教程失败',
        code,
        recoverability,
      },
      { status: 500 }
    );
  }
}
