import { NextResponse } from 'next/server';
import { initiateGeneration } from '@/lib/services/generate-tutorial-draft';

export const maxDuration = 300;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    return await initiateGeneration(id);
  } catch (err: any) {
    console.error('生成教程失败:', err);
    return NextResponse.json(
      { message: err.message || '生成教程失败', code: 'GENERATION_FAILED' },
      { status: 500 }
    );
  }
}
