import { NextResponse } from 'next/server';
import { initiateGeneration, getGenerationJobFailureUpdate } from '@/lib/services/generate-tutorial-draft';
import { auth } from '@/auth';
import { ERROR_CODE_RECOVERABILITY } from '@/lib/errors/error-types';
import type { GenerationJobErrorCode } from '@/lib/errors/error-types';
import { isDraftGenerationMode } from '@/lib/types/generation-mode';

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
    let generationMode: 'auto' | 'outline_review' | 'fill_from_saved_outline' = 'auto';
    try {
      const body = await req.json();
      modelId = body.modelId || undefined;
      if (body.generationMode !== undefined) {
        if (!isDraftGenerationMode(body.generationMode)) {
          return NextResponse.json(
            { message: '无效的生成模式', code: 'INVALID_GENERATION_MODE' },
            { status: 400 }
          );
        }
        generationMode = body.generationMode;
      }
    } catch {
      // Empty body or invalid JSON — use defaults
    }

    if (modelId && (modelId.length > 64 || !/^[a-zA-Z0-9\/\-_.]+$/.test(modelId))) {
      return NextResponse.json(
        { message: '无效的模型 ID', code: 'INVALID_MODEL' },
        { status: 400 }
      );
    }

    return await initiateGeneration(id, modelId, userId, generationMode);
  } catch (err: any) {
    console.error('生成教程失败:', err);

    // Attempt to extract a structured error code via the same logic
    // used by the generation job system.
    let code: GenerationJobErrorCode | 'GENERATION_FAILED' | 'OUTLINE_MISSING' = 'GENERATION_FAILED';
    let recoverability: 'retry_full' | 'retry_from_step' | 'none' = 'retry_full';
    let message = err.message || '生成教程失败';

    try {
      if (err instanceof Error && err.message.startsWith('outline_missing:')) {
        code = 'OUTLINE_MISSING';
        message = err.message.replace(/^outline_missing:\s*/i, '');
        recoverability = 'none';
      } else {
        const failure = getGenerationJobFailureUpdate(err);
        code = failure.errorCode;
        recoverability = ERROR_CODE_RECOVERABILITY[failure.errorCode] ?? 'retry_full';
      }
    } catch {
      // getGenerationJobFailureUpdate may throw for unexpected error shapes;
      // fall back to the generic GENERATION_FAILED code.
    }

    const status =
      code === 'OUTLINE_MISSING'
        ? 409
        : 500;

    return NextResponse.json(
      {
        message,
        code,
        recoverability,
      },
      { status }
    );
  }
}
