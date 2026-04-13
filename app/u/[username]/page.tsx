import { notFound } from 'next/navigation';
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
import { getPublicProfile, getProfileTutorialData } from '@/lib/services/user-profile-service';
import { getCurrentUser } from '@/auth';
import { generateOgMetadata } from '@/lib/utils/seo';
import { trackProfileViewed } from '@/lib/monitoring/analytics';
import { estimateReadingTime } from '@/lib/utils/seo';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) return { title: '用户未找到 — VibeDocs' };

  return {
    ...generateOgMetadata({
      title: `${profile.name || profile.username} — VibeDocs`,
      description: profile.bio || `${profile.name || profile.username} 的教程合集`,
      slug: `u/${username}`,
    }),
  };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) notFound();

  const currentUser = await getCurrentUser();
  const isOwnProfile = currentUser?.id === profile.id;

  // Fire-and-forget tracking
  trackProfileViewed(username, currentUser?.id);

  const tutorials = await getProfileTutorialData(username);

  return (
    <AppShell activePath="" user={currentUser}>
      <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        {/* Profile header */}
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 px-8 py-10 text-white shadow-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.15),_transparent_40%)]" />
          <div className="relative z-10 flex items-start gap-6">
            {/* Avatar */}
            {profile.image ? (
              <img
                src={profile.image}
                alt={profile.name || profile.username}
                className="h-20 w-20 rounded-full border-2 border-white/20 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/20 bg-cyan-500/20 text-2xl font-bold text-cyan-300">
                {(profile.name || profile.username).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">
                {profile.name || profile.username}
              </h1>
              <p className="text-sm text-cyan-300">@{profile.username}</p>
              {profile.bio && (
                <p className="max-w-lg text-sm leading-relaxed text-slate-300">
                  {profile.bio}
                </p>
              )}
              <div className="flex items-center gap-3 pt-1">
                <Badge className="bg-white/10 text-white border-white/20">
                  {profile.tutorialCount} 篇已发布教程
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Tutorial grid */}
        {tutorials.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
            <p className="text-sm text-slate-400">暂无已发布的教程。</p>
          </div>
        ) : (
          <section className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">已发布教程</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {tutorials.map((t) => {
                const draft = t.tutorialDraftSnapshot;
                return (
                  <Card
                    key={t.id}
                    className="group flex flex-col border-slate-200/60 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
                  >
                    <CardHeader className="flex-1 p-5 pb-4">
                      <Badge variant="secondary" className="mb-3 w-fit bg-slate-100 text-slate-600">
                        /{t.slug}
                      </Badge>
                      <CardTitle className="mb-2 text-base font-bold text-slate-900 group-hover:text-cyan-600 transition-colors">
                        {draft.meta.title}
                      </CardTitle>
                      {draft.meta.description && (
                        <CardDescription className="line-clamp-3 text-sm leading-relaxed text-slate-500">
                          {draft.meta.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3 border-t border-slate-50 p-5 pt-4">
                      <div className="flex flex-wrap gap-1.5">
                        {draft.meta.lang && (
                          <Badge variant="outline" className="text-[11px] border-slate-200 text-slate-500">
                            {draft.meta.lang}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[11px] border-slate-200 text-slate-500">
                          {draft.steps.length} 步
                        </Badge>
                        <Badge variant="outline" className="text-[11px] border-slate-200 text-slate-500">
                          约 {estimateReadingTime(draft.steps.length)} 分钟
                        </Badge>
                      </div>
                      <Button asChild className="w-full bg-slate-900 text-white hover:bg-slate-800">
                        <Link href={`/${t.slug}`}>阅读全文</Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
