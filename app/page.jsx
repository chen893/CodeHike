import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardTitle,
} from "@/components/ui/card"
import { getHomePageData } from "@/lib/services/tutorial-queries"
import { generateOgMetadata } from "@/lib/utils/seo"
import { getCurrentUser } from "@/auth"

export const metadata = {
  title: "VibeDocs",
  description: "把源码变成逐步构建的交互式教程。",
  ...generateOgMetadata({
    title: "VibeDocs",
    description: "把源码变成逐步构建的交互式教程。",
    slug: "",
  }),
}

export default async function Page() {
  const { tutorials, publishedTutorials } = await getHomePageData()
  const user = await getCurrentUser()

  return (
    <AppShell activePath="/" user={user}>
      <div className="container-app space-y-14 py-10">
        <div className="relative overflow-hidden rounded-lg bg-slate-900 px-6 py-6 text-white shadow-lg sm:px-10 sm:py-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.25),_transparent_45%),linear-gradient(135deg,_#0f172a_0%,_#1e293b_100%)]" />

          <div className="relative z-10 flex flex-col items-start gap-8">
            <div className="space-y-6">
              <h1 className="text-4xl font-extrabold sm:text-5xl">
                VibeDocs
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                贴入源码，描述你想教什么，自动生成一份可编辑的逐步构建式教程。
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Button asChild size="lg" className="h-12 px-8 bg-primary font-bold text-primary-foreground shadow-[0_0_25px_rgba(34,211,238,0.35)] transition-all hover:bg-primary/90 active:scale-95">
                <Link href="/new">开始创建</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-6 border-white/20 bg-white/5 font-semibold text-white hover:bg-white/10"
              >
                <Link href="/drafts">草稿箱</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-6 border-white/20 bg-white/5 font-semibold text-white hover:bg-white/10"
              >
                <Link href="/explore">浏览教程</Link>
              </Button>
            </div>
          </div>
        </div>

        {publishedTutorials.length > 0 && (
          <section className="space-y-8">
            <SectionHeading
              title="已发布教程"
              description="可以直接阅读的交互式教程。"
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {publishedTutorials.map((pub) => (
                <Link key={pub.id} href={`/${pub.slug}`} className="group block">
                  <Card className="flex h-full flex-col rounded-lg border-border/60 bg-card p-6 transition-all hover:border-primary/30 hover:-translate-y-1 hover:shadow-lg">
                    <div className="flex-1 space-y-3">
                      <CardTitle className="text-lg font-bold text-foreground transition-colors group-hover:text-primary line-clamp-2">
                        {pub.tutorialDraftSnapshot.meta.title}
                      </CardTitle>
                      <CardDescription className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {pub.tutorialDraftSnapshot.meta.description}
                      </CardDescription>
                      <p className="truncate text-xs text-muted-foreground/50">
                        /{pub.slug}
                      </p>
                    </div>
                    <div className="mt-6 flex items-center justify-between border-t border-border/30 pt-4">
                      <div className="flex items-center gap-2">
                        {pub.lang && (
                          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                            {pub.lang}
                          </span>
                        )}
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                          {pub.stepCount} 步
                        </span>
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                          {pub.readingTime} 分钟
                        </span>
                      </div>
                      <span className="text-sm text-muted-foreground transition-colors group-hover:text-primary">→</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-8">
          <SectionHeading
            title="示例教程"
            description="内置的演示教程，用来验证渲染效果。"
          />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tutorials.map((tutorial) => (
              <Card
                key={tutorial.slug}
                className="group flex h-full flex-col rounded-lg border-border/60 bg-card p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex-1 space-y-3">
                  <CardTitle className="text-lg font-bold text-foreground transition-colors group-hover:text-primary line-clamp-2">
                    {tutorial.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {tutorial.description}
                  </CardDescription>
                </div>
                <div className="mt-6 space-y-4 border-t border-border/30 pt-4">
                  <div className="flex items-center gap-2">
                    {tutorial.lang && (
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                        {tutorial.lang}
                      </span>
                    )}
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      {tutorial.stepCount} 步
                    </span>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                      {tutorial.readingTime} 分钟
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <Button asChild variant="secondary" size="sm" className="flex-1 font-medium">
                      <Link href={`/${tutorial.slug}`}>静态</Link>
                    </Button>
                    <Button asChild variant="secondary" size="sm" className="flex-1 font-medium">
                      <Link href={`/${tutorial.slug}/request`}>远程</Link>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}

function SectionHeading({ title, description }) {
  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold text-foreground">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  )
}
