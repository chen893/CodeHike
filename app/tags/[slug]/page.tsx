import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TopNav } from '@/components/top-nav';
import { Badge } from '@/components/ui/badge';
import {
  CardDescription,
  CardTitle,
} from '@/components/ui/card';
import { getTagDetail } from '@/lib/services/tag-service';
import { getExploreData } from '@/lib/services/explore-service';
import { getCurrentUser } from '@/auth';
import { generateOgMetadata } from '@/lib/utils/seo';
import { trackTagViewed } from '@/lib/monitoring/analytics';
import { TagDetailClient } from '@/components/tags/tag-detail-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getTagDetail(slug);
  if (!detail) return { title: '标签未找到 — VibeDocs' };

  return {
    ...generateOgMetadata({
      title: `${detail.tag.name} — VibeDocs`,
      description: `浏览 ${detail.tag.name} 相关的教程和标签`,
      slug: `tags/${slug}`,
    }),
  };
}

export default async function TagDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getTagDetail(slug);
  if (!detail) notFound();

  const currentUser = await getCurrentUser();

  trackTagViewed(slug, 'tag_page', currentUser?.id);

  const { tutorials, total } = await getExploreData({ tag: slug });

  return (
    <>
      <TopNav activePath="/tags" user={currentUser} />
      <div className="container-app space-y-8 pb-12 pt-20">
        {/* Tag header */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <div className="mb-3 font-mono text-[11px] tracking-wider text-slate-400">
              <span className="text-slate-300">{'// '}</span>
              tag: <span className="text-cyan-600">{detail.tag.name}</span>
              {detail.tag.tagType && (
                <span className="text-slate-300"> · {tagTypeLabel(detail.tag.tagType)}</span>
              )}
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {detail.tag.name}
            </h1>

            <div className="mt-4">
              <TagDetailClient
                tag={JSON.parse(JSON.stringify(detail.tag))}
                isFollowing={false}
                relatedTags={JSON.parse(JSON.stringify(detail.relatedTags))}
              />
            </div>
          </div>
        </div>

        {/* Tutorial count */}
        <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
          <span>
            共 <span className="font-semibold text-slate-800">{total}</span> 篇教程
          </span>
        </div>

        {/* Tutorial grid */}
        {tutorials.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-slate-500">暂无使用该标签的教程。</p>
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
                        {tutorial.tags.slice(0, 3).map((t) => (
                          <Link
                            key={t.id}
                            href={`/tags/${t.slug}`}
                            className="inline-block rounded-md bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary/80 transition-colors hover:bg-primary/14"
                          >
                            {t.name}
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

        {/* Back link */}
        <div className="pt-4">
          <Link
            href="/tags"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          >
            ← 返回标签列表
          </Link>
        </div>
      </div>
    </>
  );
}

function tagTypeLabel(tagType: string): string {
  switch (tagType) {
    case 'technology':
      return '技术';
    case 'category':
      return '领域';
    case 'level':
      return '难度';
    default:
      return tagType;
  }
}
