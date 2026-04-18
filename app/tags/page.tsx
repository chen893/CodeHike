import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getTagsPageData } from '@/lib/services/explore-service';
import { getCurrentUser } from '@/auth';
import { generateOgMetadata } from '@/lib/utils/seo';

export const metadata = {
  ...generateOgMetadata({
    title: '标签 — VibeDocs',
    description: '浏览所有教程标签，按主题发现教程。',
    slug: 'tags',
  }),
};

export default async function TagsPage() {
  const tags = await getTagsPageData();
  const user = await getCurrentUser();

  return (
    <AppShell activePath="/tags" user={user}>
      <div className="container-app space-y-10 py-10">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-px w-8 bg-primary" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              标签
            </p>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            教程标签
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            按主题浏览所有已发布教程的标签。
          </p>
        </div>

        {tags.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-slate-400">暂无标签。教程发布后将自动生成标签。</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tags.map((tag) => (
              <Link key={tag.id} href={`/explore?tag=${tag.slug}`}>
                <Card className="group border-border/60 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <CardContent className="flex items-center justify-between p-5">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {tag.name}
                      </p>
                      <Badge variant="outline" className="text-[11px] border-border text-muted-foreground">
                        {tag.tutorialCount} 篇教程
                      </Badge>
                    </div>
                    <span className="text-muted-foreground/50 group-hover:text-primary transition-colors text-xl">
                      →
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
