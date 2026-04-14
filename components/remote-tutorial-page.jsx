"use client"

import { TutorialScrollyDemo } from "./tutorial-scrolly-demo"
import { useRemoteResource } from "@/components/tutorial/use-remote-resource"
import { fetchTutorialPayloadBySlug } from "@/components/tutorial/tutorial-client"

import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { ChevronLeft, RefreshCcw } from "lucide-react"
import Link from "next/link"

export function RemoteTutorialPage({ slug, title }) {
  const { state, reload } = useRemoteResource({
    deps: [slug],
    load: () => fetchTutorialPayloadBySlug(slug),
  })

  if (state.status === "success") {
    return (
      <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)] text-slate-100">
        <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/40 backdrop-blur-xl">
          <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-4">
              <Link
                href="/"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="返回首页"
              >
                <ChevronLeft size={20} />
              </Link>
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2 overflow-hidden">
                  <h1 className="truncate text-sm font-bold text-white sm:text-base">
                    {state.data.title}
                  </h1>
                  <Badge variant="outline" className="h-5 shrink-0 border-cyan-500/30 bg-cyan-500/10 text-[10px] font-bold uppercase text-cyan-400">
                    远程
                  </Badge>
                </div>
                <p className="truncate text-[10px] font-medium text-slate-500 uppercase">
                  Slug: {slug}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                className="h-11 border-white/10 bg-white/5 px-4 text-slate-300 transition hover:bg-white/10 hover:text-white"
                onClick={() => void reload()}
              >
                <RefreshCcw size={16} className="sm:mr-2" />
                <span className="hidden sm:inline">刷新数据</span>
              </Button>
            </div>
          </div>
        </header>

        <TutorialScrollyDemo
          steps={state.data.steps}
          intro={state.data.intro}
          title={state.data.title}
          fileName={state.data.fileName}
          slug={slug}
          showBreadcrumb={false}
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)] px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center">
        <div className="w-full rounded-lg border border-white/10 bg-white/[0.02] p-8 text-center shadow-[0_32px_120px_rgba(15,23,42,0.4)] backdrop-blur-3xl sm:p-12">
          {state.status === "loading" ? (
            <div className="space-y-8">
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/5">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400" />
              </div>
              
              <div className="space-y-4">
                <div className="mx-auto h-8 w-3/4 animate-pulse rounded-lg bg-white/5" />
                <div className="mx-auto h-4 w-1/2 animate-pulse rounded-md bg-white/5" />
              </div>

              <div className="space-y-6 pt-4">
                <div className="mx-auto h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white/5">
                  <div className="h-full w-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs font-bold uppercase text-cyan-400/60">
                    正在加载远程教程
                  </p>
                  <p className="text-[10px] text-slate-500">正在建立与远程内容的连接...</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-lg bg-white/[0.03]" />
                ))}
              </div>
            </div>
          ) : (
            <div className="py-4">
              <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400">
                <RefreshCcw size={32} />
              </div>
              
              <div className="mb-6 inline-flex rounded-md bg-rose-500/10 px-4 py-1.5 text-[10px] font-bold uppercase text-rose-400 ring-1 ring-inset ring-rose-500/20">
                加载失败
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-3">无法加载教程</h2>
              <p className="text-slate-400 max-w-sm mx-auto leading-relaxed">{state.message || "远程服务器未响应，请检查链接是否正确。"}</p>
              
              <Button
                variant="outline"
                className="mt-10 h-12 rounded-lg border-white/10 bg-white/5 px-8 text-white transition-all hover:bg-white/10 active:scale-95"
                onClick={() => void reload()}
              >
                <RefreshCcw size={18} className="mr-2" />
                重试加载
              </Button>
            </div>
          )}
        </div>
        
        <div className="mt-12 flex items-center gap-3 text-slate-500/50">
          <div className="h-px w-8 bg-white/5" />
          <p className="text-[10px] font-bold uppercase">远程教程加载</p>
          <div className="h-px w-8 bg-white/5" />
        </div>
      </div>
    </main>
  )
}
