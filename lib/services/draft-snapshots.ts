import * as draftRepo from '../repositories/draft-repository';
import * as snapshotRepo from '../repositories/draft-snapshot-repository';

export async function createSnapshot(
  draftId: string,
  userId: string,
  label?: string
) {
  // Verify ownership
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft) throw new Error('Draft not found');
  if (!draft.tutorialDraft) throw new Error('Draft has no tutorial content');

  const stepCount = draft.tutorialDraft.steps.length;

  const snapshot = await snapshotRepo.createSnapshot({
    draftId,
    label: label ?? null,
    tutorialDraft: draft.tutorialDraft,
    stepCount,
  });

  return snapshot;
}

export async function restoreSnapshot(
  draftId: string,
  userId: string,
  snapshotId: string
) {
  // Verify ownership
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft) throw new Error('Draft not found');

  // Get snapshot and verify it belongs to this draft
  const snapshot = await snapshotRepo.getSnapshotById(snapshotId);
  if (!snapshot) throw new Error('Snapshot not found');
  if (snapshot.draftId !== draftId)
    throw new Error('Snapshot does not belong to this draft');

  // Auto-create a backup of current state before restoring
  if (draft.tutorialDraft) {
    await snapshotRepo.createSnapshot({
      draftId,
      label: '恢复前自动备份',
      tutorialDraft: draft.tutorialDraft,
      stepCount: draft.tutorialDraft.steps.length,
    });
  }

  // Update draft's tutorialDraft with snapshot content
  const updated = await draftRepo.updateDraftTutorial(draftId, snapshot.tutorialDraftSnapshot, {
    inputHash: null,
    model: 'snapshot-restore',
  });

  if (!updated) throw new Error('Failed to restore snapshot');

  return updated;
}

export async function listSnapshots(draftId: string, userId: string) {
  // Verify ownership
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft) throw new Error('Draft not found');

  return snapshotRepo.listSnapshots(draftId);
}

export async function deleteSnapshot(
  draftId: string,
  userId: string,
  snapshotId: string
) {
  // Verify ownership
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft) throw new Error('Draft not found');

  const deleted = await snapshotRepo.deleteSnapshot(snapshotId);
  if (!deleted) throw new Error('Snapshot not found');

  return { success: true };
}
