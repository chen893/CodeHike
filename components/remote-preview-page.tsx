'use client';

import { TutorialScrollyDemo } from './tutorial-scrolly-demo';
import { useRemoteResource } from '@/components/tutorial/use-remote-resource';
import { fetchTutorialPreviewPayload } from '@/components/tutorial/tutorial-client';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ChevronLeft, Edit3, Rocket, RefreshCcw } from 'lucide-react';
import Link from 'next/link';

interface RemotePreviewPageProps {
  fetchUrl: string;
  title: string;
}

export function RemotePreviewPage({ fetchUrl, title }: RemotePreviewPageProps) {
  const draftId = fetchUrl.split('/')[3];
  const { state, reload } = useRemoteResource({
    deps: [fetchUrl],
    load: () => fetchTutorialPreviewPayload(fetchUrl),
  });

  if (state.status === 'loading') {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)] px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center">
          <div className="w-full rounded-lg border border-white/10 bg-white/[0.02] p-8 text-center shadow-[0_32px_120px_rgba(15,23,42,0.4)] backdrop-blur-3xl sm:p-12">
            <div className="space-y-8">
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/5">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-400/20 border-t-amber-400" />
              </div>
              
              <div className="space-y-4">
                <div className="mx-auto h-8 w-3/4 animate-pulse rounded-lg bg-white/5" />
                <div className="mx-auto h-4 w-1/2 animate-pulse rounded-md bg-white/5" />
              </div>

              <div className="space-y-6 pt-4">
                <div className="mx-auto h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white/5">
                  <div className="h-full w-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
                </div>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-xs font-bold uppercase text-amber-400/60">
                    正在准备草稿预览
                  </p>
                  <p className="text-[10px] text-slate-500">正在从工作区获取最新草稿数据...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)] px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center">
          <div className="w-full rounded-lg border border-rose-500/20 bg-rose-500/5 p-10 text-center shadow-[0_32px_120px_rgba(15,23,42,0.4)] backdrop-blur-3xl">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500">
              <RefreshCcw size={32} />
            </div>
            <p className="text-xl font-bold text-rose-50">预览加载失败</p>
            <p className="mt-3 text-sm text-rose-100/60 leading-relaxed max-w-xs mx-auto">{state.message}</p>
            <Button
              className="mt-8 h-12 rounded-lg bg-rose-500 px-8 text-white transition-all hover:bg-rose-600"
              onClick={() => void reload()}
            >
              重试加载
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const payload = state.data;

  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-200/50 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/drafts/${draftId}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              aria-label="返回编辑"
            >
              <ChevronLeft size={18} />
            </Link>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2 overflow-hidden">
                <h1 className="truncate text-sm font-bold text-slate-900">
                  {payload.title}
                </h1>
                <Badge variant="outline" className="h-5 shrink-0 border-slate-300 bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                  预览
                </Badge>
              </div>
              <div className="flex items-center gap-2 overflow-hidden text-[10px] font-medium text-slate-400">
                <span className="truncate">草稿: {draftId}</span>
                <span className="shrink-0">·</span>
                <span className="shrink-0 text-cyan-600/60">自动同步</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="hidden h-9 border-slate-200 px-4 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 sm:flex"
            >
              <Link href={`/drafts/${draftId}`}>
                <Edit3 size={14} className="mr-2" />
                继续编辑
              </Link>
            </Button>
            <Button
              className="h-9 bg-cyan-500 px-4 text-slate-950 hover:bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.25)] transition-all active:scale-95"
            >
              <Rocket size={14} className="sm:mr-2" />
              <span className="hidden sm:inline">发布教程</span>
            </Button>
          </div>
        </div>
      </header>

      <TutorialScrollyDemo
        steps={payload.steps}
        intro={payload.intro}
        title={payload.title}
        fileName={payload.fileName}
        showBreadcrumb={false}
        chapters={payload.chapters}
        stepChapterMeta={payload.stepChapterMeta}
      />
    </main>
  );
}
