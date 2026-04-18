import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardTitle,
} from '@/components/ui/card';
import { getTagDetail } from '@/lib/services/tag-service';
import { getExploreData } from '@/lib/services/explore-service';
import { getCurrentUser } from '@/auth';
import { generateOgMetadata } from '@/lib/utils/seo';
import { estimateReadingTime } from '@/lib/utils/seo';
import { trackTagViewed } from '@/lib/monitoring/analytics';
import { TagDetailClient } from '@/components/tags/tag-detail-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getTagDetail(slug);
  if (!detail) return { title: '\u6807\u7b7e\u672a\u627e\u5230 \u2014 VibeDocs' };

  return {
    ...generateOgMetadata({
      title: `${detail.tag.name} \u2014 VibeDocs`,
      description: `\u6d4f\u89c8 ${detail.tag.name} \u76f8\u5173\u7684\u6559\u7a0b\u548c\u6807\u7b7e`,
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

  // Fire-and-forget tracking
  trackTagViewed(slug, 'tag_page', currentUser?.id);

  // Fetch tutorials for this tag (backward compat filter)
  const { tutorials, total } = await getExploreData({ tag: slug });

  return (
    <AppShell activePath="/tags" user={currentUser}>
      <div className="container-app space-y-10 py-10">
        {/* Tag header */}
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px w-8 bg-primary" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                \u6807\u7b7e\u8be6\u60c5
              </p>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                {detail.tag.name}
              </h1>
              {detail.tag.tagType && (
                <Badge variant="outline" className="text-[11px] border-border text-muted-foreground">
                  {tagTypeLabel(detail.tag.tagType)}
                </Badge>
              )}
            </div>
          </div>

          {/* Follow button + related tags (client component) */}
          <TagDetailClient
            tag={JSON.parse(JSON.stringify(detail.tag))}
            isFollowing={false}
            relatedTags={JSON.parse(JSON.stringify(detail.relatedTags))}
          />
        </div>

        {/* Tutorial count */}
        <p className="text-sm text-muted-foreground">
          \u5171 {total} \u7bc7\u6559\u7a0b
        </p>

        {/* Tutorial grid */}
        {tutorials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-muted-foreground">
              \u6682\u65e0\u4f7f\u7528\u8be5\u6807\u7b7e\u7684\u6559\u7a0b\u3002
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tutorials.map((tutorial) => (
              <Link key={tutorial.id} href={`/${tutorial.slug}`} className="group block">
                <Card className="flex h-full flex-col rounded-lg border-border/60 bg-card p-5 transition-all hover:border-primary/30 hover:-translate-y-1 hover:shadow-lg">
                  <div className="flex-1 space-y-3">
                    <CardTitle className="text-base font-bold text-foreground transition-colors group-hover:text-primary line-clamp-2">
                      {tutorial.title}
                    </CardTitle>
                    {tutorial.description && (
                      <CardDescription className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {tutorial.description}
                      </CardDescription>
                    )}
                    {tutorial.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tutorial.tags.slice(0, 3).map((t) => (
                          <Link
                            key={t.id}
                            href={`/explore?technology=${t.slug}`}
                            className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                          >
                            {t.name}
                          </Link>
                        ))}
                        {tutorial.tags.length > 3 && (
                          <span className="self-center text-[10px] text-muted-foreground">
                            +{tutorial.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {tutorial.authorUsername && (
                        <>
                          {tutorial.authorImage && (
                            <img src={tutorial.authorImage} alt="" className="h-4 w-4 rounded-full" />
                          )}
                          <span>{tutorial.authorName || tutorial.authorUsername}</span>
                          <span className="text-border">\u00b7</span>
                        </>
                      )}
                      {tutorial.lang && <span>{tutorial.lang}</span>}
                      <span>{tutorial.stepCount} \u6b65</span>
                      <span>{tutorial.readingTime} \u5206\u949f</span>
                    </div>
                    <span className="text-sm text-muted-foreground transition-colors group-hover:text-primary">
                      \u2192
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Back link */}
        <div className="pt-4">
          <Button asChild variant="ghost" size="sm">
            <Link href="/tags">
              \u2190 \u8fd4\u56de\u6807\u7b7e\u5217\u8868
            </Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function tagTypeLabel(tagType: string): string {
  switch (tagType) {
    case 'technology':
      return '\u6280\u672f';
    case 'category':
      return '\u9886\u57df';
    case 'level':
      return '\u96be\u5ea6';
    default:
      return tagType;
  }
}
