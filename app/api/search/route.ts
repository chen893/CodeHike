import { NextResponse } from 'next/server';
import { getExploreData } from '@/lib/services/explore-service';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSearch = searchParams.get('q') || undefined;
    const search = rawSearch && rawSearch.length <= 200 ? rawSearch : undefined;
    const result = await getExploreData({
      search,
      tag: searchParams.get('tag') || undefined,
      lang: searchParams.get('lang') || undefined,
      sort: searchParams.get('sort') || undefined,
      page: Number(searchParams.get('page')) || undefined,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[api/search] Failed:', err);
    return NextResponse.json(
      { message: err.message || '搜索失败', code: 'SEARCH_ERROR' },
      { status: 500 },
    );
  }
}
