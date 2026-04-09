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
import { listTutorials } from "../lib/tutorial-registry"
import * as publishedRepo from "../lib/repositories/published-tutorial-repository"

export const metadata = {
  title: "VibeDocs",
  description: "把源码变成逐步构建的交互式教程。",
}

export default async function Page() {
  const tutorials = listTutorials()

  let publishedTutorials = []
  try {
    publishedTutorials = await publishedRepo.listPublished()
  } catch (err) {
    console.error("加载已发布教程列表失败:", err)
  }

  return (
    <AppShell activePath="/">
      <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-10 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-12 text-white shadow-2xl sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_40%),linear-gradient(135deg,_#0f172a_0%,_#1e293b_100%)]" />
          
          <div className="relative z-10 flex flex-col items-start gap-6">
            <div className="space-y-4">
              <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">
                VibeDocs
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-slate-300">
                贴入源码，描述你想教什么，自动生成一份可编辑的逐步构建式教程。
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-4">
              <Button asChild size="lg" className="bg-cyan-400 font-bold text-slate-950 hover:bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                <Link href="/new">开始创建</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/10 bg-white/5 font-semibold text-white hover:bg-white/10"
              >
                <Link href="/drafts">草稿箱</Link>
              </Button>
            </div>
          </div>
        </div>

        {publishedTutorials.length > 0 && (
          <section className="space-y-8">
            <SectionHeading
              eyebrow="已发布"
              title="已发布教程"
              description="可以直接阅读的交互式教程。"
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {publishedTutorials.map((pub) => (
                <Card
                  key={pub.id}
                  className="group flex flex-col border-slate-200/60 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
                >
                  <CardHeader className="flex-1 p-5 pb-4">
                    <div className="mb-3 flex items-center justify-between">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                        /{pub.slug}
                      </Badge>
                      <Badge className="bg-green-500/10 text-green-600 border-green-500/20">已发布</Badge>
                    </div>
                    <CardTitle className="mb-2 text-base font-bold text-slate-900 group-hover:text-cyan-600 transition-colors">
                      {pub.tutorialDraftSnapshot.meta.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-3 text-sm leading-relaxed text-slate-500">
                      {pub.tutorialDraftSnapshot.meta.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="border-t border-slate-50 p-5 pt-4">
                    <Button asChild className="w-full bg-slate-900 text-white hover:bg-slate-800">
                      <Link href={`/${pub.slug}`}>阅读全文</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-8">
          <SectionHeading
            eyebrow="示例"
            title="示例教程"
            description="内置的演示教程，用来验证渲染效果。"
          />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tutorials.map((tutorial) => (
              <Card
                key={tutorial.slug}
                className="group flex flex-col border-slate-200/60 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <CardHeader className="flex-1 p-5 pb-4">
                  <Badge variant="outline" className="mb-3 w-fit border-slate-200 text-slate-500">
                    /{tutorial.slug}
                  </Badge>
                  <CardTitle className="mb-2 text-base font-bold text-slate-900 group-hover:text-cyan-600 transition-colors">
                    {tutorial.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-3 text-sm leading-relaxed text-slate-500">
                    {tutorial.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 border-t border-slate-50 p-5 pt-4">
                  <div className="flex gap-2">
                    <Button asChild variant="secondary" size="sm" className="flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200">
                      <Link href={`/${tutorial.slug}`}>静态</Link>
                    </Button>
                    <Button asChild variant="secondary" size="sm" className="flex-1 bg-slate-100 text-slate-700 hover:bg-slate-200">
                      <Link href={`/${tutorial.slug}/request`}>远程</Link>
                    </Button>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full border-slate-200 text-slate-500 hover:bg-slate-50">
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
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px w-8 bg-cyan-500" />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-600">
          {eyebrow}
        </p>
      </div>
      <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      <p className="max-w-3xl text-base leading-relaxed text-slate-500">{description}</p>
    </div>
  )
}
