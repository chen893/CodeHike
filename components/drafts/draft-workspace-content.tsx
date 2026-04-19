'use client';

import { AlertCircle, AlertTriangle } from 'lucide-react';
import { DraftMetaEditor } from '@/components/draft-meta-editor';
import { GenerationProgress, type GenerationContext } from '@/components/generation-progress';
import { StepEditor } from '@/components/step-editor';
import { Button } from '@/components/ui/button';
import type { ClientDraftRecord } from '@/lib/types/client';

const surfaceClass =
  'rounded-xl bg-white p-5 sm:p-6';

interface DraftWorkspaceContentProps {
  draft: ClientDraftRecord;
  hasDraft: boolean;
  steps: NonNullable<ClientDraftRecord['tutorialDraft']>['steps'];
  selectedStepIndex: number;
  saving: boolean;
  editingMeta: boolean;
  showGenerationProgress: boolean;
  generationRunNonce: number;
  generationContext: GenerationContext;
  generationModelId?: string;
  startNewGeneration: boolean;
  repairingStartIndex: number | null;
  firstInvalidStep: {
    stepIndex: number;
    stepTitle: string;
  } | null;
  onGenerationComplete: () => Promise<void>;
  onRegenerateFailedTail: () => Promise<void>;
  onSaveMeta: (data: {
    title?: string;
    description?: string;
    introParagraphs?: string[];
  }) => Promise<void>;
  onSaveStep: (stepId: string, data: unknown) => Promise<void>;
  onRegenerateStep: (stepId: string, mode: 'prose' | 'step') => Promise<void>;
  onRetryGeneration: () => void;
  onExitGenerationProgress: () => void;
}

export function DraftWorkspaceContent({
  draft,
  hasDraft,
  steps,
  selectedStepIndex,
  saving,
  editingMeta,
  showGenerationProgress,
  generationRunNonce,
  generationContext,
  generationModelId,
  startNewGeneration,
  repairingStartIndex,
  firstInvalidStep,
  onGenerationComplete,
  onRegenerateFailedTail,
  onSaveMeta,
  onSaveStep,
  onRegenerateStep,
  onRetryGeneration,
  onExitGenerationProgress,
}: DraftWorkspaceContentProps) {
  return (
    <div className="mx-auto flex w-full max-w-[min(1440px,calc(100vw-2rem))] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
      {showGenerationProgress && (
        <GenerationProgress
          key={`${draft.id}:${generationRunNonce}`}
          draftId={draft.id}
          onComplete={() => void onGenerationComplete()}
          onExit={onExitGenerationProgress}
          context={generationContext}
          modelId={generationModelId}
          startNewGeneration={startNewGeneration}
        />
      )}

      {!showGenerationProgress && hasDraft && draft.generationState === 'failed' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-2">
              <p className="flex items-center gap-2 text-base font-semibold text-rose-950">
                <AlertCircle className="h-5 w-5 text-rose-500" />
                生成失败
              </p>
              <p className="text-sm leading-6 text-rose-900/85">
                {draft.generationErrorMessage || '生成未完成，可以调整大纲后重新生成。'}
              </p>
            </div>
            <Button variant="secondary" onClick={onRetryGeneration} disabled={saving}>
              重新生成目录
            </Button>
          </div>
        </div>
      )}

      {!showGenerationProgress && draft.validationErrors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-base font-semibold text-amber-950">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                当前草稿需要修复
              </p>
              <ul className="space-y-2 text-sm leading-6 text-amber-900/90">
                {draft.validationErrors.slice(0, 3).map((error) => (
                  <li key={error} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
            {firstInvalidStep && (
              <Button
                variant="secondary"
                onClick={() => void onRegenerateFailedTail()}
                disabled={saving}
              >
                {repairingStartIndex === firstInvalidStep.stepIndex
                  ? `正在从第 ${firstInvalidStep.stepIndex + 1} 步修复...`
                  : `从第 ${firstInvalidStep.stepIndex + 1} 步重新生成后续步骤`}
              </Button>
            )}
          </div>
        </div>
      )}

      {editingMeta && hasDraft && draft.tutorialDraft && !showGenerationProgress && (
        <div className={surfaceClass}>
          <DraftMetaEditor
            title={draft.tutorialDraft.meta.title}
            description={draft.tutorialDraft.meta.description}
            introParagraphs={draft.tutorialDraft.intro.paragraphs}
            onSave={onSaveMeta}
            saving={saving}
          />
        </div>
      )}

      {!editingMeta && draft.tutorialDraft && steps[selectedStepIndex] && !showGenerationProgress && (
        <div className={surfaceClass}>
          <StepEditor
            tutorialDraft={draft.tutorialDraft}
            step={steps[selectedStepIndex]}
            stepIndex={selectedStepIndex}
            onSave={onSaveStep}
            onRegenerate={onRegenerateStep}
            saving={saving}
          />
        </div>
      )}

      {!hasDraft && !showGenerationProgress && (
        <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-slate-500">
          <div className="max-w-md space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
              {draft.generationState === 'idle'
                ? '教程尚未生成'
                : draft.generationState === 'running'
                  ? '正在生成中'
                  : draft.generationState === 'failed'
                    ? '生成失败'
                    : '未知状态'}
            </p>
            <p className="text-base leading-7 text-slate-900">
              {draft.generationState === 'failed'
                ? `生成失败: ${draft.generationErrorMessage}`
                : '教程将自动开始生成。'}
            </p>
            {draft.generationState === 'failed' && (
              <Button variant="secondary" onClick={onRetryGeneration} disabled={saving}>
                重新生成目录
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
