'use client';

import type { TutorialDraft } from '@/lib/schemas/tutorial-draft';
import type {
  GenerationContext,
  GenerationProgressViewModel,
  LegacyStatus,
} from './generation-progress-types';
import {
  cardClass,
  getDisplaySteps,
  getFocusStep,
  getV1Headline,
  getV2Headline,
  heroClass,
  mutedText,
  progressListClass,
  secondaryButton,
  sectionLabel,
  shellClass,
  softCardClass,
  titleClass,
} from './generation-progress-utils';

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
    <div className="w-full">
      {controller.showV2 ? (
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
          canRetry={controller.canRetry}
          onRetry={controller.onRetry}
        />
      ) : (
        <V1ProgressUI
          context={context}
          draftId={draftId}
          status={controller.v1Status}
          fullText={controller.fullText}
          parsedDraft={controller.parsedDraft}
          progressValue={controller.progressValue}
          errorMessage={controller.errorMessage}
        />
      )}
    </div>
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
  canRetry,
  onRetry,
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
  canRetry: boolean;
  onRetry: () => void;
}) {
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

  return (
    <div className={shellClass}>
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
                <div
                  className="h-full rounded-full bg-slate-900 transition-[width] duration-500"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <div className="flex items-center gap-2">
                  {status !== 'error' && (
                    <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-slate-900" />
                  )}
                  <span>{headline.title}</span>
                </div>
                <span>{totalSteps > 0 ? `${completedCount} / ${totalSteps} 步` : '排队中'}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <ContextStat label="源码" value={context.sourceSummary} />
            <ContextStat label="文件数" value={`${context.sourceCount}`} />
            <ContextStat label="语言" value={context.sourceLanguageSummary} />
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
                    ? '大纲已就绪，正在逐步填充内容。'
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
              <div className={`${progressListClass} space-y-3`} aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    className="h-20 animate-pulse rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100"
                  />
                ))}
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
                    ['outline-received', 'filling-step', 'validating', 'stream-complete'].includes(status)
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
                      : status === 'filling-step'
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
                  <p className="mt-2 text-sm leading-6 text-rose-900">{errorMessage}</p>
                  {canRetry && (
                    <button type="button" className={`${secondaryButton} mt-4`} onClick={onRetry}>
                      {errorPhase === 'step-fill' ? '从当前进度重新生成' : '重新生成目录'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function V1ProgressUI({
  context,
  draftId,
  status,
  parsedDraft,
  progressValue,
  errorMessage,
}: {
  context: GenerationContext;
  draftId: string;
  status: LegacyStatus;
  fullText: string;
  parsedDraft: Partial<TutorialDraft> | null;
  progressValue: number;
  errorMessage: string | null;
}) {
  const headline = getV1Headline(status);
  const stepCount = parsedDraft?.steps?.length ?? 0;

  return (
    <div className={shellClass}>
      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_1.2fr] lg:p-6">
        <section className={heroClass}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                兼容模式
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
                <div
                  className="h-full rounded-full bg-slate-900 transition-[width] duration-500"
                  style={{ width: `${progressValue}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <div className="flex items-center gap-2">
                  {!errorMessage && status !== 'stream-complete' && (
                    <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-slate-900" />
                  )}
                  <span>{headline.title}</span>
                </div>
                <span>{stepCount > 0 ? `${stepCount} 步` : '等待中'}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <ContextStat label="语言" value={context.sourceLanguageSummary} />
              <ContextStat label="读者" value={context.audienceLabel} />
            </div>
            <div className={softCardClass}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                核心问题
              </span>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-700">{context.coreQuestion}</p>
            </div>
          </div>
        </section>

        <div className="space-y-5">
          <section className={cardClass}>
            <div className="space-y-1">
              <p className={sectionLabel}>实时预览</p>
              <h3 className={titleClass}>内容解析</h3>
              <p className={mutedText}>正在解析生成内容...</p>
            </div>

            {parsedDraft?.steps && parsedDraft.steps.length > 0 ? (
              <div className={`${progressListClass} space-y-3`}>
                {parsedDraft.steps.map((step, index) => (
                  <article
                    key={step?.id || index}
                    className="flex gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4"
                  >
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-slate-900 text-[10px] font-bold text-white">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900">{step?.title || `步骤 ${index + 1}`}</h4>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                        {step?.paragraphs?.[0] || '...'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={`${progressListClass} space-y-3`} aria-hidden="true">
                {Array.from({ length: 3 }, (_, index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-xl border border-slate-100 bg-slate-50/50"
                  />
                ))}
              </div>
            )}

            {errorMessage && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-950">
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-600">
                  错误详情
                </span>
                <p className="mt-1 text-xs leading-5 text-red-900">{errorMessage}</p>
              </div>
            )}
          </section>
        </div>
      </div>
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
