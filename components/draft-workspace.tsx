'use client';

import { useState } from 'react';
import type { ClientDraftRecord } from '@/lib/types/client';
import { DraftWorkspaceContent } from '@/components/drafts/draft-workspace-content';
import { DraftWorkspaceSidebar } from '@/components/drafts/draft-workspace-sidebar';
import { useDraftWorkspaceController } from '@/components/drafts/use-draft-workspace-controller';

interface DraftWorkspaceProps {
  draft: ClientDraftRecord;
  startGeneration?: boolean;
  generationModelId?: string;
}

export function DraftWorkspace({
  draft,
  startGeneration = false,
  generationModelId,
}: DraftWorkspaceProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const controller = useDraftWorkspaceController({
    initialDraft: draft,
    startGeneration,
    generationModelId,
  });

  const sidebarContent = (
    <DraftWorkspaceSidebar
      draft={controller.draft}
      hasDraft={controller.hasDraft}
      steps={controller.steps}
      chapters={controller.chapters}
      selectedStepIndex={controller.selectedStepIndex}
      selectedStepId={controller.selectedStepId}
      status={controller.status}
      saving={controller.saving}
      editingMeta={controller.editingMeta}
      canPublish={controller.canPublish}
      canDeleteDraft={controller.canDeleteDraft}
      onSelectStep={(stepId) => {
        const idx = controller.steps.findIndex((s) => s.id === stepId);
        if (idx >= 0) controller.selectStep(idx);
        setDrawerOpen(false);
      }}
      onMoveStep={controller.moveStep}
      onDeleteStep={controller.deleteStep}
      onAppendStep={controller.appendStep}
      onOpenPreview={controller.openPreview}
      onPublish={controller.publishDraft}
      onUnpublish={controller.unpublishDraft}
      onOpenPublished={controller.openPublishedTutorial}
      publishDialogOpen={controller.publishDialogOpen}
      onConfirmPublish={controller.confirmPublish}
      onCancelPublishDialog={controller.cancelPublishDialog}
      onToggleEditingMeta={controller.toggleEditingMeta}
      onDeleteDraft={controller.deleteDraft}
      onAddChapter={controller.addChapter}
      onUpdateChapter={controller.updateChapter}
      onDeleteChapter={controller.deleteChapter}
      onMoveChapter={controller.moveChapter}
      onMoveStepToChapter={controller.moveStepToChapter}
      onAppendStepToChapter={controller.appendStepToChapter}
    />
  );

  return (
    <div className={`relative min-h-screen bg-muted text-foreground lg:grid ${controller.showGenerationProgress ? '' : 'lg:grid-cols-[20rem_minmax(0,1fr)]'}`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(15,23,42,0.03),_transparent_28%),linear-gradient(180deg,_rgba(248,250,252,1),_rgba(241,245,249,1))]" />

      {!controller.showGenerationProgress && (
        <>
          <aside className="fixed left-0 top-0 z-30 hidden h-screen w-[20rem] overflow-hidden border-r border-border bg-card lg:flex lg:flex-col">
            {sidebarContent}
          </aside>

          <button
            type="button"
            className="fixed left-4 top-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-lg shadow-foreground/5 backdrop-blur transition hover:-translate-y-0.5 hover:bg-card lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <span className="text-xl leading-none">☰</span>
          </button>

          <div
            className={`fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
              drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          >
            <div
              className={`absolute left-0 top-0 h-full w-[min(86vw,20rem)] border-r border-border bg-card shadow-2xl transition-transform duration-300 ease-out ${
                drawerOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
              onClick={(event) => event.stopPropagation()}
            >
              {sidebarContent}
            </div>
          </div>
        </>
      )}

      <main className={`relative min-h-screen${controller.showGenerationProgress ? '' : ' lg:col-start-2'}`}>
        <DraftWorkspaceContent
          draft={controller.draft}
          hasDraft={controller.hasDraft}
          steps={controller.steps}
          selectedStepIndex={controller.selectedStepIndex}
          saving={controller.saving}
          editingMeta={controller.editingMeta}
          showGenerationProgress={controller.showGenerationProgress}
          generationRunNonce={controller.generationRunNonce}
          generationContext={controller.generationContext}
          generationModelId={controller.generationModelId}
          startNewGeneration={controller.startNewGeneration}
          repairingStartIndex={controller.repairingStartIndex}
          firstInvalidStep={controller.firstInvalidStep}
          onGenerationComplete={controller.completeGeneration}
          onRegenerateFailedTail={controller.regenerateFailedTail}
          onSaveMeta={controller.saveMeta}
          onSaveStep={controller.saveStep}
          onRegenerateStep={controller.regenerateStep}
          onRetryGeneration={controller.retryGeneration}
          onExitGenerationProgress={controller.exitGenerationProgress}
        />
      </main>
    </div>
  );
}
