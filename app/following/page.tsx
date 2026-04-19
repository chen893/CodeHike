import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CardDescription,
  CardTitle,
} from '@/components/ui/card';
import { getCurrentUser } from '@/auth';
import { generateOgMetadata } from '@/lib/utils/seo';
import { getFollowedTags, getFollowedTutorials } from '@/lib/services/follow-service';

export const metadata = {
  ...generateOgMetadata({
    title: '我的关注 — VibeDocs',
    description: '查看你关注的标签下的最新教程。',
    slug: 'following',
  }),
};

export default async function FollowingPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect('/api/auth/signin');

  const [followedTags, allTutorials] = await Promise.all([
    getFollowedTags(user.id),
    getFollowedTutorials(user.id),
  ]);

  return (
    <>
      <TopNav activePath="/following" user={user} />
      <div className="container-app space-y-8 pb-12 pt-20">
        {/* Header */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <div className="mb-3 font-mono text-[11px] tracking-wider text-slate-400">
              <span className="text-slate-300">{'// '}</span>
              following
              <span className="text-slate-300"> · {followedTags.length} tags</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              我的关注
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
              你关注了 {followedTags.length} 个标签下的最新教程。
            </p>
          </div>
        </div>

        {/* Followed tags */}
        {followedTags.length === 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-slate-500">你还没有关注任何标签。</p>
              <Button asChild className="mt-6 bg-slate-900 text-white hover:bg-slate-800">
                <Link href="/explore">去探索标签</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {followedTags.map(tag => (
                <Link key={tag.id} href={`/tags/${tag.slug}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-cyan-50 hover:text-cyan-700 transition-colors">
                    {tag.name}
                  </Badge>
                </Link>
              ))}
            </div>

            {/* Tutorial count */}
            <div className="flex items-center gap-2 font-mono text-xs text-slate-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400/60" />
              <span>
                共 <span className="font-semibold text-slate-800">{allTutorials.length}</span> 篇教程
              </span>
            </div>

            {/* Tutorial feed */}
            {allTutorials.length === 0 ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-slate-500">
                    关注的标签下暂无教程。稍后再来看看！
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
                {allTutorials.map(tutorial => (
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
          </>
        )}
      </div>
    </>
  );
}
