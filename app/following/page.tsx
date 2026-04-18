import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
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
  if (!user) redirect('/api/auth/signin');

  const [followedTags, allTutorials] = await Promise.all([
    getFollowedTags(user.id),
    getFollowedTutorials(user.id),
  ]);

  return (
    <AppShell activePath="/following" user={user}>
      <div className="container-app space-y-8 py-10">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">我的关注</h1>
          <p className="text-sm text-muted-foreground">
            你关注了 {followedTags.length} 个标签
          </p>
        </div>

        {/* Followed tags */}
        {followedTags.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">你还没有关注任何标签。</p>
            <Button asChild className="mt-4 bg-primary text-primary-foreground">
              <Link href="/explore">去探索标签</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {followedTags.map(tag => (
                <Link key={tag.id} href={`/tags/${tag.slug}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors">
                    {tag.name}
                  </Badge>
                </Link>
              ))}
            </div>

            {/* Tutorial feed -- data comes from single getFollowedTutorials query */}
            {allTutorials.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  关注的标签下暂无教程。稍后再来看看！
                </p>
              </div>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {allTutorials.map(tutorial => (
                  <Link key={tutorial.id} href={`/${tutorial.slug}`} className="group block">
                    <Card className="flex h-full flex-col rounded-lg border-border/60 bg-card p-5 transition-all hover:border-primary/30 hover:-translate-y-1 hover:shadow-lg">
                      <div className="flex-1 space-y-3">
                        <CardTitle className="text-base font-bold text-foreground group-hover:text-primary line-clamp-2">
                          {tutorial.title}
                        </CardTitle>
                        {tutorial.description && (
                          <CardDescription className="line-clamp-2 text-sm text-muted-foreground">
                            {tutorial.description}
                          </CardDescription>
                        )}
                      </div>
                      <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {tutorial.authorUsername && <span>{tutorial.authorName || tutorial.authorUsername}</span>}
                          <span>{tutorial.stepCount} 步</span>
                          <span>{tutorial.readingTime} 分钟</span>
                        </div>
                        <span className="text-sm text-muted-foreground group-hover:text-primary">&rarr;</span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
