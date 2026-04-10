import { NextResponse } from 'next/server';
import { getDraftPreviewPayloadData } from '@/lib/services/draft-queries';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await getDraftPreviewPayloadData(id);

    if (!result) {
      return NextResponse.json(
        { message: '草稿不存在', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!result.payload) {
      return NextResponse.json(
        { message: '草稿尚未生成教程内容', code: 'NO_CONTENT' },
        { status: 404 }
      );
    }

    return NextResponse.json(result.payload);
  } catch (err) {
    console.error('获取预览 payload 失败:', err);
    return NextResponse.json(
      { message: '获取预览 payload 失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
