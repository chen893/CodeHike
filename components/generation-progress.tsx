'use client';

import { useEffect, useState, useRef } from 'react';
import type { TutorialDraft } from '@/lib/schemas/tutorial-draft';

interface GenerationProgressProps {
  draftId: string;
  onComplete: () => void;
}

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

export function GenerationProgress({
  draftId,
  onComplete,
}: GenerationProgressProps) {
  const [protocol, setProtocol] = useState<ProtocolVersion>('unknown');
  const [v1Status, setV1Status] = useState<string>('connecting');
  const [v2Status, setV2Status] = useState<V2Status>('connecting');
  const [fullText, setFullText] = useState('');
  const [parsedDraft, setParsedDraft] = useState<Partial<TutorialDraft> | null>(null);
  const [outline, setOutline] = useState<OutlineData | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [totalSteps, setTotalSteps] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const controller = new AbortController();
    let v1Accumulated = '';
    // Track protocol locally within this effect (state won't update inside the closure)
    let localProtocol: 'unknown' | 'v1' | 'v2' = 'unknown';

    async function run() {
      try {
        const res = await fetch(`/api/drafts/${draftId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generationVersion: 'v2' }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setV1Status(`error: HTTP ${res.status}`);
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

          let currentEvent = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6);

            try {
              const data = JSON.parse(jsonStr);

              // Detect protocol on first meaningful message
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
              // Non-JSON line, ignore
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setV1Status(`error: ${err.message}`);
          setV2Status('error');
        }
      }
    }

    function handleV1Event(data: any) {
      if (data.error) {
        setV1Status(`error: ${data.error}`);
      } else if (data.done) {
        setV1Status('stream-complete');
      } else if (data.text) {
        v1Accumulated += data.text;
        setFullText(v1Accumulated);
        // Try parse partial JSON
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
                if (c === '{' || c === '[') opens++;
                if (c === '}' || c === ']') opens--;
              }
              for (let i = 0; i < opens; i++) fixed += '}';
              try { obj = JSON.parse(fixed); } catch { /* ignore */ }
            }
            if (obj) setParsedDraft(obj);
          }
        } catch { /* ignore */ }
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
            // Server fell back to v1
            localProtocol = 'v1';
            setProtocol('v1');
            setV1Status('generating');
          }
          break;
        case 'outline':
          setV2Status('outline-received');
          setOutline({
            meta: data.meta,
            steps: data.steps,
          });
          setTotalSteps(data.steps?.length ?? 0);
          break;
        case 'step':
          setCompletedSteps((prev) => [...prev, data.stepIndex]);
          break;
        case 'validation':
          // Validation result received
          break;
        case 'done':
          setV2Status('stream-complete');
          break;
        case 'error':
          setV2Status('error');
          setV1Status(`error: ${data.message}`);
          break;
      }
    }

    run();
    return () => controller.abort();
  }, [draftId]);

  // Poll for server-side persistence to complete
  useEffect(() => {
    const isComplete = protocol === 'v2' ? v2Status === 'stream-complete' : v1Status === 'stream-complete';
    if (!isComplete) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/drafts/${draftId}`);
        if (res.ok) {
          const draft = await res.json();
          if (draft.generationState === 'succeeded') {
            clearInterval(interval);
            onCompleteRef.current();
          } else if (draft.generationState === 'failed') {
            clearInterval(interval);
            setV1Status(`failed: ${draft.generationErrorMessage}`);
          }
        }
      } catch {
        // Polling failed, retry next
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [protocol, v2Status, v1Status, draftId]);

  // Render v2 UI if protocol is v2 or still unknown with v2-like status
  const showV2 = protocol === 'v2' || (protocol === 'unknown' && v2Status !== 'connecting');

  return (
    <div className="generation-progress">
      {showV2 ? (
        <V2ProgressUI
          status={v2Status}
          outline={outline}
          currentStepIndex={currentStepIndex}
          totalSteps={totalSteps}
          completedSteps={completedSteps}
        />
      ) : (
        <V1ProgressUI status={v1Status} fullText={fullText} parsedDraft={parsedDraft} />
      )}
    </div>
  );
}

function V2ProgressUI({
  status,
  outline,
  currentStepIndex,
  totalSteps,
  completedSteps,
}: {
  status: V2Status;
  outline: OutlineData | null;
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: number[];
}) {
  const isLoading = !['stream-complete', 'error'].includes(status);

  return (
    <div>
      <div className="generation-status">
        {isLoading && <div className="generation-spinner"><span></span></div>}
        <span>
          {status === 'connecting' && '正在连接 AI...'}
          {status === 'generating-outline' && '正在设计教学路径...'}
          {status === 'outline-received' && '教学大纲已生成，开始逐步填充...'}
          {status === 'filling-step' && `正在生成第 ${currentStepIndex + 1} / ${totalSteps} 步...`}
          {status === 'validating' && '正在校验所有步骤...'}
          {status === 'stream-complete' && '正在保存...'}
          {status === 'error' && '生成失败'}
        </span>
      </div>

      {outline && (
        <div className="generation-preview">
          <h2 className="preview-title">{outline.meta.title}</h2>
          <div className="preview-steps">
            {outline.steps.map((step, i) => {
              const isCompleted = completedSteps.includes(i);
              const isCurrent = i === currentStepIndex && status === 'filling-step';
              return (
                <div
                  key={step.id}
                  className={`preview-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
                >
                  <span className="step-number">
                    {isCompleted ? '✓' : i + 1}
                  </span>
                  <span className="step-title">{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function V1ProgressUI({
  status,
  fullText,
  parsedDraft,
}: {
  status: string;
  fullText: string;
  parsedDraft: Partial<TutorialDraft> | null;
}) {
  const isLoading = status !== 'error' && status !== 'stream-complete' && !status.startsWith('failed');

  return (
    <div>
      <div className="generation-status">
        {isLoading && <div className="generation-spinner"><span></span></div>}
        <span>
          {status === 'connecting'
            ? '正在连接 AI...'
            : status === 'generating'
              ? '正在生成教程...'
              : status === 'stream-complete'
                ? '正在校验和保存...'
                : status.startsWith('error') || status.startsWith('failed')
                  ? status
                  : status}
        </span>
      </div>

      {parsedDraft && (
        <div className="generation-preview">
          {parsedDraft.meta?.title && (
            <h2 className="preview-title">{parsedDraft.meta.title}</h2>
          )}
          {parsedDraft.meta?.description && (
            <p className="preview-desc">{parsedDraft.meta.description}</p>
          )}
          {parsedDraft.steps && parsedDraft.steps.length > 0 && (
            <div className="preview-steps">
              {parsedDraft.steps.map((step, i) => (
                <div key={step?.id || i} className="preview-step">
                  <span className="step-number">步骤 {i + 1}</span>
                  <span className="step-title">{step?.title || '...'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
