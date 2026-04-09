'use client';

import { useEffect, useRef, useState } from 'react';
import { TutorialScrollyDemo } from './tutorial-scrolly-demo';
import { withBasePath } from '@/lib/base-path';

import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ChevronLeft, Edit3, Rocket, RefreshCcw } from 'lucide-react';
import Link from 'next/link';

interface RemotePreviewPageProps {
  fetchUrl: string;
  title: string;
}

export function RemotePreviewPage({ fetchUrl, title }: RemotePreviewPageProps) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'success'; payload: any }
    | { status: 'error'; message: string }
  >({ status: 'loading' });
  const requestVersionRef = useRef(0);

  const draftId = fetchUrl.split('/')[3];

  async function loadPayload() {
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    setState({ status: 'loading' });
    try {
      const res = await fetch(withBasePath(fetchUrl));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (requestVersion !== requestVersionRef.current) return;
      setState({ status: 'success', payload });
    } catch (err: any) {
      if (requestVersion !== requestVersionRef.current) return;
      setState({ status: 'error', message: err.message });
    }
  }

  useEffect(() => {
    loadPayload();
    return () => {
      requestVersionRef.current += 1;
    };
  }, [fetchUrl]);

  if (state.status === 'loading') {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)] px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center">
          <div className="w-full rounded-[2.5rem] border border-white/10 bg-white/[0.02] p-10 text-center shadow-[0_32px_120px_rgba(15,23,42,0.4)] backdrop-blur-3xl">
            <div className="relative mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-[2rem] border border-cyan-400/20 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,0.15)]">
              <div className="h-10 w-10 animate-pulse rounded-2xl bg-cyan-400/40" />
            </div>
            <p className="text-2xl font-bold text-white">{title}</p>
            <p className="mt-4 text-sm text-slate-400">正在加载预览...</p>
            <div className="mx-auto mt-8 h-1 w-48 overflow-hidden rounded-full bg-white/5">
              <div className="h-full w-1/3 animate-[shimmer_2s_infinite] bg-cyan-400" />
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
          <div className="w-full rounded-[2.5rem] border border-rose-500/20 bg-rose-500/5 p-10 text-center shadow-[0_32px_120px_rgba(15,23,42,0.4)] backdrop-blur-3xl">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500">
              <RefreshCcw size={32} />
            </div>
            <p className="text-xl font-bold text-rose-50">加载失败</p>
            <p className="mt-3 text-sm text-rose-100/60 leading-relaxed">{state.message}</p>
            <Button
              className="mt-8 bg-rose-500 text-white hover:bg-rose-600"
              onClick={loadPayload}
            >
              重试
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const { payload } = state;

  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_35%),linear-gradient(180deg,_#020617_0%,_#0f172a_42%,_#111827_100%)] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/40 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 overflow-hidden">
            <Link
              href={`/drafts/${draftId}`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft size={18} />
            </Link>
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-bold tracking-tight text-white sm:text-base">
                  {payload.title}
                </h1>
                <Badge variant="outline" className="h-5 shrink-0 border-amber-500/30 bg-amber-500/10 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Preview
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500 uppercase tracking-widest">
                <span className="truncate">Draft ID: {draftId}</span>
                <span className="shrink-0">•</span>
                <span className="shrink-0 text-cyan-400/60">自动同步</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="hidden border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white sm:flex"
            >
              <Link href={`/drafts/${draftId}`}>
                <Edit3 size={14} className="mr-2" />
                继续编辑
              </Link>
            </Button>
            <Button
              size="sm"
              className="bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
            >
              <Rocket size={14} className="mr-2" />
              发布教程
            </Button>
          </div>
        </div>
      </header>

      <TutorialScrollyDemo
        steps={payload.steps}
        intro={payload.intro}
        title={payload.title}
        fileName={payload.fileName}
      />
    </main>
  );
}
