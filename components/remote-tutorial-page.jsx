"use client"

import { TutorialScrollyDemo } from "./tutorial-scrolly-demo"
import { useRemoteResource } from "@/components/tutorial/use-remote-resource"
import { fetchTutorialPayloadBySlug } from "@/components/tutorial/tutorial-client"

import { Badge } from "./ui/badge"
import { Button } from "./ui/button"
import { ChevronLeft, ExternalLink, RefreshCcw } from "lucide-react"
import Link from "next/link"

export function RemoteTutorialPage({ slug, title }) {
  const { state, reload } = useRemoteResource({
    deps: [slug],
    load: () => fetchTutorialPayloadBySlug(slug),
  })

  if (state.status === "success") {
    return (
      <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)] text-slate-100">
        {/* Modern Sticky Header */}
        <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/40 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft size={18} />
              </Link>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold tracking-tight text-white sm:text-base">
                    {state.data.title}
                  </h1>
                  <Badge variant="outline" className="h-5 border-cyan-500/30 bg-cyan-500/10 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    Remote
                  </Badge>
                </div>
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">
                  Slug: {slug}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="hidden border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white sm:flex"
                onClick={() => void reload()}
              >
                <RefreshCcw size={14} className="mr-2" />
                刷新数据
              </Button>
              <Button
                size="sm"
                className="bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              >
                <ExternalLink size={14} className="mr-2" />
                分享
              </Button>
            </div>
          </div>
        </header>

        <TutorialScrollyDemo
          steps={state.data.steps}
          intro={state.data.intro}
          title={state.data.title}
          fileName={state.data.fileName}
        />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)] px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center">
        <div className="w-full rounded-[2.5rem] border border-white/10 bg-white/[0.02] p-10 text-center shadow-[0_32px_120px_rgba(15,23,42,0.4)] backdrop-blur-3xl">
          <div className="relative mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-[2rem] border border-cyan-400/20 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,0.15)]">
            <div className="h-10 w-10 animate-pulse rounded-2xl bg-cyan-400/40" />
            <div className="absolute inset-0 animate-ping rounded-[2rem] border border-cyan-400/20 opacity-20" />
          </div>
          
          <h1 className="text-3xl font-bold tracking-tight text-white">{title}</h1>
          
          {state.status === "loading" ? (
            <div className="mt-6 space-y-6">
              <p className="text-base text-slate-300">正在加载教程...</p>
              <div
                className="mx-auto h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white/10"
                aria-hidden="true"
              >
                <div className="h-full w-2/3 animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                连接成功，正在获取数据
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <div className="mb-6 inline-flex rounded-full bg-rose-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-rose-400 ring-1 ring-inset ring-rose-500/20">
                加载失败
              </div>
              <p className="text-slate-300">{state.message}</p>
              <Button
                variant="outline"
                className="mt-8 border-white/10 bg-white/5 hover:bg-white/10"
                onClick={() => void reload()}
              >
                <RefreshCcw size={16} className="mr-2" />
                重试加载
              </Button>
            </div>
          )}
        </div>
        
        {/* Placeholder Guide for Empty State */}
        <div className="mt-12 flex items-center gap-3 text-slate-500">
          <div className="h-px w-12 bg-white/10" />
          <p className="text-[11px] font-bold uppercase tracking-[0.2em]">VibeDocs</p>
          <div className="h-px w-12 bg-white/10" />
        </div>
      </div>
    </main>
  )
}
