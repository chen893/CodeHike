import type { SourceItem } from '../schemas/source-item';
import type { TeachingBrief } from '../schemas/teaching-brief';
import { estimateTokens } from './token-budget';

const MIN_STEPS = 6;
const MAX_STEPS_RECOMMENDED = 36;
const MAX_STEPS_UPPER = 40;

export interface StepBudgetRecommendation {
  recommended: number;
  min: number;
  max: number;
  totalSourceTokens: number;
  coreFileCount: number;
  architectureLayerCount: number;
}

const CODE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|php|sh|bash|zsh|yaml|yml|json|toml)$/i;
const AUXILIARY_LABEL_PATTERN = /(^|\/)(README(\.[^/]+)?|package\.json|tsconfig\.json|eslint\.config\.(js|mjs|cjs)|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/i;
const GENERIC_ROOT_SEGMENTS = new Set([
  'src',
  'lib',
  'app',
  'components',
  'packages',
  'server',
  'client',
  'internal',
  'core',
  'modules',
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getMeaningfulModuleGroup(label: string) {
  const parts = label
    .split('/')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  for (let index = 0; index < parts.length - 1; index++) {
    if (!GENERIC_ROOT_SEGMENTS.has(parts[index])) {
      return parts[index];
    }
  }

  return 'root';
}

function countArchitectureLayers(labels: string[]) {
  const groups = new Set(labels.map((label) => getMeaningfulModuleGroup(label)));
  return groups.size;
}

export function getCoreSourceItems(sourceItems: SourceItem[]) {
  return sourceItems.filter((item) =>
    CODE_FILE_PATTERN.test(item.label) && !AUXILIARY_LABEL_PATTERN.test(item.label),
  );
}

export function recommendStepBudget(
  sourceItems: SourceItem[],
  teachingBrief?: TeachingBrief | null,
): StepBudgetRecommendation {
  const coreSourceItems = getCoreSourceItems(sourceItems);
  const labels = coreSourceItems.map((item) => item.label);
  const totalSourceTokens = estimateTokens(coreSourceItems.map((item) => item.content).join('\n'));
  const coreFileCount = coreSourceItems.length;
  const architectureLayerCount = countArchitectureLayers(labels);
  const largeFileCount = coreSourceItems.filter((item) => item.content.split('\n').length >= 140).length;

  let recommended = totalSourceTokens <= 8_000
    ? 8
    : totalSourceTokens <= 20_000
      ? 12
      : totalSourceTokens <= 40_000
        ? 18
        : totalSourceTokens <= 80_000
          ? 24
          : 30;

  if (coreFileCount >= 20) recommended += 4;
  else if (coreFileCount >= 12) recommended += 2;
  else if (coreFileCount <= 5) recommended -= 2;

  recommended += Math.max(0, architectureLayerCount - 3);
  recommended += Math.min(4, Math.floor(largeFileCount / 2));

  if (teachingBrief?.audience_level === 'beginner') recommended += 2;
  if (teachingBrief?.audience_level === 'advanced') recommended -= 2;

  if (teachingBrief?.desired_depth === 'short') recommended -= 3;
  if (teachingBrief?.desired_depth === 'deep') recommended += 4;

  if (typeof teachingBrief?.target_step_count === 'number') {
    const override = teachingBrief.target_step_count;
    recommended = Math.round(recommended * 0.2 + override * 0.8);
  }

  recommended = clamp(recommended, MIN_STEPS, MAX_STEPS_RECOMMENDED);

  return {
    recommended,
    min: clamp(recommended - 3, MIN_STEPS, MAX_STEPS_RECOMMENDED),
    max: clamp(recommended + 5, MIN_STEPS + 2, MAX_STEPS_UPPER),
    totalSourceTokens,
    coreFileCount,
    architectureLayerCount,
  };
}
