import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getCurrentUser } from '@/auth';
import { getTagsPageData } from '@/lib/services/explore-service';
import { generateOgMetadata } from '@/lib/utils/seo';

export const metadata = {
  ...generateOgMetadata({
    title: '标签 — VibeDocs',
    description: '浏览所有教程标签，按主题发现教程。',
    slug: 'tags',
  }),
};

export default async function TagsPage() {
  const allTags = await getTagsPageData();
  const user = await getCurrentUser();
  const tags = allTags.filter((t) => t.tutorialCount > 0);
  const totalTutorials = tags.reduce((sum, item) => sum + item.tutorialCount, 0);
  const sorted = [...tags].sort((a, b) => b.tutorialCount - a.tutorialCount);
  const maxCount = sorted.length > 0 ? Math.max(sorted[0].tutorialCount, 1) : 1;

  return (
    <>
      <TopNav activePath="/tags" user={user} />
      <div className="container-app py-20 sm:py-24">
        <header className="mb-8 sm:mb-16">
          <div className="mb-4 flex items-center gap-2 font-mono text-[11px] text-muted-foreground/60 sm:text-xs">
            <span className="text-primary/70">~/</span>
            <span>vibedocs</span>
            <span className="text-border">/</span>
            <span className="text-foreground/80">tags</span>
          </div>
          <div className="flex items-baseline gap-3 sm:gap-4">
            <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-5xl">
              <span className="font-mono text-2xl text-primary/30 sm:text-4xl">#</span>
              教程标签
            </h1>
            {tags.length > 0 && (
              <span className="font-mono text-xs text-muted-foreground/50 sm:text-sm">
                [{tags.length}]
              </span>
            )}
          </div>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:mt-3 sm:text-base">
            按主题浏览所有已发布教程的标签。
          </p>
          <div className="mt-4 flex items-center gap-3 sm:mt-6">
            <div className="h-px max-w-[200px] flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
            <span className="hidden font-mono text-[10px] text-muted-foreground/30 sm:inline">
              tags.map(t =&gt; ...)
            </span>
          </div>
        </header>

        {tags.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/40 pb-4 font-mono text-[11px] text-muted-foreground/60 sm:mb-8 sm:pb-5 sm:text-xs">
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/50" />
                <span>{tags.length} 个标签</span>
              </div>
              <span className="hidden text-border/60 sm:inline">//</span>
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/50" />
                <span>{totalTutorials} 篇教程</span>
              </div>
              <span className="hidden text-border/60 sm:inline">//</span>
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400/50" />
                <span>按热度排序</span>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {sorted.map((tag) => {
                const count = tag.tutorialCount;
                const isHot = count >= 5;
                const isWarm = count >= 2 && count < 5;
                const ratio = Math.max(count / maxCount, 0.06);

                return (
                  <Link
                    key={tag.id}
                    href={`/tags/${tag.slug}`}
                    className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Card
                      className={`group relative overflow-hidden border-border/40 bg-card transition-all duration-300 hover:border-primary/25 hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)] ${
                        isHot ? 'sm:col-span-2 lg:col-span-1' : ''
                      }`}
                    >
                      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/0 to-transparent transition-all duration-300 group-hover:via-primary/50" />
                      {isHot && (
                        <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/[0.04] opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                      )}
                      <CardContent className="relative p-4 sm:p-6">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 space-y-1.5 sm:space-y-2">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <span
                                className={`font-mono text-[12px] sm:text-[13px] ${
                                  isHot
                                    ? 'text-primary/70'
                                    : isWarm
                                      ? 'text-primary/50'
                                      : 'text-primary/30'
                                }`}
                              >
                                #
                              </span>
                              <p
                                className={`truncate text-sm transition-colors duration-200 group-hover:text-primary sm:text-base ${
                                  isHot ? 'font-bold text-foreground' : 'font-semibold text-foreground'
                                }`}
                              >
                                {tag.name}
                              </p>
                              {isHot && (
                                <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary/70 sm:inline">
                                  HOT
                                </span>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className="border-border/60 font-mono text-[10px] text-muted-foreground sm:text-[11px]"
                            >
                              {tag.tutorialCount} 篇教程
                            </Badge>
                          </div>
                          <span className="shrink-0 text-muted-foreground/30 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-primary/60">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="rotate-[-45deg] sm:h-4 sm:w-4">
                              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                        </div>
                        <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-border/25 sm:mt-3 sm:h-1">
                          <div
                            className={`h-full rounded-full transition-all duration-500 group-hover:opacity-90 ${
                              isHot
                                ? 'bg-primary/40 group-hover:bg-primary/60'
                                : isWarm
                                  ? 'bg-primary/25 group-hover:bg-primary/40'
                                  : 'bg-primary/10 group-hover:bg-primary/25'
                            }`}
                            style={{ width: `${ratio * 100}%` }}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-14 text-center sm:px-8 sm:py-16">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-muted/60">
        <span className="font-mono text-xl text-muted-foreground/50">#</span>
      </div>
      <p className="text-sm font-medium text-muted-foreground/80">暂无标签</p>
      <p className="mt-1 text-xs text-muted-foreground/50">教程发布后将自动生成标签。</p>
      <div className="mt-5 rounded-md bg-muted/40 px-4 py-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground/40">
        <span className="text-emerald-500/50">$</span> vibedocs publish
        <br />
        <span className="text-muted-foreground/25">→ tags will appear here</span>
        <span className="ml-1 inline-block h-3 w-[6px] animate-pulse bg-primary/30" />
      </div>
    </div>
  );
}
