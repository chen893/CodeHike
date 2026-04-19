import Link from "next/link"
import { getHomePageData } from "@/lib/services/tutorial-queries"
import { generateOgMetadata } from "@/lib/utils/seo"
import { getCurrentUser } from "@/auth"
import { TopNav } from "@/components/top-nav"

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
    <div className="min-h-screen bg-white text-slate-800">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white">
        跳转到主要内容
      </a>
      <TopNav activePath="/" user={user} variant="light" />

      <main id="main-content" className="pt-14">
        {/* ── Hero ── */}
        <section className="px-6 pb-20 pt-28 sm:px-8 sm:pb-28 sm:pt-36">
          <div className="mx-auto max-w-2xl">
            <p className="mb-5 font-mono text-xs text-slate-400">
              <span className="text-slate-300">{'// '}</span>
              source → interactive tutorial
            </p>
            <h1 className="text-3xl font-bold leading-[1.2] tracking-tight text-slate-900 sm:text-[2.75rem]">
              把源码变成
              <br />
              逐步构建的教程
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-500">
              粘贴任意源码文件，AI 自动拆解为带注释、高亮、diff 的交互式教程。无需手动排版，三分钟生成。
            </p>

            {/* Inline pipeline as code block */}
            <div className="mt-8 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[13px] leading-loose">
              <p className="text-slate-500">
                <span className="text-cyan-600">paste</span> source code
              </p>
              <p className="text-slate-500">
                <span className="text-cyan-600">analyze</span>{" "}logic &amp; patterns
              </p>
              <p className="text-slate-500">
                <span className="text-cyan-600">generate</span> step-by-step tutorial
              </p>
            </div>

            <div className="mt-8 flex gap-3">
              <Link
                href="/new"
                className="inline-flex h-10 items-center rounded-md bg-slate-900 px-5 text-sm font-medium text-white transition-colors hover:bg-slate-800 active:scale-[0.98]"
              >
                开始创建
              </Link>
              <Link
                href="/explore"
                className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
              >
                浏览案例
              </Link>
            </div>
          </div>
        </section>

        {/* ── Published Showcase ── */}
        {publishedTutorials.length > 0 && (
          <section className="border-t border-slate-100 py-16 sm:py-20">
            <div className="mx-auto max-w-3xl px-6 sm:px-8">
              <div className="mb-8 flex items-baseline justify-between">
                <div>
                  <p className="mb-2 font-mono text-xs text-slate-400">
                    <span className="text-slate-300">{'// '}</span>showcase
                  </p>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">
                    案例展示
                  </h2>
                </div>
                <Link
                  href="/explore"
                  className="hidden font-mono text-xs text-slate-400 transition-colors hover:text-cyan-600 sm:block"
                >
                  查看全部 →
                </Link>
              </div>

              <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                {publishedTutorials.map((pub, i) => (
                  <Link
                    key={pub.id}
                    href={`/${pub.slug}`}
                    className={`group block px-4 py-3 transition-colors hover:bg-slate-50 ${
                      i > 0 ? 'border-t border-slate-100' : ''
                    }`}
                  >
                    {/* Row: slug · title · meta */}
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 text-[8px] text-emerald-500">●</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-slate-400 group-hover:text-slate-600 transition-colors">
                          {pub.slug}
                        </p>
                        <p className="mt-0.5 truncate text-[14px] font-medium text-slate-800 group-hover:text-slate-900 transition-colors">
                          {pub.tutorialDraftSnapshot.meta.title}
                        </p>
                        <div className="mt-1 flex items-center gap-2 sm:hidden">
                          {pub.lang && (
                            <span className="font-mono text-[10px] text-cyan-600">
                              {pub.lang}
                            </span>
                          )}
                          <span className="font-mono text-[10px] text-slate-400">
                            {pub.stepCount}步 · {pub.readingTime}m
                          </span>
                        </div>
                      </div>
                      <div className="hidden shrink-0 items-center gap-3 sm:flex">
                        {pub.lang && (
                          <span className="font-mono text-[10px] text-cyan-600">
                            {pub.lang}
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-slate-400">
                          {pub.stepCount}步 · {pub.readingTime}m
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-4 text-center sm:hidden">
                <Link href="/explore" className="font-mono text-xs text-slate-400 transition-colors hover:text-cyan-600">
                  查看全部案例 →
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ── Sample Demos ── */}
        <section className="border-t border-slate-100 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-6 sm:px-8">
            <p className="mb-2 font-mono text-xs text-slate-400">
              <span className="text-slate-300">{'// '}</span>demos
            </p>
            <h2 className="mb-6 text-xl font-bold tracking-tight text-slate-900">
              内置演示
            </h2>

            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              {tutorials.map((tutorial, i) => (
                <div
                  key={tutorial.slug}
                  className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${
                    i > 0 ? 'border-t border-slate-100' : ''
                  }`}
                >
                  {tutorial.lang ? (
                    <span className="w-8 shrink-0 font-mono text-[11px] text-cyan-600">
                      {tutorial.lang}
                    </span>
                  ) : (
                    <span className="w-8 shrink-0 font-mono text-[11px] text-slate-300">—</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${tutorial.slug}`}
                      className="truncate text-[13px] font-medium text-slate-700 transition-colors hover:text-slate-900"
                    >
                      {tutorial.title}
                    </Link>
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-400 sm:hidden">
                      {tutorial.stepCount}步 · {tutorial.readingTime}m
                    </span>
                  </div>
                  <span className="hidden shrink-0 font-mono text-[10px] text-slate-400 sm:block">
                    {tutorial.stepCount}步 · {tutorial.readingTime}m
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <Link
                      href={`/${tutorial.slug}`}
                      className="rounded border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
                    >
                      open
                    </Link>
                    <Link
                      href={`/${tutorial.slug}/request`}
                      className="rounded border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
                    >
                      live
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="border-t border-slate-100 py-16">
          <div className="mx-auto max-w-2xl px-6 text-center sm:px-8">
            <p className="text-[15px] text-slate-500">
              准备好了？三分钟生成你的第一篇教程。
            </p>
            <Link
              href="/new"
              className="mt-4 inline-flex h-10 items-center rounded-md bg-slate-900 px-6 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              开始创建 →
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 py-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-6 font-mono text-[11px] text-slate-400 sm:flex-row sm:px-8">
          <span>vibedocs © 2026</span>
          <div className="flex items-center gap-4">
            <Link href="/explore" className="transition-colors hover:text-slate-600">探索</Link>
            <Link href="/auth/signin" className="transition-colors hover:text-slate-600">登录</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
