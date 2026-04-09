import { NextResponse } from 'next/server';
import { initiateGeneration } from '@/lib/services/generate-tutorial-draft';

export const maxDuration = 300;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    let generationVersion: 'v1' | 'v2' = 'v2';
    try {
      const body = await req.json();
      if (body.generationVersion === 'v1') {
        generationVersion = 'v1';
      }
    } catch {
      // Empty body or invalid JSON — use default v2
    }

    return await initiateGeneration(id, undefined, generationVersion);
  } catch (err: any) {
    console.error('生成教程失败:', err);
    return NextResponse.json(
      { message: err.message || '生成教程失败', code: 'GENERATION_FAILED' },
      { status: 500 }
    );
  }
}
