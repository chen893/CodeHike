'use client';

import { useEffect, useRef, useState } from 'react';
import {
  cancelDraftGeneration,
  DraftClientError,
  fetchDraft,
  fetchGenerationStatus,
  regenerateDraftStepRequest,
  startDraftGenerationStream,
} from '@/components/drafts/draft-client';
import type {
  GenerationProgressViewModel,
  OutlineData,
  StepTitles,
  V2Status,
} from './generation-progress-types';
import { getErrorText, getProgressValue } from './generation-progress-utils';

interface UseGenerationProgressOptions {
  draftId: string;
  onComplete: () => void;
  modelId?: string;
  startNewGeneration?: boolean;
}

interface SSEEventData {
  jobId?: string;
  phase?: string;
  totalSteps?: number;
  stepIndex?: number;
  title?: string;
  message?: string;
  errorCode?: string;
  errorMessage?: string;
  step?: {
    title?: string;
  };
  meta?: {
    title?: string;
    description?: string;
  };
  steps?: Array<{
    id?: string;
    title?: string;
    teachingGoal?: string;
    conceptIntroduced?: string;
    estimatedLocChange?: number;
  }>;
}

export function useGenerationProgress({
  draftId,
  onComplete,
  modelId,
  startNewGeneration = false,
}: UseGenerationProgressOptions): GenerationProgressViewModel {
  const [runNonce, setRunNonce] = useState(0);
  const [v2Status, setV2Status] = useState<V2Status>('connecting');
  const [outline, setOutline] = useState<OutlineData | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [totalSteps, setTotalSteps] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [stepTitles, setStepTitles] = useState<StepTitles>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorPhase, setErrorPhase] = useState<string | null>(null);
  const [failedStepIndex, setFailedStepIndex] = useState<number | null>(null);
  const [errorLabel, setErrorLabel] = useState<string | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // AbortController lives in a ref so the cancel() function can reach it
  const controllerRef = useRef<AbortController | null>(null);
  // Distinguishes user-initiated cancel from unmount cleanup
  const isCancelledRef = useRef(false);
  // Tracks the job ID emitted by the SSE stream for job-based reconnection
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    setV2Status('connecting');
    setOutline(null);
    setCurrentStepIndex(-1);
    setTotalSteps(0);
    setCompletedSteps([]);
    setStepTitles({});
    setErrorMessage(null);
    setErrorPhase(null);
    setFailedStepIndex(null);
    setErrorLabel(null);
    isCancelledRef.current = false;
    jobIdRef.current = null;

    const controller = new AbortController();
    controllerRef.current = controller;
    let currentEvent = '';
    // External workspace retries and in-panel retries should start a new
    // generation after terminal jobs, while still reconnecting if a job is
    // genuinely active.
    const shouldStartNewGeneration = startNewGeneration || runNonce > 0;

    function handleV2Event(event: string, data: SSEEventData) {
      switch (event) {
        case 'job':
          jobIdRef.current = data?.jobId ?? null;
          break;
        case 'phase':
          if (data.phase === 'outline') {
            setV2Status('generating-outline');
          } else if (data.phase === 'step-fill') {
            setV2Status('filling-step');
            if (typeof data.stepIndex === 'number') {
              setCurrentStepIndex(data.stepIndex);
            }
            if (typeof data.totalSteps === 'number') {
              setTotalSteps(data.totalSteps);
            }
          } else if (data.phase === 'validate') {
            setV2Status('validating');
          }
          break;
        case 'outline':
          if (data.meta && data.steps) {
            setOutline({
              meta: {
                title: data.meta.title ?? '',
                description: data.meta.description ?? '',
              },
              steps: data.steps.map((s, i) => ({
                id: s.id ?? `step-${i}`,
                title: s.title ?? '',
                teachingGoal: s.teachingGoal ?? '',
                conceptIntroduced: s.conceptIntroduced ?? '',
                estimatedLocChange: s.estimatedLocChange ?? 0,
              })),
            });
            setTotalSteps(data.steps.length ?? 0);
            setV2Status('outline-received');
          }
          break;
        case 'step':
          if (typeof data.stepIndex === 'number') {
            const stepIndex = data.stepIndex;
            setCompletedSteps((prev) =>
              prev.includes(stepIndex) ? prev : [...prev, stepIndex]
            );
          }
          if (data.step?.title && typeof data.stepIndex === 'number') {
            const stepIndex = data.stepIndex;
            const title = data.step.title;
            setStepTitles((prev) => ({ ...prev, [stepIndex]: title }));
          }
          break;
        case 'done':
          setV2Status('stream-complete');
          break;
        case 'error':
          setErrorMessage(data.message || '生成失败');
          setErrorPhase(typeof data.phase === 'string' ? data.phase : null);
          setV2Status('error');
          {
            // Classify directly from the structured SSE fields, not message text
            if (data.phase === 'outline') {
              setFailedStepIndex(null);
              setErrorLabel('大纲生成失败');
            } else if (typeof data.stepIndex === 'number' && data.stepIndex >= 0) {
              setFailedStepIndex(data.stepIndex);
              setErrorLabel(`步骤 ${data.stepIndex + 1} 填充失败`);
            } else {
              setFailedStepIndex(null);
              setErrorLabel(null);
            }
          }
          break;
        default:
          break;
      }
    }

    async function run() {
      // ── Reconnect / terminal-state check ──
      try {
        const { job } = await fetchGenerationStatus(draftId);

        if (!job) {
          // No active or recent job — start a new generation
          // Fall through to SSE stream below
        } else if (job.status === 'succeeded') {
          onCompleteRef.current();
          return;
        } else if (job.status === 'cancelled') {
          if (shouldStartNewGeneration) {
            // Fall through to SSE stream below.
          } else {
            setErrorMessage(job.errorMessage || '生成已取消');
            setV2Status('error');
            return;
          }
        } else if (
          job.status === 'failed' ||
          job.status === 'abandoned'
        ) {
          if (shouldStartNewGeneration) {
            // Fall through to SSE stream below.
          } else {
            // Terminal failure — derive error state from job's errorCode
            setErrorMessage(job.errorMessage || '生成失败');
            setV2Status('error');
            if (job.errorCode === 'OUTLINE_GENERATION_FAILED') {
              setErrorPhase('outline');
              setErrorLabel('大纲生成失败');
            } else if (
              job.errorCode === 'STEP_GENERATION_FAILED' ||
              job.errorCode === 'PATCH_VALIDATION_FAILED'
            ) {
              setErrorPhase('step-fill');
              if (job.currentStepIndex != null && job.currentStepIndex >= 0) {
                setFailedStepIndex(job.currentStepIndex);
                setErrorLabel(`步骤 ${job.currentStepIndex + 1} 填充失败`);
              }
            } else if (job.errorCode === 'JOB_STALE') {
              setErrorLabel('生成任务超时');
            } else if (
              job.errorCode === 'DRAFT_VALIDATION_FAILED' ||
              job.errorCode === 'PERSIST_FAILED'
            ) {
              setErrorLabel('保存失败，请重试');
            } else if (job.errorCode === 'MODEL_CAPABILITY_MISMATCH') {
              setErrorLabel('模型能力不匹配，请更换模型重试');
            } else if (job.errorCode === 'SOURCE_IMPORT_RATE_LIMITED') {
              setErrorLabel('源码导入被限流，请稍后重试');
            }
            return;
          }
        } else {
          // Job is running or queued — restore progress from job and enter reconnect mode
          jobIdRef.current = job.id;
          if (job.outlineSnapshot) {
            setOutline({
              meta: job.outlineSnapshot.meta,
              steps: job.outlineSnapshot.steps,
            });
            setTotalSteps(job.outlineSnapshot.steps?.length ?? 0);
          }
          if (job.stepTitlesSnapshot) {
            const titles: StepTitles = {};
            job.stepTitlesSnapshot.forEach((title, i) => {
              titles[i] = title;
            });
            setStepTitles(titles);
          }
          if (job.currentStepIndex != null && job.currentStepIndex >= 0) {
            setCurrentStepIndex(job.currentStepIndex);
            // Mark completed steps up to (but not including) the current one
            const completed: number[] = [];
            for (let i = 0; i < job.currentStepIndex; i++) {
              completed.push(i);
            }
            setCompletedSteps(completed);
          }
          setV2Status(job.cancelRequested ? 'cancelling' : 'reconnecting'); // triggers the polling effect
          return;
        }
      } catch {
        // Fetch failed — proceed to start SSE stream, let it handle errors
      }

      // ── Start a new SSE generation stream ──
      try {
        const stream = await startDraftGenerationStream(draftId, controller.signal, modelId);
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
              handleV2Event(currentEvent, data);
            } catch {
              continue;
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          if (isCancelledRef.current) {
            setErrorMessage(null);
            setErrorPhase(null);
            setFailedStepIndex(null);
            setErrorLabel(null);
            setV2Status('cancelling');
          }
          // Otherwise it was an unmount cleanup — silently ignore
        } else {
          const message = err instanceof Error ? err.message : '生成请求失败';
          setErrorMessage(message);
          setErrorPhase(null);
          setV2Status('error');
          setFailedStepIndex(null);
          setErrorLabel(null);
        }
      }
    }

    void run();
    return () => {
      controller.abort();
      controllerRef.current = null;
    };
  }, [draftId, modelId, runNonce, startNewGeneration]);

  useEffect(() => {
    if (
      v2Status !== 'stream-complete' &&
      v2Status !== 'reconnecting' &&
      v2Status !== 'cancelling'
    ) return;

    const BASE_POLL_MS = 1000;
    const MAX_POLL_MS = 8000;
    const MAX_POLL_ATTEMPTS = 30;
    let pollAttempts = 0;
    let pollTimeout: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const { job } = await fetchGenerationStatus(draftId, true);

        if (!job) {
          // Job disappeared — treat as failure
          setErrorMessage('生成任务丢失，请重试');
          setV2Status('error');
          return;
        }

        if (job.status === 'succeeded') {
          onCompleteRef.current();
          return;
        }

        if (job.status === 'cancelled') {
          setErrorMessage(job.errorMessage || '生成已取消');
          setErrorPhase(null);
          setFailedStepIndex(null);
          setErrorLabel(null);
          setV2Status('error');
          return;
        }

        if (
          job.status === 'failed' ||
          job.status === 'abandoned'
        ) {
          setErrorMessage(job.errorMessage || '生成失败');
          setErrorPhase(null);
          setFailedStepIndex(null);
          setErrorLabel(null);
          if (job.errorCode === 'OUTLINE_GENERATION_FAILED') {
            setErrorPhase('outline');
            setErrorLabel('大纲生成失败');
          } else if (
            job.errorCode === 'STEP_GENERATION_FAILED' ||
            job.errorCode === 'PATCH_VALIDATION_FAILED'
          ) {
            setErrorPhase('step-fill');
            if (job.currentStepIndex != null && job.currentStepIndex >= 0) {
              setFailedStepIndex(job.currentStepIndex);
              setErrorLabel(`步骤 ${job.currentStepIndex + 1} 填充失败`);
            }
          } else if (job.errorCode === 'JOB_STALE') {
            setErrorLabel('生成任务超时');
          } else if (
            job.errorCode === 'DRAFT_VALIDATION_FAILED' ||
            job.errorCode === 'PERSIST_FAILED'
          ) {
            setErrorLabel('保存失败，请重试');
          }
          setV2Status('error');
          return;
        }

        // Job still running — update progress from job state
        const currentJobStepIndex = job.currentStepIndex;
        if (currentJobStepIndex != null && currentJobStepIndex >= 0) {
          setCurrentStepIndex(currentJobStepIndex);
          setCompletedSteps((prev) => {
            const completed = [...prev];
            for (let i = 0; i < currentJobStepIndex; i++) {
              if (!completed.includes(i)) completed.push(i);
            }
            return completed;
          });
        }
        if (job.totalSteps != null && job.totalSteps > 0) {
          setTotalSteps(job.totalSteps);
        }
        if (job.cancelRequested) {
          setV2Status('cancelling');
        }
      } catch {
        // ignore fetch errors, retry
      }

      pollAttempts++;
      if (pollAttempts >= MAX_POLL_ATTEMPTS) {
        setErrorMessage('保存确认超时，请刷新页面查看状态');
        setV2Status('error');
        return;
      }
      const delay = Math.min(BASE_POLL_MS * Math.pow(1.5, pollAttempts), MAX_POLL_MS);
      pollTimeout = setTimeout(poll, delay);
    }

    poll();

    return () => clearTimeout(pollTimeout);
  }, [draftId, v2Status]);

  const progressValue = getProgressValue(
    v2Status,
    currentStepIndex,
    totalSteps,
    completedSteps
  );
  const displayError = getErrorText(v2Status, errorMessage);
  const canRetry =
    v2Status === 'error' &&
    (errorPhase === null ||
      !outline ||
      errorPhase === 'outline' ||
      errorPhase === 'step-fill');

  const canRetryFromStep =
    v2Status === 'error' &&
    errorPhase === 'step-fill' &&
    failedStepIndex !== null &&
    failedStepIndex >= 0;

  async function handleRetry() {
    setV2Status('connecting');
    setErrorMessage(null);
    setErrorPhase(null);
    setFailedStepIndex(null);
    setErrorLabel(null);

    // Poll for the draft to be ready before retrying, avoiding race condition
    const maxAttempts = 15;
    const pollInterval = 500;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      attempts++;

      try {
        const { job } = await fetchGenerationStatus(draftId);
        if (!job || job.status === 'failed' || job.status === 'abandoned' || job.status === 'cancelled') {
          // Job is in a terminal state, safe to retry
          break;
        }
      } catch {
        // On error, assume it's safe to retry after a few attempts
        if (attempts >= 3) break;
      }
    }

    setRunNonce((current) => current + 1);
  }

  async function handleRetryFromStep(stepIndex: number) {
    setV2Status('connecting');
    setErrorMessage(null);
    setErrorPhase(null);
    setFailedStepIndex(null);
    setErrorLabel(null);

    // Fetch current draft to check if steps were persisted
    let draft: Awaited<ReturnType<typeof fetchDraft>> | null = null;
    try {
      draft = await fetchDraft(draftId);
    } catch {
      // Can't fetch draft, fall back to full retry
      await handleRetry();
      return;
    }

    const steps = draft.tutorialDraft?.steps;
    if (!steps || stepIndex < 0 || stepIndex >= steps.length) {
      // No persisted steps to regenerate from, fall back to full retry
      await handleRetry();
      return;
    }

    // Reuse the same regeneration logic as the workspace controller:
    // iterate from failed step and call regenerateDraftStepRequest for each.
    setV2Status('filling-step');
    setCurrentStepIndex(stepIndex);
    setErrorMessage(null);
    setErrorPhase(null);
    setFailedStepIndex(null);
    setErrorLabel(null);

    try {
      let latestDraft = draft;

      for (let i = stepIndex; i < steps.length; i++) {
        setCurrentStepIndex(i);
        const step = latestDraft.tutorialDraft!.steps[i];
        const instruction =
          i === stepIndex
            ? '生成在当前步骤失败。请基于最新的前文代码，重新生成当前步骤及其代码变化，确保教程从这里继续衔接。'
            : '前面的步骤已经重新生成。请基于最新前文代码继续生成当前步骤，确保 patches、focus 和 marks 都与当前代码精确匹配。';

        latestDraft = await regenerateDraftStepRequest(draftId, step.id, {
          mode: 'step',
          instruction,
        });

        setCompletedSteps((prev) =>
          prev.includes(i) ? prev : [...prev, i]
        );
        if (latestDraft.tutorialDraft?.steps[i]?.title) {
          setStepTitles((prev) => ({ ...prev, [i]: latestDraft.tutorialDraft!.steps[i].title }));
        }
      }

      // Per-step regeneration does not create a generation job; finish by
      // reloading the draft instead of polling the previous failed job.
      onCompleteRef.current();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '从失败步骤重试失败');
      setV2Status('error');
    }
  }

  async function handleCancel() {
    if (v2Status === 'cancelling') return;

    isCancelledRef.current = true;
    setV2Status('cancelling');
    setErrorMessage(null);
    setErrorPhase(null);
    setFailedStepIndex(null);
    setErrorLabel(null);

    try {
      // Signal the server to stop at the next step boundary. The polling effect
      // keeps running until the persisted job reaches a terminal state.
      await cancelDraftGeneration(draftId);
      controllerRef.current?.abort();
    } catch (err) {
      if (err instanceof DraftClientError && err.code === 'NOT_RUNNING') {
        // The job reached a terminal state before the cancel request arrived.
        // Switch to the normal terminal-state polling path instead of showing
        // a false cancel failure.
        controllerRef.current?.abort();
        setErrorMessage(null);
        setErrorPhase(null);
        setFailedStepIndex(null);
        setErrorLabel(null);
        setV2Status('stream-complete');
        return;
      }

      setErrorMessage(err instanceof Error ? err.message : '取消生成失败');
      setV2Status('error');
    }
  }

  const isGenerating =
    v2Status === 'connecting' ||
    v2Status === 'generating-outline' ||
    v2Status === 'outline-received' ||
    v2Status === 'filling-step' ||
    v2Status === 'validating' ||
    v2Status === 'reconnecting' ||
    v2Status === 'cancelling';

  return {
    draftId,
    v2Status,
    outline,
    currentStepIndex,
    totalSteps,
    completedSteps,
    stepTitles,
    progressValue,
    errorMessage: displayError,
    errorPhase,
    errorLabel,
    canRetry,
    canRetryFromStep,
    failedStepIndex,
    onRetry: handleRetry,
    onRetryFromStep: handleRetryFromStep,
    onCancel: handleCancel,
    isGenerating,
  };
}
