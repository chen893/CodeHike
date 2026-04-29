export const DRAFT_GENERATION_MODES = [
  'auto',
  'outline_review',
  'fill_from_saved_outline',
] as const;

export type DraftGenerationMode =
  (typeof DRAFT_GENERATION_MODES)[number];

export function isDraftGenerationMode(
  value: unknown
): value is DraftGenerationMode {
  return (
    typeof value === 'string' &&
    DRAFT_GENERATION_MODES.includes(
      value as DraftGenerationMode
    )
  );
}
