import { NextResponse } from 'next/server';
import { getTagsPageData } from '@/lib/services/explore-service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const tags = await getTagsPageData();
    return NextResponse.json(tags);
  } catch (err: any) {
    console.error('[api/tags] Failed to fetch tags:', err);
    return NextResponse.json(
      { message: err.message || '获取标签失败', code: 'FETCH_ERROR' },
      { status: 500 },
    );
  }
}
