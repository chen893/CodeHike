'use client';

import { useEffect, useRef, useState } from 'react';
import type { TutorialDraft } from '@/lib/schemas/tutorial-draft';
import {
  fetchDraft,
  startDraftGenerationStream,
} from '@/components/drafts/draft-client';
import type {
  GenerationProgressViewModel,
  LegacyStatus,
  OutlineData,
  ProtocolVersion,
  StepTitles,
  V2Status,
} from './generation-progress-types';
import { getErrorText, getProgressValue } from './generation-progress-utils';

interface UseGenerationProgressOptions {
  draftId: string;
  onComplete: () => void;
}

export function useGenerationProgress({
  draftId,
  onComplete,
}: UseGenerationProgressOptions): GenerationProgressViewModel {
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
          if (start === -1) return;

          const partial = v1Accumulated.slice(start);
          let obj: any;

          try {
            obj = JSON.parse(partial);
          } catch {
            let fixed = partial;
            let opens = 0;
            for (const char of fixed) {
              if (char === '{' || char === '[') opens += 1;
              if (char === '}' || char === ']') opens -= 1;
            }
            for (let index = 0; index < opens; index += 1) fixed += '}';
            try {
              obj = JSON.parse(fixed);
            } catch {
              obj = null;
            }
          }

          if (obj) setParsedDraft(obj);
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

    async function run() {
      try {
        const stream = await startDraftGenerationStream(draftId, controller.signal);
        const reader = stream.getReader();
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
          const message = err instanceof Error ? err.message : '生成请求失败';
          setErrorMessage(message);
          setErrorPhase(null);
          setV1Status(`error: ${message}`);
          setV2Status('error');
        }
      }
    }

    void run();
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
        const draft = await fetchDraft(draftId);
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
  }, [draftId, protocol, v1Status, v2Status]);

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

  return {
    showV2,
    v1Status,
    v2Status,
    fullText,
    parsedDraft,
    outline,
    currentStepIndex,
    totalSteps,
    completedSteps,
    stepTitles,
    progressValue,
    errorMessage: displayError,
    canRetryOutline,
    onRetryOutline: handleRetryOutline,
  };
}
