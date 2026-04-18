'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type {
  GenerationContext,
  GenerationProgressViewModel,
} from './generation-progress-types';
import { GenerationPreviewPanel } from './generation-preview-panel';
import {
  getDisplaySteps,
  getV2Headline,
  heroClass,
  isIndeterminate,
  mutedText,
  progressListClass,
  secondaryButton,
  sectionLabel,
  titleClass,
} from './generation-progress-utils';
import type { V2Status } from './generation-progress-types';

const PLACEHOLDER_STEPS = [
  { id: 'ph-parse', title: '解析源码' },
  { id: 'ph-outline', title: '设计教学大纲' },
  { id: 'ph-generate', title: '生成核心章节' },
  { id: 'ph-validate', title: '编译测试代码' },
];

function getPlaceholderCompletedCount(status: V2Status): number {
  if (status === 'connecting') return 0;
  if (status === 'generating-outline') return 1;
  return 2;
}

interface GenerationProgressViewProps {
  draftId: string;
  context: GenerationContext;
  controller: GenerationProgressViewModel;
  onExit?: () => void;
}

export function GenerationProgressView({
  draftId,
  context,
  controller,
  onExit,
}: GenerationProgressViewProps) {
  return (
    <V2ProgressUI
      context={context}
      draftId={draftId}
      status={controller.v2Status}
      outline={controller.outline}
      currentStepIndex={controller.currentStepIndex}
      totalSteps={controller.totalSteps}
      completedSteps={controller.completedSteps}
      stepTitles={controller.stepTitles}
      progressValue={controller.progressValue}
      errorMessage={controller.errorMessage}
      errorPhase={controller.errorPhase}
      errorLabel={controller.errorLabel}
      canRetry={controller.canRetry}
      canRetryFromStep={controller.canRetryFromStep}
      failedStepIndex={controller.failedStepIndex}
      onRetry={controller.onRetry}
      onRetryFromStep={controller.onRetryFromStep}
      onCancel={controller.onCancel}
      onExit={onExit}
      isGenerating={controller.isGenerating}
    />
  );
}

function V2ProgressUI({
  context,
  draftId,
  status,
  outline,
  currentStepIndex,
  totalSteps,
  completedSteps,
  stepTitles,
  progressValue,
  errorMessage,
  errorPhase,
  errorLabel,
  canRetry,
  canRetryFromStep,
  failedStepIndex,
  onRetry,
  onRetryFromStep,
  onCancel,
  onExit,
  isGenerating,
}: {
  context: GenerationContext;
  draftId: string;
  status: GenerationProgressViewModel['v2Status'];
  outline: GenerationProgressViewModel['outline'];
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: number[];
  stepTitles: GenerationProgressViewModel['stepTitles'];
  progressValue: number;
  errorMessage: string | null;
  errorPhase: string | null;
  errorLabel: string | null;
  canRetry: boolean;
  canRetryFromStep: boolean;
  failedStepIndex: number | null;
  onRetry: () => void;
  onRetryFromStep: (stepIndex: number) => void;
  onCancel: () => void;
  onExit?: () => void;
  isGenerating: boolean;
}) {
  const router = useRouter();
  const headline = getV2Headline(status, currentStepIndex, totalSteps);
  const displaySteps = getDisplaySteps(
    outline,
    totalSteps,
    currentStepIndex,
    completedSteps,
    status,
    stepTitles
  );
  const completedCount =
    status === 'validating' || status === 'stream-complete'
      ? totalSteps
      : completedSteps.length;
  const indeterminate = isIndeterminate(status);
  const hasCompletedSteps = completedSteps.length > 0;
  const showPreviewTab =
    hasCompletedSteps ||
    ['filling-step', 'validating', 'stream-complete', 'reconnecting'].includes(status);

  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!previewOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPreviewOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewOpen]);

  return (
    <div className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden">
      <div className="mx-auto w-full max-w-5xl">
      {/* Tab bar */}
      {showPreviewTab && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-slate-900">生成进度</span>
            <span className="truncate text-xs text-slate-400">
              实时预览会在独立浮层中打开，不挤占进度面板。
            </span>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => setPreviewOpen(true)}
          >
            实时预览
            {completedSteps.length > 0 && totalSteps > 0 && (
              <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-primary">
                {completedSteps.length}/{totalSteps}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1fr]">
        <section className={heroClass}>
          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {context.topic ? `正在生成《${context.topic}》` : headline.title}
              </h2>
              <p className="max-w-2xl text-xs leading-5 text-slate-500">{headline.detail}</p>
            </div>

            <div className="space-y-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                {indeterminate ? (
                  <div className="h-full w-full animate-[indeterminate-slide_1.5s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-slate-200 via-slate-900 to-slate-200 bg-[length:200%_100%]" />
                ) : (
                  <div
                    className="h-full rounded-full bg-slate-900 transition-[width] duration-500"
                    style={{ width: `${progressValue}%` }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <div className="flex items-center gap-2">
                  {status !== 'error' && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  <span>{headline.title}</span>
                </div>
                <span>{totalSteps > 0 ? `已完成 ${completedCount} / ${totalSteps} 步` : '准备中'}</span>
              </div>
              {isGenerating && (
                <div className="pt-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 disabled:opacity-50"
                    onClick={onCancel}
                    disabled={status === 'cancelling'}
                  >
                    {status === 'cancelling' ? '正在取消...' : '■ 取消生成'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <ContextPill label="源文件" value={`${context.sourceCount} ${context.sourceLanguageSummary} 文件`} />
            <ContextPill label="读者" value={context.audienceLabel} />
            <ContextPill label="输出" value={context.outputLanguage} />
            <ContextPill label="规模" value={`${context.codeLineCount} LOC`} />
          </div>
        </section>

        <section className="rounded-lg bg-muted/30 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className={sectionLabel}>教学步骤</p>
              <h3 className={titleClass}>生成进度</h3>
              <p className={mutedText}>
                {outline
                  ? status === 'reconnecting'
                    ? '生成仍在进行中，正在等待服务端完成。'
                    : '大纲已就绪，正在逐步填充内容。'
                  : totalSteps > 0
                    ? '大纲还未返回，可以追踪当前进度。'
                    : '正在等待大纲。'}
              </p>
            </div>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {totalSteps > 0 ? `${totalSteps} 步` : '规划中'}
            </span>
          </div>

          {outline?.meta.description && (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {outline.meta.description}
            </p>
          )}

          {displaySteps.length > 0 ? (
            <div className={`${progressListClass} space-y-1.5`}>
              {displaySteps.map((step) => (
                <article
                  key={step.id}
                  className={`flex gap-3 rounded-lg px-3 py-2.5 transition ${
                    step.isCompleted
                      ? 'bg-emerald-50/80'
                      : step.isCurrent
                        ? 'bg-primary/8'
                        : 'bg-muted/20'
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      step.isCompleted
                        ? 'bg-emerald-500 text-white'
                        : step.isCurrent
                          ? 'bg-primary text-primary-foreground animate-pulse'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {step.isCompleted ? '✓' : step.index + 1}
                  </div>
                  <div className="min-w-0">
                    <h4 className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      {step.title}
                      {step.isCurrent && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    </h4>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{step.meta}</p>
                    {step.isCurrent && (
                      <div className="mt-2 flex gap-2">
                        <div className="h-1.5 w-16 animate-pulse rounded-full bg-primary/20" />
                        <div className="h-1.5 w-24 animate-pulse rounded-full bg-primary/15" />
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={`${progressListClass} space-y-1.5`}>
              {PLACEHOLDER_STEPS.map((step, index) => {
                const completedIdx = getPlaceholderCompletedCount(status);
                const isDone = index < completedIdx;
                const isActive = index === completedIdx;
                return (
                  <div
                    key={step.id}
                    className={`flex gap-3 rounded-lg px-3 py-2.5 transition ${
                      isDone
                        ? 'bg-emerald-50/80'
                        : isActive
                          ? 'bg-primary/8'
                          : 'bg-muted/20'
                    }`}
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : isActive
                            ? 'bg-primary text-primary-foreground animate-pulse'
                            : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isDone ? '✓' : index + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className={`flex items-center gap-1.5 text-sm font-medium ${isDone ? 'text-slate-500' : isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                        {step.title}
                        {isActive && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                      </h4>
                      <p className={`mt-0.5 text-xs leading-5 ${isDone ? 'text-slate-400' : isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                        {isDone ? '已完成' : isActive ? '进行中...' : '等待中'}
                      </p>
                      {isActive && (
                        <div className="mt-2 flex gap-2">
                          <div className="h-1.5 w-16 animate-pulse rounded-full bg-primary/20" />
                          <div className="h-1.5 w-24 animate-pulse rounded-full bg-primary/15" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Error section — only shown when there's an error */}
          {errorMessage && (
            <div className="mt-4 rounded-xl bg-rose-50 p-4 text-rose-950">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">
                错误详情
              </span>
              {errorLabel && (
                <p className="mt-1 text-xs font-semibold text-rose-700">{errorLabel}</p>
              )}
              <p className="mt-2 text-sm leading-6 text-rose-900">{errorMessage}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {canRetryFromStep && failedStepIndex !== null && (
                  <button
                    type="button"
                    className={`${secondaryButton} border-rose-200 text-rose-800 hover:bg-rose-100`}
                    onClick={() => onRetryFromStep(failedStepIndex)}
                  >
                    从第 {failedStepIndex + 1} 步重试
                  </button>
                )}
                {canRetry && (
                  <button type="button" className={secondaryButton} onClick={onRetry}>
                    {errorPhase === 'step-fill' ? '从当前进度重新生成' : '重新生成目录'}
                  </button>
                )}
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => {
                    if (onExit) {
                      onExit();
                    } else {
                      router.push(`/drafts/${draftId}`);
                    }
                  }}
                >
                  前往草稿编辑器
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-md sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="实时教程预览"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="flex h-[min(92vh,980px)] w-[min(96vw,1560px)] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white shadow-[0_32px_120px_rgba(2,6,23,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-primary" />
                  <h3 className="truncate text-sm font-bold text-slate-900">
                    实时教程预览
                  </h3>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {isGenerating
                    ? `生成中，仅展示已完成的 ${completedSteps.length}/${Math.max(totalSteps, completedSteps.length)} 步`
                    : '生成结果预览'}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-slate-50 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none"
                onClick={() => setPreviewOpen(false)}
              >
                关闭
              </button>
            </header>
            <GenerationPreviewPanel
              draftId={draftId}
              completedStepCount={completedSteps.length}
              totalSteps={totalSteps}
              isGenerating={isGenerating}
              className="flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </span>
  );
}
