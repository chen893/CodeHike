'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClientTutorialPayload } from '@/lib/types/client';
import {
  fetchDraftPreviewPayload,
  TutorialClientError,
} from './tutorial-client';
import { TutorialScrollyDemo } from './tutorial-scrolly-demo';

interface GenerationPreviewPanelProps {
  draftId: string;
  completedStepCount: number;
  totalSteps: number;
  isGenerating: boolean;
  className?: string;
}

export function GenerationPreviewPanel({
  draftId,
  completedStepCount,
  totalSteps,
  isGenerating,
  className = '',
}: GenerationPreviewPanelProps) {
  const [payload, setPayload] = useState<ClientTutorialPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payloadRef = useRef<ClientTutorialPayload | null>(null);
  const lastFetchedCount = useRef(-1);

  const fetchPreview = useCallback(
    async (mode: 'visible' | 'silent' = 'visible') => {
      if (mode === 'visible' && !payloadRef.current) {
        setLoading(true);
      }

      try {
        const nextPayload = await fetchDraftPreviewPayload(draftId);
        payloadRef.current = nextPayload;
        setPayload(nextPayload);
        setEmpty(false);
        setError(null);
        lastFetchedCount.current = Math.max(
          completedStepCount,
          Array.isArray(nextPayload.steps) ? nextPayload.steps.length : 0
        );
      } catch (err) {
        if (
          err instanceof TutorialClientError &&
          err.status === 404 &&
          err.code === 'NO_CONTENT'
        ) {
          if (!payloadRef.current) setEmpty(true);
          setError(null);
          return;
        }

        if (mode === 'visible' || !payloadRef.current) {
          setError(err instanceof Error ? err.message : '预览加载失败');
        }
      } finally {
        if (mode === 'visible') {
          setLoading(false);
        }
      }
    },
    [completedStepCount, draftId]
  );

  useEffect(() => {
    void fetchPreview('visible');
  }, [fetchPreview]);

  useEffect(() => {
    if (completedStepCount <= lastFetchedCount.current) return;
    void fetchPreview('silent');
  }, [completedStepCount, fetchPreview]);

  useEffect(() => {
    if (!isGenerating) return;

    const interval = window.setInterval(() => {
      void fetchPreview('silent');
    }, 2500);

    return () => window.clearInterval(interval);
  }, [fetchPreview, isGenerating]);

  if (loading && !payload) {
    return (
      <PreviewShell className={className}>
        <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
          <span className="ml-3">正在加载已生成内容...</span>
        </div>
      </PreviewShell>
    );
  }

  if (error && !payload) {
    return (
      <PreviewShell className={className}>
        <div className="flex min-h-[360px] flex-col items-center justify-center text-center text-sm text-slate-500">
          <p>预览加载失败: {error}</p>
          <button
            type="button"
            className="mt-4 inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void fetchPreview('visible')}
          >
            重试加载
          </button>
        </div>
      </PreviewShell>
    );
  }

  if (!payload || empty) {
    return (
      <PreviewShell className={className}>
        <div className="flex min-h-[360px] flex-col items-center justify-center text-sm text-slate-400">
          <p>还没有已完成的步骤</p>
          {totalSteps > 0 ? (
            <p className="mt-1 text-xs text-slate-300">正在生成 {totalSteps} 个步骤...</p>
          ) : null}
        </div>
      </PreviewShell>
    );
  }

  const renderedStepCount = Array.isArray(payload.steps)
    ? payload.steps.length
    : completedStepCount;

  return (
    <div className={`min-h-0 overflow-y-auto bg-[#f7f8fa] ${className}`}>
      <div className="sticky top-0 z-30 border-b border-cyan-200/50 bg-cyan-50/90 px-4 py-2.5 text-center text-xs font-medium text-cyan-700 backdrop-blur-sm">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-500" />
          {isGenerating
            ? `正在生成中，仅预览已完成的 ${renderedStepCount}/${Math.max(totalSteps, renderedStepCount)} 步`
            : `已生成 ${renderedStepCount} 步`}
        </span>
      </div>
      <TutorialScrollyDemo
        steps={payload.steps}
        intro={payload.intro}
        title={payload.title}
        fileName={payload.fileName}
        showBreadcrumb={false}
        chapters={payload.chapters}
        stepChapterMeta={payload.stepChapterMeta}
        previewMode
        showCompletion={false}
      />
    </div>
  );
}

function PreviewShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-h-0 overflow-y-auto border-t border-slate-100 bg-white ${className}`}>
      {children}
    </div>
  );
}
