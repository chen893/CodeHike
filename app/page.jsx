import Link from "next/link"
import { AppShell } from "@/components/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
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
      <div className="mx-auto w-full max-w-6xl space-y-20 px-4 py-12 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-lg bg-slate-900 px-6 py-12 text-white shadow-2xl sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.25),_transparent_45%),linear-gradient(135deg,_#0f172a_0%,_#1e293b_100%)]" />
          
          <div className="relative z-10 flex flex-col items-start gap-8">
            <div className="space-y-6">
              <h1 className="text-5xl font-extrabold sm:text-7xl">
                VibeDocs
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-slate-300 sm:text-xl">
                贴入源码，描述你想教什么，自动生成一份可编辑的逐步构建式教程。
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Button asChild size="lg" className="h-12 px-8 bg-cyan-400 font-bold text-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.35)] transition-all hover:bg-cyan-300 active:scale-95">
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
          <section className="space-y-10">
            <SectionHeading
              eyebrow="已发布"
              title="已发布教程"
              description="可以直接阅读的交互式教程。"
            />
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {publishedTutorials.map((pub) => (
                <Card
                  key={pub.id}
                  className="group flex flex-col overflow-hidden rounded-lg border-slate-200/60 bg-white shadow-sm transition-all hover:-translate-y-1.5 hover:shadow-xl"
                >
                  <CardHeader className="flex-1 p-6 pb-4">
                    <div className="mb-4 flex items-center justify-between">
                      <Badge variant="secondary" className="bg-slate-100/80 text-slate-600 font-medium">
                        /{pub.slug}
                      </Badge>
                      <Badge className="bg-cyan-500/10 text-cyan-700 border-cyan-500/20 font-semibold">已发布</Badge>
                    </div>
                    <CardTitle className="mb-3 text-lg font-bold text-slate-900 group-hover:text-cyan-600 transition-colors line-clamp-2">
                      {pub.tutorialDraftSnapshot.meta.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-3 text-[14px] leading-relaxed text-slate-500">
                      {pub.tutorialDraftSnapshot.meta.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 border-t border-slate-50 p-6 pt-5">
                    <div className="flex flex-wrap gap-2">
                      {pub.lang && (
                        <Badge variant="outline" className="text-xs border-slate-200 text-slate-500 font-normal">
                          {pub.lang}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs border-slate-200 text-slate-500 font-normal">
                        {pub.stepCount} 步
                      </Badge>
                      <Badge variant="outline" className="text-xs border-slate-200 text-slate-500 font-normal">
                        约 {pub.readingTime} 分钟
                      </Badge>
                    </div>
                    <Button asChild className="h-11 w-full bg-slate-900 text-white hover:bg-cyan-600 transition-colors font-semibold">
                      <Link href={`/${pub.slug}`}>阅读全文</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-10">
          <SectionHeading
            eyebrow="示例"
            title="示例教程"
            description="内置的演示教程，用来验证渲染效果。"
          />
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {tutorials.map((tutorial) => (
              <Card
                key={tutorial.slug}
                className="group flex flex-col overflow-hidden rounded-lg border-slate-200/60 bg-white shadow-sm transition-all hover:-translate-y-1.5 hover:shadow-xl"
              >
                <CardHeader className="flex-1 p-6 pb-4">
                  <Badge variant="outline" className="mb-4 w-fit border-slate-200 text-slate-500 font-medium">
                    /{tutorial.slug}
                  </Badge>
                  <CardTitle className="mb-3 text-lg font-bold text-slate-900 group-hover:text-cyan-600 transition-colors line-clamp-2">
                    {tutorial.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-3 text-[14px] leading-relaxed text-slate-500">
                    {tutorial.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 border-t border-slate-50 p-6 pt-5">
                  <div className="flex flex-wrap gap-2">
                    {tutorial.lang && (
                      <Badge variant="outline" className="text-xs border-slate-200 text-slate-500 font-normal">
                        {tutorial.lang}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs border-slate-200 text-slate-500 font-normal">
                      {tutorial.stepCount} 步
                    </Badge>
                    <Badge variant="outline" className="text-xs border-slate-200 text-slate-500 font-normal">
                      约 {tutorial.readingTime} 分钟
                    </Badge>
                  </div>
                  <div className="flex gap-3">
                    <Button asChild variant="secondary" className="h-11 flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold">
                      <Link href={`/${tutorial.slug}`}>静态</Link>
                    </Button>
                    <Button asChild variant="secondary" className="h-11 flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold">
                      <Link href={`/${tutorial.slug}/request`}>远程</Link>
                    </Button>
                  </div>
                  <Button asChild variant="outline" className="h-11 w-full border-slate-200 text-slate-500 hover:bg-slate-50 font-medium">
                    <Link href={`/api/tutorials/${tutorial.slug}`}>查看原始数据</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  )
}

function SectionHeading({ eyebrow, title, description }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px w-10 bg-cyan-500" />
        <p className="text-xs font-bold uppercase text-cyan-600">
          {eyebrow}
        </p>
      </div>
      <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">{title}</h2>
      <p className="max-w-3xl text-base leading-relaxed text-slate-500">{description}</p>
    </div>
  )
}
