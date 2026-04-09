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
  sourceLabel: string;
  sourceLanguage: string;
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

function getV2Headline(status: V2Status, currentStepIndex: number, totalSteps: number) {
  if (status === 'connecting') {
    return {
      title: '正在连接生成器',
      detail: '草稿已经创建，正在启动结构化生成流程。',
    };
  }

  if (status === 'generating-outline') {
    return {
      title: '正在设计教学路径',
      detail: '先生成标题、简介和逐步讲解的大纲，再逐步填充正文。',
    };
  }

  if (status === 'outline-received') {
    return {
      title: '教学大纲已准备好',
      detail: '正在根据大纲逐步生成每一步的正文、patch 和讲解。',
    };
  }

  if (status === 'filling-step') {
    return {
      title: `正在生成第 ${currentStepIndex + 1} / ${totalSteps} 步`,
      detail: '当前阶段会逐步补齐每个步骤的解释、代码变化和教学重点。',
    };
  }

  if (status === 'validating') {
    return {
      title: '正在校验教程结构',
      detail: '已完成正文生成，正在做整体校验并准备持久化保存。',
    };
  }

  if (status === 'stream-complete') {
    return {
      title: '正在保存草稿',
      detail: '流式生成已经完成，正在等待服务端落库并跳转到草稿工作区。',
    };
  }

  return {
    title: '生成失败',
    detail: '生成流程中断，请检查错误信息并返回修改输入内容。',
  };
}

function getV1Headline(status: LegacyStatus) {
  if (status === 'connecting') {
    return {
      title: '正在连接生成器',
      detail: '正在启动兼容模式生成流程。',
    };
  }

  if (status === 'generating') {
    return {
      title: '正在生成教程内容',
      detail: '兼容模式下会直接流式返回教程 JSON，再进行校验和保存。',
    };
  }

  if (status === 'stream-complete') {
    return {
      title: '正在校验和保存',
      detail: '内容流已经返回完成，正在等待服务端完成持久化。',
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
      (isCurrent ? `步骤 ${index + 1} 正在生成` : `步骤 ${index + 1}`);
    const meta = outlineStep
      ? `${outlineStep.teachingGoal} · ${outlineStep.conceptIntroduced}`
      : isCurrent
        ? '正在填充正文、patch 与讲解内容'
        : isCompleted
          ? '已生成完成'
          : '等待生成';

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
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
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
          setV2Status('error');
          setV1Status(`error: ${data.message || '生成失败'}`);
          break;
        default:
          break;
      }
    }

    run();
    return () => controller.abort();
  }, [draftId]);

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

  return (
    <div className="generation-progress">
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
    <div className="generation-shell">
      <section className="generation-hero">
        <div className="generation-hero-copy">
          <div className="generation-kicker">AI Tutorial Build</div>
          <h2>{context.topic ? `正在生成《${context.topic}》` : headline.title}</h2>
          <p>{headline.detail}</p>
        </div>

        <div className="generation-progressbar" aria-hidden="true">
          <div
            className="generation-progressbar-fill"
            style={{ width: `${progressValue}%` }}
          />
        </div>

        <div className="generation-progressline">
          <div className="generation-status">
            {status !== 'error' && <div className="generation-spinner"><span></span></div>}
            <span>{headline.title}</span>
          </div>
          <div className="generation-progressline-meta">
            <span>{draftId.slice(0, 8)}</span>
            <span>{totalSteps > 0 ? `${completedCount} / ${totalSteps} 步` : '等待大纲返回'}</span>
          </div>
        </div>

        <div className="generation-context-grid">
          <ContextStat label="源码" value={context.sourceLabel} />
          <ContextStat label="语言" value={context.sourceLanguage} />
          <ContextStat label="读者" value={context.audienceLabel} />
          <ContextStat label="输出语言" value={context.outputLanguage} />
          <ContextStat label="代码行数" value={`${context.codeLineCount} lines`} />
        </div>
      </section>

      <div className="generation-layout">
        <section className="generation-card generation-card-steps">
          <div className="generation-card-header">
            <div>
              <h3>教学步骤</h3>
              <p>
                {outline
                  ? '已拿到完整大纲，正在逐步填充每一步内容。'
                  : totalSteps > 0
                    ? '大纲标题暂未显示，仍可继续追踪当前生成进度。'
                    : '正在等待大纲返回。'}
              </p>
            </div>
            <div className="generation-badge">
              {totalSteps > 0 ? `${totalSteps} steps` : 'planning'}
            </div>
          </div>

          {outline?.meta.description && (
            <p className="generation-outline-desc">{outline.meta.description}</p>
          )}

          {displaySteps.length > 0 ? (
            <div className="generation-step-list">
              {displaySteps.map((step) => (
                <article
                  key={step.id}
                  className={`generation-step-card${step.isCompleted ? ' completed' : ''}${step.isCurrent ? ' current' : ''}`}
                >
                  <div className="generation-step-index">
                    {step.isCompleted ? '✓' : step.index + 1}
                  </div>
                  <div className="generation-step-copy">
                    <h4>{step.title}</h4>
                    <p>{step.meta}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="generation-step-skeletons" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="generation-step-skeleton" />
              ))}
            </div>
          )}
        </section>

        <section className="generation-card generation-card-side">
          <div className="generation-card-header">
            <div>
              <h3>任务摘要</h3>
              <p>保留输入上下文，避免进入生成态后信息完全消失。</p>
            </div>
          </div>

          <div className="generation-summary-block">
            <span className="generation-summary-label">核心问题</span>
            <p>{context.coreQuestion}</p>
          </div>

          {focusStep && (
            <div className="generation-focus-card">
              <span className="generation-summary-label">当前焦点</span>
              <h4>{focusStep.title}</h4>
              <p>{focusStep.teachingGoal}</p>
              <div className="generation-focus-tags">
                <span>{focusStep.conceptIntroduced}</span>
                <span>±{focusStep.estimatedLocChange} LOC</span>
              </div>
            </div>
          )}

          <div className="generation-phase-list">
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
            <div className="generation-error-box">
              <span className="generation-summary-label">错误详情</span>
              <p>{errorMessage}</p>
            </div>
          )}
        </section>
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
    <div className="generation-shell">
      <section className="generation-hero">
        <div className="generation-hero-copy">
          <div className="generation-kicker">Legacy Stream</div>
          <h2>{context.topic ? `正在生成《${context.topic}》` : headline.title}</h2>
          <p>{headline.detail}</p>
        </div>

        <div className="generation-progressbar" aria-hidden="true">
          <div
            className="generation-progressbar-fill"
            style={{ width: `${progressValue}%` }}
          />
        </div>

        <div className="generation-progressline">
          <div className="generation-status">
            {!errorMessage && status !== 'stream-complete' && (
              <div className="generation-spinner"><span></span></div>
            )}
            <span>{headline.title}</span>
          </div>
          <div className="generation-progressline-meta">
            <span>{draftId.slice(0, 8)}</span>
            <span>{stepCount > 0 ? `${stepCount} 步已解析` : '等待流式内容返回'}</span>
          </div>
        </div>
      </section>

      <div className="generation-layout">
        <section className="generation-card generation-card-steps">
          <div className="generation-card-header">
            <div>
              <h3>即时预览</h3>
              <p>兼容模式下会从流式 JSON 中尽量恢复出标题和步骤。</p>
            </div>
          </div>

          {parsedDraft?.meta?.title && (
            <h4 className="generation-preview-title">{parsedDraft.meta.title}</h4>
          )}
          {parsedDraft?.meta?.description && (
            <p className="generation-outline-desc">{parsedDraft.meta.description}</p>
          )}

          {parsedDraft?.steps && parsedDraft.steps.length > 0 ? (
            <div className="generation-step-list">
              {parsedDraft.steps.map((step, index) => (
                <article key={step?.id || index} className="generation-step-card current">
                  <div className="generation-step-index">{index + 1}</div>
                  <div className="generation-step-copy">
                    <h4>{step?.title || `步骤 ${index + 1}`}</h4>
                    <p>{step?.paragraphs?.[0] || '正在补充正文内容...'}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="generation-step-skeletons" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="generation-step-skeleton" />
              ))}
            </div>
          )}
        </section>

        <section className="generation-card generation-card-side">
          <div className="generation-card-header">
            <div>
              <h3>输入摘要</h3>
              <p>即使兼容模式回退，也保留这次创建请求的主要上下文。</p>
            </div>
          </div>

          <div className="generation-context-grid compact">
            <ContextStat label="源码" value={context.sourceLabel} />
            <ContextStat label="语言" value={context.sourceLanguage} />
            <ContextStat label="读者" value={context.audienceLabel} />
            <ContextStat label="输出语言" value={context.outputLanguage} />
          </div>

          <div className="generation-summary-block">
            <span className="generation-summary-label">核心问题</span>
            <p>{context.coreQuestion}</p>
          </div>

          {errorMessage && (
            <div className="generation-error-box">
              <span className="generation-summary-label">错误详情</span>
              <p>{errorMessage}</p>
            </div>
          )}

          {fullText && (
            <div className="generation-stream-note">
              已接收 {fullText.length} 个字符的流式内容。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ContextStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="generation-context-stat">
      <span>{label}</span>
      <strong>{value}</strong>
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
    <div className={`generation-phase-item ${status}`}>
      <span className="generation-phase-dot" />
      <span>{label}</span>
    </div>
  );
}
