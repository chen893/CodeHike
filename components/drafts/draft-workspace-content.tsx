'use client';

import { DraftMetaEditor } from '@/components/draft-meta-editor';
import { GenerationProgress, type GenerationContext } from '@/components/generation-progress';
import { StepEditor } from '@/components/step-editor';
import type { ClientDraftRecord } from '@/lib/types/client';

const secondaryButton =
  'inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
const sectionCard =
  'rounded-xl border border-slate-200 bg-white p-6 shadow-sm';

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
  onRetryFromStep: (stepIndex: number) => Promise<void>;
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
  repairingStartIndex,
  firstInvalidStep,
  onGenerationComplete,
  onRegenerateFailedTail,
  onSaveMeta,
  onSaveStep,
  onRegenerateStep,
  onRetryGeneration,
  onRetryFromStep,
}: DraftWorkspaceContentProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {!hasDraft && showGenerationProgress && (
        <div className={sectionCard}>
          <GenerationProgress
            key={`${draft.id}:${generationRunNonce}`}
            draftId={draft.id}
            onComplete={() => void onGenerationComplete()}
            context={generationContext}
            onRetryFromStep={(stepIndex) => void onRetryFromStep(stepIndex)}
          />
        </div>
      )}

      {draft.validationErrors.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-5 text-amber-950 shadow-[0_18px_40px_-24px_rgba(180,83,9,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">
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
              <button
                type="button"
                className={secondaryButton}
                onClick={() => void onRegenerateFailedTail()}
                disabled={saving}
              >
                {repairingStartIndex === firstInvalidStep.stepIndex
                  ? `正在从第 ${firstInvalidStep.stepIndex + 1} 步修复...`
                  : `从第 ${firstInvalidStep.stepIndex + 1} 步重新生成后续步骤`}
              </button>
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
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-slate-200 bg-white/85 p-8 text-slate-600 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
          <div className="max-w-md space-y-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
              {draft.generationState === 'idle'
                ? '教程尚未生成'
                : draft.generationState === 'running'
                  ? '正在生成中...'
                  : draft.generationState === 'failed'
                    ? '生成失败'
                    : '未知状态'}
            </p>
            <p className="text-base leading-7 text-slate-700">
              {draft.generationState === 'failed'
                ? `生成失败: ${draft.generationErrorMessage}`
                : '创建后会自动开始生成。'}
            </p>
            {draft.generationState === 'failed' && (
              <button
                type="button"
                className={secondaryButton}
                onClick={onRetryGeneration}
                disabled={saving}
              >
                重新生成目录
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
