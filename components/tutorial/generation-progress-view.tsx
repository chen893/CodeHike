'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  GenerationContext,
  GenerationProgressViewModel,
} from './generation-progress-types';
import { GenerationPreviewPanel } from './generation-preview-panel';
import {
  cardClass,
  getDisplaySteps,
  getFocusStep,
  getV2Headline,
  heroClass,
  isIndeterminate,
  mutedText,
  progressListClass,
  secondaryButton,
  sectionLabel,
  shellClass,
  softCardClass,
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
}

export function GenerationProgressView({
  draftId,
  context,
  controller,
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
  const focusStep = getFocusStep(outline, currentStepIndex, totalSteps);
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
    <div className={shellClass}>
      {/* Tab bar */}
      {showPreviewTab && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 lg:px-6">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-slate-900">生成进度</span>
            <span className="truncate text-xs text-slate-400">
              实时预览会在独立浮层中打开，不挤占进度面板。
            </span>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2"
            onClick={() => setPreviewOpen(true)}
          >
            实时预览
            {completedSteps.length > 0 && totalSteps > 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-cyan-700">
                {completedSteps.length}/{totalSteps}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="grid gap-5 p-5 lg:grid-cols-[1.6fr_1fr] lg:p-6">
        <section className={heroClass}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                教程生成
              </span>
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-400">
                {draftId.slice(0, 8)}
              </span>
            </div>

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
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <div className="flex items-center gap-2">
                  {status !== 'error' && (
                    <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-slate-900" />
                  )}
                  <span>{headline.title}</span>
                </div>
                <span>{totalSteps > 0 ? `${completedCount} / ${totalSteps} 步` : '准备中'}</span>
              </div>
              {isGenerating && (
                <div className="pt-1">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                    onClick={onCancel}
                  >
                    取消生成
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
            <ContextStat label="源文件" value={`${context.sourceCount} ${context.sourceLanguageSummary} 文件`} />
            <ContextStat label="读者" value={context.audienceLabel} />
            <ContextStat label="输出" value={context.outputLanguage} />
            <ContextStat label="规模" value={`${context.codeLineCount} LOC`} />
          </div>
        </section>

        <div className="space-y-5">
          <section className={cardClass}>
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
              <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                {outline.meta.description}
              </p>
            )}

            {displaySteps.length > 0 ? (
              <div className={`${progressListClass} space-y-3`}>
                {displaySteps.map((step) => (
                  <article
                    key={step.id}
                    className={`flex gap-4 rounded-3xl border px-4 py-4 transition ${
                      step.isCompleted
                        ? 'border-emerald-200 bg-emerald-50/80'
                        : step.isCurrent
                          ? 'border-cyan-200 bg-cyan-50/80'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                        step.isCompleted
                          ? 'bg-emerald-500 text-white'
                          : step.isCurrent
                            ? 'bg-cyan-500 text-white'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {step.isCompleted ? '✓' : step.index + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-medium text-slate-900">{step.title}</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{step.meta}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={`${progressListClass} space-y-3`}>
                {PLACEHOLDER_STEPS.map((step, index) => {
                  const completedIdx = getPlaceholderCompletedCount(status);
                  const isDone = index < completedIdx;
                  const isActive = index === completedIdx;
                  return (
                    <div
                      key={step.id}
                      className={`flex gap-4 rounded-3xl border px-4 py-4 transition ${
                        isDone
                          ? 'border-emerald-200 bg-emerald-50/80'
                          : isActive
                            ? 'border-cyan-200 bg-cyan-50/80'
                            : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                          isDone
                            ? 'bg-emerald-500 text-white'
                            : isActive
                              ? 'bg-cyan-500 text-white'
                              : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {isDone ? '✓' : index + 1}
                      </div>
                      <div className="min-w-0">
                        <h4 className={`font-medium ${isDone ? 'text-slate-500' : isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                          {step.title}
                        </h4>
                        <p className={`mt-1 text-sm leading-6 ${isDone ? 'text-slate-400' : isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                          {isDone ? '已完成' : isActive ? '进行中...' : '等待中'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className={cardClass}>
            <div className="space-y-1">
              <p className={sectionLabel}>任务摘要</p>
              <h3 className={titleClass}>输入上下文</h3>
              <p className={mutedText}>你提供的信息概览。</p>
            </div>

            <div className="mt-4 space-y-4">
              <div className={softCardClass}>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  核心问题
                </span>
                <p className="mt-2 text-sm leading-6 text-slate-700">{context.coreQuestion}</p>
              </div>

              {focusStep && (
                <div className={softCardClass}>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    当前焦点
                  </span>
                  <h4 className="mt-2 font-medium text-slate-900">{focusStep.title}</h4>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{focusStep.teachingGoal}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-white px-3 py-1">{focusStep.conceptIntroduced}</span>
                    <span className="rounded-full bg-white px-3 py-1">±{focusStep.estimatedLocChange} LOC</span>
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <PhaseItem
                  label="设计大纲"
                  status={
                    ['outline-received', 'filling-step', 'validating', 'stream-complete', 'reconnecting'].includes(status)
                      ? 'done'
                      : status === 'generating-outline'
                        ? 'active'
                        : 'idle'
                  }
                />
                <PhaseItem
                  label="生成步骤"
                  status={
                    ['validating', 'stream-complete'].includes(status)
                      ? 'done'
                      : ['filling-step', 'reconnecting'].includes(status)
                        ? 'active'
                        : 'idle'
                  }
                />
                <PhaseItem
                  label="校验保存"
                  status={
                    status === 'stream-complete'
                      ? 'done'
                      : status === 'validating'
                        ? 'active'
                        : 'idle'
                  }
                />
              </div>

              {errorMessage && (
                <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-950">
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
                      onClick={() => router.push(`/drafts/${draftId}`)}
                    >
                      前往草稿编辑器
                    </button>
                  </div>
                </div>
              )}
            </div>
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
                  <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
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
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
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

function ContextStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <strong className="mt-1 block text-sm font-medium text-slate-900">{value}</strong>
    </div>
  );
}

function PhaseItem({
  label,
  status,
}: {
  label: string;
  status: 'done' | 'active' | 'idle';
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-2 text-xs font-bold transition-colors ${
        status === 'done'
          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
          : status === 'active'
            ? 'border-slate-200 bg-slate-100 text-slate-900'
            : 'border-slate-100 bg-slate-50/50 text-slate-400'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          status === 'done'
            ? 'bg-emerald-500'
            : status === 'active'
              ? 'bg-slate-900'
              : 'bg-slate-300'
        }`}
      />
      <span className="uppercase tracking-wider">{label}</span>
    </div>
  );
}
