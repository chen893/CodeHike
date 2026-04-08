import { NextResponse } from 'next/server';
import * as draftRepo from '@/lib/repositories/draft-repository';
import { buildDraftPreviewPayload } from '@/lib/services/build-draft-preview-payload';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const draft = await draftRepo.getDraftById(id);

    if (!draft) {
      return NextResponse.json(
        { message: '草稿不存在', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (!draft.tutorialDraft) {
      return NextResponse.json(
        { message: '草稿尚未生成教程内容', code: 'NO_CONTENT' },
        { status: 404 }
      );
    }

    const payload = await buildDraftPreviewPayload(draft.tutorialDraft);
    return NextResponse.json(payload);
  } catch (err) {
    console.error('获取预览 payload 失败:', err);
    return NextResponse.json(
      { message: '获取预览 payload 失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
