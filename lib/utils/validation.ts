import { buildTutorialSteps } from '../tutorial-assembler';
import type { TutorialDraft } from '../schemas/tutorial-draft';

export async function validateTutorialDraft(
  tutorialDraft: TutorialDraft
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    await buildTutorialSteps(tutorialDraft as Parameters<typeof buildTutorialSteps>[0]);
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    errors.push(message);
  }

  return { valid: errors.length === 0, errors };
}
