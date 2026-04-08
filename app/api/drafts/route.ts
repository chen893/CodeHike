import { NextResponse } from 'next/server';
import { createDraft } from '@/lib/services/create-draft';

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
    return NextResponse.json(draft, { status: 201 });
  } catch (err: any) {
    console.error('创建草稿失败:', err);
    const code = err.message?.includes('validation') ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR';
    return NextResponse.json(
      { message: err.message || '创建草稿失败', code },
      { status: code === 'VALIDATION_ERROR' ? 400 : 500 }
    );
  }
}
