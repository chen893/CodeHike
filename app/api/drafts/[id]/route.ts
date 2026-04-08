import { NextResponse } from 'next/server';
import * as draftRepo from '@/lib/repositories/draft-repository';
import { updateDraftRequestSchema } from '@/lib/schemas/api';
import { computeInputHash } from '@/lib/utils/hash';

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

    return NextResponse.json(draft);
  } catch (err) {
    console.error('获取草稿失败:', err);
    return NextResponse.json(
      { message: '获取草稿失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const parsed = updateDraftRequestSchema.parse(body);

    const draft = await draftRepo.getDraftById(id);
    if (!draft) {
      return NextResponse.json(
        { message: '草稿不存在', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (parsed.teachingBrief) {
      const newHash = computeInputHash(draft.sourceItems, parsed.teachingBrief);
      const syncState =
        draft.tutorialDraftInputHash && newHash !== draft.tutorialDraftInputHash
          ? 'stale'
          : draft.syncState;

      await draftRepo.updateDraft(id, {
        teachingBrief: parsed.teachingBrief,
        inputHash: newHash,
        syncState: syncState as any,
      });
    }

    if (parsed.title || parsed.description || parsed.introParagraphs) {
      await draftRepo.updateDraftMeta(id, {
        title: parsed.title,
        description: parsed.description,
        introParagraphs: parsed.introParagraphs,
      });
    }

    const updated = await draftRepo.getDraftById(id);
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('更新草稿失败:', err);
    const code = err.message?.includes('validation') ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    return NextResponse.json(
      { message: err.message || '更新草稿失败', code },
      { status: code === 'VALIDATION_ERROR' ? 400 : 500 }
    );
  }
}
