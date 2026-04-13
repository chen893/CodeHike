import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getExploreData } from '@/lib/services/explore-service';
import { generateOgMetadata } from '@/lib/utils/seo';
import { getCurrentUser } from '@/auth';
import { trackExploreViewed } from '@/lib/monitoring/analytics';
import { ExploreClient } from '@/components/explore/explore-client';

export const metadata = {
  ...generateOgMetadata({
    title: '探索教程 — VibeDocs',
    description: '浏览和搜索所有已发布的交互式编程教程。',
    slug: 'explore',
  }),
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const search = typeof params.q === 'string' ? params.q : undefined;
  const tag = typeof params.tag === 'string' ? params.tag : undefined;
  const lang = typeof params.lang === 'string' ? params.lang : undefined;
  const sort = typeof params.sort === 'string' ? params.sort : undefined;
  const page = typeof params.page === 'string' ? Number(params.page) : 1;

  const user = await getCurrentUser();
  const { tutorials, total, tags } = await getExploreData({
    search,
    tag,
    lang,
    sort,
    page,
  });

  // Fire-and-forget tracking
  trackExploreViewed(user?.id, undefined, {
    ...(search ? { search } : {}),
    ...(tag ? { tag } : {}),
    ...(lang ? { lang } : {}),
    ...(sort ? { sort } : {}),
  });

  const activeTag = tag ? tags.find((t) => t.slug === tag) : null;
  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <AppShell activePath="/explore" user={user}>
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px w-8 bg-cyan-500" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-600">
              探索
            </p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            探索教程
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-slate-500">
            浏览所有已发布的交互式编程教程，按标签或关键词搜索。
          </p>
        </div>

        {/* Search + Filters (client component) */}
        <ExploreClient
          tags={JSON.parse(JSON.stringify(tags))}
          activeTag={activeTag?.slug ?? null}
          activeLang={lang ?? null}
          sort={sort ?? 'newest'}
          searchQuery={search ?? ''}
        />

        {/* Active filters summary */}
        {(activeTag || lang) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-slate-500">当前筛选：</span>
            {activeTag && (
              <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200">
                {activeTag.name}
                <Link href={buildFilterUrl({ tag: undefined, lang, search, sort })} className="ml-1.5 hover:text-cyan-900">
                  ×
                </Link>
              </Badge>
            )}
            {lang && (
              <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                {lang}
                <Link href={buildFilterUrl({ tag, lang: undefined, search, sort })} className="ml-1.5 hover:text-slate-900">
                  ×
                </Link>
              </Badge>
            )}
          </div>
        )}

        {/* Results count */}
        <p className="text-sm text-slate-500">
          {search ? `搜索 "${search}" 找到 ` : '共 '}
          {total} 篇教程
        </p>

        {/* Tutorial grid */}
        {tutorials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-sm text-slate-400">
              {search ? '没有找到匹配的教程。试试其他关键词？' : '暂无已发布的教程。'}
            </p>
            {!search && (
              <Button asChild className="mt-4 bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                <Link href="/new">创建第一篇教程</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tutorials.map((tutorial) => (
              <Card
                key={tutorial.id}
                className="group flex flex-col border-slate-200/60 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <CardHeader className="flex-1 p-5 pb-4">
                  <div className="mb-3 flex items-center justify-between">
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                      /{tutorial.slug}
                    </Badge>
                  </div>
                  <CardTitle className="mb-2 text-base font-bold text-slate-900 group-hover:text-cyan-600 transition-colors">
                    {tutorial.title}
                  </CardTitle>
                  {tutorial.description && (
                    <CardDescription className="line-clamp-3 text-sm leading-relaxed text-slate-500">
                      {tutorial.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 border-t border-slate-50 p-5 pt-4">
                  {/* Tags */}
                  {tutorial.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {tutorial.tags.slice(0, 4).map((t) => (
                        <Link key={t.id} href={`/explore?tag=${t.slug}`}>
                          <Badge variant="outline" className="text-[10px] border-cyan-200 text-cyan-600 hover:bg-cyan-50">
                            {t.name}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                  {/* Meta badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {tutorial.lang && (
                      <Badge variant="outline" className="text-[11px] border-slate-200 text-slate-500">
                        {tutorial.lang}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[11px] border-slate-200 text-slate-500">
                      {tutorial.stepCount} 步
                    </Badge>
                    <Badge variant="outline" className="text-[11px] border-slate-200 text-slate-500">
                      约 {tutorial.readingTime} 分钟
                    </Badge>
                    {tutorial.viewCount > 0 && (
                      <Badge variant="outline" className="text-[11px] border-slate-200 text-slate-500">
                        {tutorial.viewCount} 次浏览
                      </Badge>
                    )}
                  </div>
                  {/* Author + CTA */}
                  <div className="flex items-center justify-between pt-1">
                    {tutorial.authorUsername ? (
                      <Link
                        href={`/u/${tutorial.authorUsername}`}
                        className="flex items-center gap-2 text-xs text-slate-400 hover:text-cyan-600 transition-colors"
                      >
                        {tutorial.authorImage && (
                          <img src={tutorial.authorImage} alt="" className="h-5 w-5 rounded-full" />
                        )}
                        {tutorial.authorName || tutorial.authorUsername}
                      </Link>
                    ) : (
                      <span />
                    )}
                    <Button asChild size="sm" className="bg-slate-900 text-white hover:bg-slate-800">
                      <Link href={`/${tutorial.slug}`}>阅读</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={buildFilterUrl({ tag, lang, search, sort, page: page - 1 })}>
                  上一页
                </Link>
              </Button>
            )}
            <span className="text-sm text-slate-500">
              第 {page} / {totalPages} 页
            </span>
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={buildFilterUrl({ tag, lang, search, sort, page: page + 1 })}>
                  下一页
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function buildFilterUrl(opts: {
  tag?: string | undefined;
  lang?: string | undefined;
  search?: string | undefined;
  sort?: string | undefined;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (opts.search) params.set('q', opts.search);
  if (opts.tag) params.set('tag', opts.tag);
  if (opts.lang) params.set('lang', opts.lang);
  if (opts.sort && opts.sort !== 'newest') params.set('sort', opts.sort);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const qs = params.toString();
  return qs ? `/explore?${qs}` : '/explore';
}
