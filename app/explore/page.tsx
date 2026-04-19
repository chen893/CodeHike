import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CardDescription,
  CardTitle,
} from '@/components/ui/card';
import { ExploreClient } from '@/components/explore/explore-client';
import { getCurrentUser } from '@/auth';
import { trackExploreViewed, trackTagViewed } from '@/lib/monitoring/analytics';
import { getExploreData } from '@/lib/services/explore-service';
import { generateOgMetadata } from '@/lib/utils/seo';

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
  const technology = typeof params.technology === 'string' ? params.technology : undefined;
  const category = typeof params.category === 'string' ? params.category : undefined;
  const level = typeof params.level === 'string' ? params.level : undefined;
  const lang = typeof params.lang === 'string' ? params.lang : undefined;
  const sort = typeof params.sort === 'string' ? params.sort : undefined;
  const page = typeof params.page === 'string' ? Math.max(1, parseInt(params.page, 10) || 1) : 1;

  const user = await getCurrentUser();
  const { tutorials, total, tags } = await getExploreData({
    search,
    tag,
    technology,
    category,
    level,
    lang,
    sort,
    page,
  });

  trackExploreViewed(user?.id, undefined, {
    ...(search ? { search } : {}),
    ...(technology ? { technology } : {}),
    ...(category ? { category } : {}),
    ...(level ? { level } : {}),
    ...(tag ? { tag } : {}),
    ...(lang ? { lang } : {}),
    ...(sort ? { sort } : {}),
  });

  const activeTechnology = technology ? tags.find((item) => item.slug === technology) : null;
  const activeCategory = category ? tags.find((item) => item.slug === category) : null;
  const activeLevel = level ? tags.find((item) => item.slug === level) : null;
  const activeTag = !technology && tag ? tags.find((item) => item.slug === tag) : null;

  if (activeTechnology) trackTagViewed(activeTechnology.slug, 'explore', user?.id);
  if (activeCategory) trackTagViewed(activeCategory.slug, 'explore', user?.id);
  if (activeLevel) trackTagViewed(activeLevel.slug, 'explore', user?.id);
  if (activeTag) trackTagViewed(activeTag.slug, 'explore', user?.id);

  const pageSize = 20;
  const totalPages = Math.ceil(total / pageSize);
  const hasFilters = activeTechnology || activeCategory || activeLevel || activeTag || lang;

  return (
    <>
      <TopNav activePath="/explore" user={user} />
      <div className="container-app space-y-8 pb-12 pt-20">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <div className="mb-3 font-mono text-[11px] tracking-wider text-slate-400">
              <span className="text-slate-300">{'// '}</span>
              {search ? (
                <span>
                  query: <span className="text-cyan-600">"{search}"</span>
                </span>
              ) : activeTechnology ? (
                <span>
                  technology: <span className="text-cyan-600">{activeTechnology.name}</span>
                </span>
              ) : activeCategory ? (
                <span>
                  category: <span className="text-cyan-600">{activeCategory.name}</span>
                </span>
              ) : activeLevel ? (
                <span>
                  level: <span className="text-cyan-600">{activeLevel.name}</span>
                </span>
              ) : activeTag ? (
                <span>
                  tag: <span className="text-cyan-600">{activeTag.name}</span>
                </span>
              ) : (
                <span>explore</span>
              )}
              {total > 0 && <span className="text-slate-300"> · {total} 篇</span>}
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              探索教程
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
              浏览所有已发布的交互式编程教程，按标签或关键词搜索。
            </p>
          </div>
        </div>

        <ExploreClient
          tags={JSON.parse(JSON.stringify(tags))}
          activeTechnology={activeTechnology?.slug ?? (activeTag?.slug ?? null)}
          activeCategory={activeCategory?.slug ?? null}
          activeLevel={activeLevel?.slug ?? null}
          sort={sort ?? 'newest'}
          searchQuery={search ?? ''}
        />

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-amber-300/30 bg-amber-50/50 px-4 py-2.5">
            <span className="font-mono text-[11px] font-semibold tracking-wider text-amber-600/80">
              FILTER
            </span>

            {(activeTechnology || activeTag) && (
              <Badge className="border-cyan-300/40 bg-cyan-50 text-cyan-700">
                技术: {(activeTechnology ?? activeTag)?.name}
                <Link
                  href={buildFilterUrl({
                    technology: undefined,
                    tag: undefined,
                    category,
                    level,
                    lang,
                    search,
                    sort,
                  })}
                  className="ml-1.5 font-mono text-cyan-400 transition-colors hover:text-cyan-700"
                >
                  ×
                </Link>
              </Badge>
            )}

            {activeCategory && (
              <Badge className="border-cyan-300/40 bg-cyan-50 text-cyan-700">
                领域: {activeCategory.name}
                <Link
                  href={buildFilterUrl({
                    technology,
                    tag,
                    category: undefined,
                    level,
                    lang,
                    search,
                    sort,
                  })}
                  className="ml-1.5 font-mono text-cyan-400 transition-colors hover:text-cyan-700"
                >
                  ×
                </Link>
              </Badge>
            )}

            {activeLevel && (
              <Badge className="border-cyan-300/40 bg-cyan-50 text-cyan-700">
                难度: {activeLevel.name}
                <Link
                  href={buildFilterUrl({
                    technology,
                    tag,
                    category,
                    level: undefined,
                    lang,
                    search,
                    sort,
                  })}
                  className="ml-1.5 font-mono text-cyan-400 transition-colors hover:text-cyan-700"
                >
                  ×
                </Link>
              </Badge>
            )}

            {lang && (
              <Badge className="border-slate-300/60 bg-slate-100 text-slate-700">
                <span className="font-mono">{lang}</span>
                <Link
                  href={buildFilterUrl({
                    technology,
                    tag,
                    category,
                    level,
                    lang: undefined,
                    search,
                    sort,
                  })}
                  className="ml-1.5 font-mono text-slate-400 transition-colors hover:text-slate-700"
                >
                  ×
                </Link>
              </Badge>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
          <span>
            {search ? `搜索 "${search}" 找到 ` : '共 '}
            <span className="font-semibold text-foreground">{total}</span> 篇教程
          </span>
        </div>

        {tutorials.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-slate-500">
                {search ? (
                  <>
                    没有找到匹配 "<span className="font-medium text-slate-700">{search}</span>" 的教程
                  </>
                ) : (
                  '暂无已发布的教程'
                )}
              </p>
              {search && <p className="mt-1 text-xs text-slate-400">试试其他关键词？</p>}
              {!search && (
                <Button asChild className="mt-6 bg-slate-900 text-white hover:bg-slate-800">
                  <Link href="/new">创建第一篇教程</Link>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
            {tutorials.map((tutorial) => (
              <article
                key={tutorial.id}
                className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border/50 bg-card transition-all duration-300 hover:-translate-y-0.5 sm:hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
              >
                <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/0 to-transparent transition-all duration-300 group-hover:via-primary/60" />

                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex-1 space-y-2.5">
                    <Link href={`/${tutorial.slug}`}>
                      <CardTitle className="line-clamp-2 text-[15px] font-bold leading-snug text-foreground transition-colors duration-200 group-hover:text-primary">
                        {tutorial.title}
                      </CardTitle>
                    </Link>
                    {tutorial.description && (
                      <Link href={`/${tutorial.slug}`}>
                        <CardDescription className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {tutorial.description}
                        </CardDescription>
                      </Link>
                    )}
                    {tutorial.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {tutorial.tags.slice(0, 3).map((item) => (
                          <Link
                            key={item.id}
                            href={`/tags/${item.slug}`}
                            className="inline-block rounded-md bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary/80 transition-colors hover:bg-primary/14"
                          >
                            {item.name}
                          </Link>
                        ))}
                        {tutorial.tags.length > 3 && (
                          <span className="self-center font-mono text-[10px] text-muted-foreground">
                            +{tutorial.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-y-1.5 border-t border-border/30 pt-3 sm:mt-5 sm:pt-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {tutorial.authorUsername && (
                        <>
                          {tutorial.authorImage && (
                            <img
                              src={tutorial.authorImage}
                              alt=""
                              className="h-5 w-5 rounded-full ring-1 ring-border/50"
                            />
                          )}
                          <span className="font-medium text-slate-700">
                            {tutorial.authorName || tutorial.authorUsername}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {tutorial.lang && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
                          {tutorial.lang}
                        </span>
                      )}
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {tutorial.stepCount}
                        <span className="text-muted-foreground/50">步</span>
                      </span>
                      <span className="text-border/40">·</span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {tutorial.readingTime}
                        <span className="text-muted-foreground/50">min</span>
                      </span>
                      <Link
                        href={`/${tutorial.slug}`}
                        className="ml-1 text-sm text-muted-foreground/30 transition-all duration-200 hover:translate-x-0.5 hover:text-primary"
                      >
                        →
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-8">
            {page > 1 && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-slate-200 font-mono text-xs text-slate-600 hover:border-cyan-400/40 hover:bg-cyan-50/50 hover:text-cyan-700"
              >
                <Link
                  href={buildFilterUrl({
                    technology,
                    tag,
                    category,
                    level,
                    lang,
                    search,
                    sort,
                    page: page - 1,
                  })}
                >
                  ← 上一页
                </Link>
              </Button>
            )}
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-500">
              {page}
              <span className="text-slate-300">/</span>
              {totalPages}
            </span>
            {page < totalPages && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="border-slate-200 font-mono text-xs text-slate-600 hover:border-cyan-400/40 hover:bg-cyan-50/50 hover:text-cyan-700"
              >
                <Link
                  href={buildFilterUrl({
                    technology,
                    tag,
                    category,
                    level,
                    lang,
                    search,
                    sort,
                    page: page + 1,
                  })}
                >
                  下一页 →
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function buildFilterUrl(opts: {
  technology?: string | undefined;
  category?: string | undefined;
  level?: string | undefined;
  tag?: string | undefined;
  lang?: string | undefined;
  search?: string | undefined;
  sort?: string | undefined;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (opts.search) params.set('q', opts.search);
  if (opts.technology) params.set('technology', opts.technology);
  if (opts.category) params.set('category', opts.category);
  if (opts.level) params.set('level', opts.level);
  if (opts.tag && !opts.technology && !opts.category && !opts.level) {
    params.set('tag', opts.tag);
  }
  if (opts.lang) params.set('lang', opts.lang);
  if (opts.sort && opts.sort !== 'newest') params.set('sort', opts.sort);
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  const qs = params.toString();
  return qs ? `/explore?${qs}` : '/explore';
}
