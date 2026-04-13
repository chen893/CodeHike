import { NextResponse } from 'next/server';
import { initiateGeneration } from '@/lib/services/generate-tutorial-draft';
import { auth } from '@/auth';

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
        { message: '请先登录', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    const userId = session.user.id;

    let generationVersion: 'v1' | 'v2' = 'v2';
    let modelId: string | undefined;
    try {
      const body = await req.json();
      if (body.generationVersion === 'v1') {
        generationVersion = 'v1';
      }
      modelId = body.modelId || undefined;
    } catch {
      // Empty body or invalid JSON — use default v2
    }

    return await initiateGeneration(id, modelId, generationVersion, userId);
  } catch (err: any) {
    console.error('生成教程失败:', err);
    return NextResponse.json(
      { message: err.message || '生成教程失败', code: 'GENERATION_FAILED' },
      { status: 500 }
    );
  }
}
