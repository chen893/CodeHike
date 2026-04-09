'use client';

import { useEffect, useRef, useState } from 'react';
import type { TutorialDraft } from '@/lib/schemas/tutorial-draft';
import { withBasePath } from '@/lib/base-path';

interface OutlineStep {
  id: string;
  title: string;
  teachingGoal: string;
  conceptIntroduced: string;
  estimatedLocChange: number;
}

interface OutlineData {
  meta: { title: string; description: string };
  steps: OutlineStep[];
}

type ProtocolVersion = 'unknown' | 'v1' | 'v2';

type V2Status =
  | 'connecting'
  | 'generating-outline'
  | 'outline-received'
  | 'filling-step'
  | 'validating'
  | 'stream-complete'
  | 'error';

type LegacyStatus = 'connecting' | 'generating' | 'stream-complete' | string;

export interface GenerationContext {
  topic: string;
  sourceSummary: string;
  sourceCount: number;
  sourceLanguageSummary: string;
  outputLanguage: string;
  audienceLabel: string;
  coreQuestion: string;
  codeLineCount: number;
}

interface GenerationProgressProps {
  draftId: string;
  onComplete: () => void;
  context: GenerationContext;
}

type StepTitles = Record<number, string>;

const shellClass =
  'relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md';
const heroClass =
  'rounded-lg border border-slate-200 bg-slate-50 p-6 text-slate-900 shadow-sm';
const cardClass =
  'rounded-lg border border-slate-200 bg-white p-5 shadow-sm';
const softCardClass =
  'rounded-lg border border-slate-100 bg-slate-50/50 p-4';
const mutedText = 'text-xs leading-5 text-slate-500';
const titleClass = 'text-lg font-bold tracking-tight text-slate-900';
const sectionLabel =
  'inline-flex w-fit items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400';
const primaryButton =
  'inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 transition-colors hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2';
const secondaryButton =
  'inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2';
const progressListClass =
  'mt-4 max-h-[min(24rem,48vh)] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] sm:max-h-[min(28rem,52vh)]';

function getV2Headline(status: V2Status, currentStepIndex: number, totalSteps: number) {
  if (status === 'connecting') {
    return {
      title: '准备中',
      detail: '正在启动生成流程...',
    };
  }

  if (status === 'generating-outline') {
    return {
      title: '设计教学路径',
      detail: '先规划大纲，再逐步填充内容。',
    };
  }

  if (status === 'outline-received') {
    return {
      title: '大纲已就绪',
      detail: '正在逐步生成每一步的内容。',
    };
  }

  if (status === 'filling-step') {
    return {
      title: `生成第 ${currentStepIndex + 1} / ${totalSteps} 步`,
      detail: '正在编写讲解和代码变化。',
    };
  }

  if (status === 'validating') {
    return {
      title: '校验中',
      detail: '内容已生成，正在检查完整性。',
    };
  }

  if (status === 'stream-complete') {
    return {
      title: '保存中',
      detail: '即将跳转到编辑页面。',
    };
  }

  return {
    title: '生成失败',
    detail: '生成中断，请检查错误信息后重试。',
  };
}

function getV1Headline(status: LegacyStatus) {
  if (status === 'connecting') {
    return {
      title: '准备中',
      detail: '正在启动生成...',
    };
  }

  if (status === 'generating') {
    return {
      title: '生成中',
      detail: '正在生成教程内容。',
    };
  }

  if (status === 'stream-complete') {
    return {
      title: '保存中',
      detail: '正在保存到服务器。',
    };
  }

  return {
    title: status.startsWith('failed') || status.startsWith('error') ? '生成失败' : '处理中',
    detail: status,
  };
}

function getProgressValue(
  protocol: ProtocolVersion,
  status: V2Status | LegacyStatus,
  currentStepIndex: number,
  totalSteps: number,
  completedSteps: number[]
) {
  if (protocol === 'v1') {
    if (status === 'connecting') return 4;
    if (status === 'generating') return 48;
    if (status === 'stream-complete') return 92;
    return 100;
  }

  if (status === 'connecting') return 4;
  if (status === 'generating-outline') return 14;
  if (status === 'outline-received') return 20;
  if (status === 'validating' || status === 'stream-complete') return 96;
  if (status === 'error') return totalSteps > 0 ? Math.min(96, (completedSteps.length / totalSteps) * 100) : 14;

  if (status === 'filling-step' && totalSteps > 0) {
    return Math.max(20, Math.min(90, ((currentStepIndex + 1) / totalSteps) * 100));
  }

  return 8;
}

function getDisplaySteps(
  outline: OutlineData | null,
  totalSteps: number,
  currentStepIndex: number,
  completedSteps: number[],
  status: V2Status,
  stepTitles: StepTitles
) {
  const count = outline?.steps.length ?? totalSteps;

  if (count <= 0) return [];

  return Array.from({ length: count }, (_, index) => {
    const outlineStep = outline?.steps[index];
    const isCompleted =
      completedSteps.includes(index) ||
      (status !== 'error' && ['validating', 'stream-complete'].includes(status));
    const isCurrent = index === currentStepIndex && status === 'filling-step';
    const title =
      outlineStep?.title ||
      stepTitles[index] ||
      (isCurrent ? `步骤 ${index + 1} 生成中` : `步骤 ${index + 1}`);
    const meta = outlineStep
      ? `${outlineStep.teachingGoal} · ${outlineStep.conceptIntroduced}`
      : isCurrent
        ? '正在编写讲解和代码变化'
        : isCompleted
          ? '已完成'
          : '等待中';

    return {
      id: outlineStep?.id || `step-${index}`,
      index,
      title,
      meta,
      isCompleted,
      isCurrent,
    };
  });
}

function getFocusStep(
  outline: OutlineData | null,
  currentStepIndex: number,
  totalSteps: number
) {
  if (!outline || outline.steps.length === 0) return null;

  if (currentStepIndex >= 0 && currentStepIndex < outline.steps.length) {
    return outline.steps[currentStepIndex];
  }

  if (totalSteps > 0) {
    return outline.steps[0] ?? null;
  }

  return null;
}

function getErrorText(protocol: ProtocolVersion, v2Status: V2Status, v1Status: string, errorMessage: string | null) {
  if (errorMessage) return errorMessage;
  if (protocol === 'v1' && (v1Status.startsWith('error') || v1Status.startsWith('failed'))) {
    return v1Status.replace(/^(error|failed):\s*/, '');
  }
  if (protocol === 'v2' && v2Status === 'error' && (v1Status.startsWith('error') || v1Status.startsWith('failed'))) {
    return v1Status.replace(/^(error|failed):\s*/, '');
  }
  return null;
}

export function GenerationProgress({
  draftId,
  onComplete,
  context,
}: GenerationProgressProps) {
  const [runNonce, setRunNonce] = useState(0);
  const [protocol, setProtocol] = useState<ProtocolVersion>('unknown');
  const [v1Status, setV1Status] = useState<LegacyStatus>('connecting');
  const [v2Status, setV2Status] = useState<V2Status>('connecting');
  const [fullText, setFullText] = useState('');
  const [parsedDraft, setParsedDraft] = useState<Partial<TutorialDraft> | null>(null);
  const [outline, setOutline] = useState<OutlineData | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [totalSteps, setTotalSteps] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [stepTitles, setStepTitles] = useState<StepTitles>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorPhase, setErrorPhase] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setProtocol('unknown');
    setV1Status('connecting');
    setV2Status('connecting');
    setFullText('');
    setParsedDraft(null);
    setOutline(null);
    setCurrentStepIndex(-1);
    setTotalSteps(0);
    setCompletedSteps([]);
    setStepTitles({});
    setErrorMessage(null);
    setErrorPhase(null);

    const controller = new AbortController();
    let v1Accumulated = '';
    let localProtocol: ProtocolVersion = 'unknown';
    let currentEvent = '';

    async function run() {
      try {
        const res = await fetch(withBasePath(`/api/drafts/${draftId}/generate`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generationVersion: 'v2' }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const message = `请求失败，状态码 ${res.status}`;
          setErrorMessage(message);
          setErrorPhase(null);
          setV1Status(`error: ${message}`);
          setV2Status('error');
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          lineBuffer += chunk;
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim()) {
              currentEvent = '';
              continue;
            }

            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
              continue;
            }

            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6);

            try {
              const data = JSON.parse(jsonStr);

              if (localProtocol === 'unknown') {
                if (currentEvent === 'phase' || currentEvent === 'outline') {
                  localProtocol = 'v2';
                  setProtocol('v2');
                  handleV2Event(currentEvent, data);
                } else if (data.text !== undefined) {
                  localProtocol = 'v1';
                  setProtocol('v1');
                  handleV1Event(data);
                }
              } else if (localProtocol === 'v2') {
                handleV2Event(currentEvent, data);
              } else {
                handleV1Event(data);
              }
            } catch {
              continue;
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          const message = err.message || '生成请求失败';
          setErrorMessage(message);
          setErrorPhase(null);
          setV1Status(`error: ${message}`);
          setV2Status('error');
        }
      }
    }

    function handleV1Event(data: any) {
      if (data.error) {
        setErrorMessage(data.error);
        setV1Status(`error: ${data.error}`);
      } else if (data.done) {
        setV1Status('stream-complete');
      } else if (data.text) {
        v1Accumulated += data.text;
        setFullText(v1Accumulated);

        try {
          const start = v1Accumulated.indexOf('{');
          if (start !== -1) {
            const partial = v1Accumulated.slice(start);
            let obj: any;

            try {
              obj = JSON.parse(partial);
            } catch {
              let fixed = partial;
              let opens = 0;
              for (const c of fixed) {
                if (c === '{' || c === '[') opens += 1;
                if (c === '}' || c === ']') opens -= 1;
              }
              for (let i = 0; i < opens; i += 1) fixed += '}';
              try {
                obj = JSON.parse(fixed);
              } catch {
                obj = null;
              }
            }

            if (obj) setParsedDraft(obj);
          }
        } catch {
          return;
        }
      }
    }

    function handleV2Event(event: string, data: any) {
      switch (event) {
        case 'phase':
          if (data.phase === 'outline') {
            setV2Status('generating-outline');
          } else if (data.phase === 'step-fill') {
            setV2Status('filling-step');
            setCurrentStepIndex(data.stepIndex);
            setTotalSteps(data.totalSteps);
          } else if (data.phase === 'validate') {
            setV2Status('validating');
          } else if (data.phase === 'fallback') {
            localProtocol = 'v1';
            setProtocol('v1');
            setV1Status('generating');
          }
          break;
        case 'outline':
          setOutline({
            meta: data.meta,
            steps: data.steps,
          });
          setTotalSteps(data.steps?.length ?? 0);
          setV2Status('outline-received');
          break;
        case 'step':
          setCompletedSteps((prev) =>
            prev.includes(data.stepIndex) ? prev : [...prev, data.stepIndex]
          );
          if (data.step?.title) {
            setStepTitles((prev) => ({ ...prev, [data.stepIndex]: data.step.title }));
          }
          break;
        case 'done':
          setV2Status('stream-complete');
          break;
        case 'error':
          setErrorMessage(data.message || '生成失败');
          setErrorPhase(typeof data.phase === 'string' ? data.phase : null);
          setV2Status('error');
          setV1Status(`error: ${data.message || '生成失败'}`);
          break;
        default:
          break;
      }
    }

    run();
    return () => controller.abort();
  }, [draftId, runNonce]);

  useEffect(() => {
    const isComplete =
      protocol === 'v2'
        ? v2Status === 'stream-complete'
        : v1Status === 'stream-complete';

    if (!isComplete) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(withBasePath(`/api/drafts/${draftId}`));
        if (!res.ok) return;

        const draft = await res.json();
        if (draft.generationState === 'succeeded') {
          clearInterval(interval);
          onCompleteRef.current();
        } else if (draft.generationState === 'failed') {
          clearInterval(interval);
          const message = draft.generationErrorMessage || '保存失败';
          setErrorMessage(message);
          if (!draft.tutorialDraft && !draft.generationOutline) {
            setErrorPhase('outline');
          }
          setV1Status(`failed: ${message}`);
          if (protocol === 'v2') {
            setV2Status('error');
          }
        }
      } catch {
        return;
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [draftId, onCompleteRef, protocol, v1Status, v2Status]);

  const showV2 = protocol === 'v2' || (protocol === 'unknown' && v2Status !== 'connecting');
  const progressValue = getProgressValue(
    showV2 ? 'v2' : protocol,
    showV2 ? v2Status : v1Status,
    currentStepIndex,
    totalSteps,
    completedSteps
  );
  const displayError = getErrorText(protocol, v2Status, v1Status, errorMessage);
  const canRetryOutline =
    showV2 &&
    v2Status === 'error' &&
    (!outline || errorPhase === 'outline');

  function handleRetryOutline() {
    setRunNonce((current) => current + 1);
  }

  return (
    <div className="w-full">
      {showV2 ? (
        <V2ProgressUI
          context={context}
          draftId={draftId}
          status={v2Status}
          outline={outline}
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
          completedSteps={completedSteps}
          stepTitles={stepTitles}
          progressValue={progressValue}
          errorMessage={displayError}
          canRetryOutline={canRetryOutline}
          onRetryOutline={handleRetryOutline}
        />
      ) : (
        <V1ProgressUI
          context={context}
          draftId={draftId}
          status={v1Status}
          fullText={fullText}
          parsedDraft={parsedDraft}
          progressValue={progressValue}
          errorMessage={displayError}
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
  canRetryOutline,
  onRetryOutline,
}: {
  context: GenerationContext;
  draftId: string;
  status: V2Status;
  outline: OutlineData | null;
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: number[];
  stepTitles: StepTitles;
  progressValue: number;
  errorMessage: string | null;
  canRetryOutline: boolean;
  onRetryOutline: () => void;
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
                  {canRetryOutline && (
                    <button type="button" className={`${secondaryButton} mt-4`} onClick={onRetryOutline}>
                      重新生成目录
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
  fullText,
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
              <p className="mt-1 text-xs leading-5 text-slate-700 line-clamp-2">{context.coreQuestion}</p>
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
                      <p className="mt-1 text-xs leading-5 text-slate-500 line-clamp-2">
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
