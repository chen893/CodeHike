'use client';

import { AlertCircle, AlertTriangle } from 'lucide-react';
import { DraftMetaEditor } from '@/components/draft-meta-editor';
import { GenerationProgress, type GenerationContext } from '@/components/generation-progress';
import { StepEditor } from '@/components/step-editor';
import { Button } from '@/components/ui/button';
import type { ClientDraftRecord } from '@/lib/types/client';

const sectionCard =
  'rounded-xl border border-border bg-card p-6 shadow-sm';

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-5 sm:p-6 lg:p-8">
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
        <div className="rounded-3xl border border-rose-200 bg-rose-50/90 p-5 text-rose-950 shadow-[0_18px_40px_-24px_rgba(225,29,72,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-2">
              <p className="flex items-center gap-2 text-base font-semibold text-rose-900">
                <AlertCircle className="h-5 w-5 text-rose-600" />
                生成失败
              </p>
              <p className="text-sm leading-6 text-rose-900">
                {draft.generationErrorMessage || '生成未完成，可以调整大纲后重新生成。'}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={onRetryGeneration}
              disabled={saving}
            >
              重新生成目录
            </Button>
          </div>
        </div>
      )}

      {!showGenerationProgress && draft.validationErrors.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-amber-950 shadow-[0_18px_40px_-24px_rgba(180,83,9,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-base font-semibold text-amber-900">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                当前草稿需要修复
              </p>
              <ul className="space-y-2 text-sm leading-6 text-amber-900/90">
                {draft.validationErrors.slice(0, 3).map((error) => (
                  <li key={error} className="rounded-2xl bg-white/70 px-3 py-2">
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
        <div className={sectionCard}>
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
        <div className={sectionCard}>
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
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-border bg-card/85 p-8 text-muted-foreground shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <div className="max-w-md space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {draft.generationState === 'idle'
                ? '教程尚未生成'
                : draft.generationState === 'running'
                  ? '正在生成中...'
                  : draft.generationState === 'failed'
                    ? '生成失败'
                    : '未知状态'}
            </p>
            <p className="text-base leading-7 text-foreground">
              {draft.generationState === 'failed'
                ? `生成失败: ${draft.generationErrorMessage}`
                : '教程将自动开始生成。'}
            </p>
            {draft.generationState === 'failed' && (
              <Button
                variant="secondary"
                onClick={onRetryGeneration}
                disabled={saving}
              >
                重新生成目录
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
