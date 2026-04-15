import { z } from 'zod';
import * as draftRepo from '../repositories/draft-repository';
import {
  normalizeChapterOrders,
  validateChapterStructure,
} from '../tutorial/chapters';
import { validateTutorialDraft } from '../utils/validation';
import type { Chapter } from '../schemas/chapter';
import type { TutorialDraft, TutorialStep } from '../schemas/tutorial-draft';

const updateStructureInputSchema = z.object({
  chapters: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      description: z.string().optional(),
      order: z.number().int().min(0),
    })
  ),
  stepOrder: z.array(
    z.object({
      stepId: z.string().min(1),
      chapterId: z.string().min(1),
    })
  ),
});

export type UpdateStructureInput = z.infer<typeof updateStructureInputSchema>;

export async function updateDraftStructure(
  draftId: string,
  userId: string,
  data: unknown
) {
  const parsed = updateStructureInputSchema.parse(data);

  // 1. Get draft, verify ownership
  const draft = await draftRepo.getDraftById(draftId, userId);
  if (!draft || !draft.tutorialDraft) {
    throw new Error('Draft not found');
  }

  const { chapters: inputChapters, stepOrder } = parsed;

  // 2. Validate chapter ids are unique
  const chapterIds = inputChapters.map((ch) => ch.id);
  if (new Set(chapterIds).size !== chapterIds.length) {
    throw new Error('validation: Chapter IDs must be unique');
  }

  // 3. Validate stepOrder covers ALL existing steps exactly
  const existingStepIds = new Set(
    draft.tutorialDraft.steps.map((s) => s.id)
  );
  const providedStepIds = new Set(stepOrder.map((s) => s.stepId));

  if (existingStepIds.size !== providedStepIds.size) {
    throw new Error(
      'validation: stepOrder must cover all existing steps exactly'
    );
  }

  for (const id of existingStepIds) {
    if (!providedStepIds.has(id)) {
      throw new Error(`validation: stepOrder is missing step "${id}"`);
    }
  }
  for (const entry of stepOrder) {
    if (!existingStepIds.has(entry.stepId)) {
      throw new Error(
        `validation: stepOrder references unknown step "${entry.stepId}"`
      );
    }
  }

  // Validate all stepOrder chapterIds exist in the chapters array
  const chapterIdSet = new Set(chapterIds);
  for (const entry of stepOrder) {
    if (!chapterIdSet.has(entry.chapterId)) {
      throw new Error(
        `validation: stepOrder references unknown chapter "${entry.chapterId}"`
      );
    }
  }

  // 4. Rebuild steps[] in stepOrder order, writing chapterId to each
  const stepById = new Map(
    draft.tutorialDraft.steps.map((s) => [s.id, s] as const)
  );
  const reorderedSteps: TutorialStep[] = stepOrder.map((entry) => {
    const existing = stepById.get(entry.stepId)!;
    return { ...existing, chapterId: entry.chapterId };
  });

  // 5. Normalize chapter orders
  const normalizedChapters: Chapter[] = normalizeChapterOrders(inputChapters);

  // 6. Build the rebuilt draft and validate
  const rebuiltDraft: TutorialDraft = {
    ...draft.tutorialDraft,
    chapters: normalizedChapters,
    steps: reorderedSteps,
  };

  const chapterValidation = validateChapterStructure(
    normalizedChapters,
    reorderedSteps
  );
  if (!chapterValidation.valid) {
    throw new Error(`validation: ${chapterValidation.errors.join('; ')}`);
  }

  const validation = await validateTutorialDraft(rebuiltDraft);

  // 7. Save: update the full tutorialDraft with new chapters and steps
  await draftRepo.updateDraftTutorial(draftId, rebuiltDraft, {
    inputHash: draft.tutorialDraftInputHash,
    model: draft.generationModel ?? 'unknown',
  });

  await draftRepo.updateDraftValidation(
    draftId,
    validation.valid,
    validation.errors
  );

  // 8. Return updated draft
  const result = await draftRepo.getDraftById(draftId);
  if (!result) throw new Error('Failed to retrieve updated draft');
  return result;
}
