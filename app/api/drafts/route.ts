import { NextResponse } from 'next/server';
import { getRouteErrorMessage, isRouteValidationError } from '@/lib/api/route-errors';
import { createDraft } from '@/lib/services/create-draft';
import { listDraftSummariesForDashboard } from '@/lib/services/draft-queries';

export async function GET() {
  try {
    const drafts = await listDraftSummariesForDashboard();
    return NextResponse.json(drafts);
  } catch (err) {
    console.error('获取草稿列表失败:', err);
    return NextResponse.json(
      { message: '获取草稿列表失败', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
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

    const draft = await createDraft(body as Parameters<typeof createDraft>[0]);
    return NextResponse.json({ id: draft.id }, { status: 201 });
  } catch (err) {
    console.error('创建草稿失败:', err);
    const message = getRouteErrorMessage(err, '创建草稿失败');
    const code = isRouteValidationError(err) ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    return NextResponse.json(
      { message, code },
      { status: code === 'VALIDATION_ERROR' ? 400 : 500 }
    );
  }
}
