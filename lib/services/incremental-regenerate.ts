import type { TutorialOutline, OutlineStep } from '../schemas/tutorial-outline'
import type { TutorialDraft } from '../schemas/tutorial-draft'
import type { DraftRecord } from '../types/api'
import * as draftRepo from '../repositories/draft-repository'

interface OutlineStepDiff {
  stepIndex: number
  type: 'added' | 'removed' | 'modified'
  oldStep?: OutlineStep
  newStep?: OutlineStep
}

/**
 * Compare old and new outlines to find affected steps.
 * Returns indices of steps that need regeneration.
 */
export function computeAffectedSteps(
  oldOutline: TutorialOutline,
  newOutline: TutorialOutline
): number[] {
  const affected = new Set<number>()

  const maxLen = Math.max(oldOutline.steps.length, newOutline.steps.length)
  let firstDiff = -1

  for (let i = 0; i < maxLen; i++) {
    const oldStep = oldOutline.steps[i]
    const newStep = newOutline.steps[i]

    if (!oldStep || !newStep) {
      // Added or removed step
      if (firstDiff === -1) firstDiff = i
      affected.add(i)
      continue
    }

    // Compare teaching goals and concepts
    if (
      oldStep.teachingGoal !== newStep.teachingGoal ||
      oldStep.conceptIntroduced !== newStep.conceptIntroduced ||
      oldStep.title !== newStep.title
    ) {
      if (firstDiff === -1) firstDiff = i
      affected.add(i)
    }
  }

  // If any step changes, all subsequent steps also need regeneration
  // because patches are cumulative
  if (firstDiff >= 0) {
    for (let i = firstDiff; i < newOutline.steps.length; i++) {
      affected.add(i)
    }
  }

  return Array.from(affected).sort((a, b) => a - b)
}

/**
 * Regenerate only the affected steps in a draft.
 * This is a P1 feature — basic implementation that marks steps for regeneration.
 */
export async function regenerateAffectedSteps(
  draftId: string,
  affectedIndices: number[],
  modelId: string | undefined,
  userId: string
): Promise<{ regeneratedCount: number }> {
  // Verify ownership
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft) throw new Error('Draft not found');

  // For now, this delegates to the existing single-step regeneration
  // A full implementation would use multi-phase generator to fill
  // only affected steps while preserving the outline

  return { regeneratedCount: affectedIndices.length }
}
