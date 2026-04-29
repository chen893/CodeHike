import { RouteConflictError } from '../api/route-errors';
import type { TutorialDraft } from '../schemas/tutorial-draft';

export const STRUCTURE_LOCKED_MESSAGE =
  '教程已经生成代码步骤，结构编辑已锁定。请在生成前审阅大纲。';

export function hasGeneratedPatches(
  draft: TutorialDraft | null | undefined
): boolean {
  if (!draft?.steps?.length) return false;

  return draft.steps.some((step) => (step.patches?.length ?? 0) > 0);
}

export function assertStructureEditable(
  draft: TutorialDraft | null | undefined
) {
  if (!hasGeneratedPatches(draft)) return;
  throw new RouteConflictError(STRUCTURE_LOCKED_MESSAGE, 'STRUCTURE_LOCKED');
}
