import type { ClientDraftRecord } from '@/lib/types/client';
import type { GenerationContext } from '@/components/tutorial/generation-progress-types';

const audienceLabels: Record<ClientDraftRecord['teachingBrief']['audience_level'], string> = {
  beginner: '初学者',
  intermediate: '中级',
  advanced: '高级',
};

const languageLabels: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
};

export function countLines(value: string) {
  const normalized = value.replace(/\n$/, '');
  return normalized ? normalized.split(/\r?\n/).length : 0;
}

export function summarizeLanguages(items: ClientDraftRecord['sourceItems']) {
  const unique = [
    ...new Set(items.map((item) => languageLabels[item.language || ''] || item.language || '未知')),
  ];

  if (unique.length === 0) return '未知';
  if (unique.length <= 2) return unique.join(' / ');
  return `${unique[0]} +${unique.length - 1}`;
}

export function buildGenerationContext(draft: ClientDraftRecord): GenerationContext {
  const activeSourceItems = draft.sourceItems.filter((item) => item.content.trim());
  const totalLineCount = Math.max(
    1,
    activeSourceItems.reduce((sum, item) => sum + countLines(item.content), 0)
  );

  return {
    topic: draft.teachingBrief.topic.trim(),
    sourceSummary:
      activeSourceItems.length <= 1
        ? activeSourceItems[0]?.label?.trim() || 'main'
        : `${activeSourceItems.length} 个源码文件`,
    sourceCount: Math.max(activeSourceItems.length, 1),
    sourceLanguageSummary: summarizeLanguages(
      activeSourceItems.length > 0 ? activeSourceItems : draft.sourceItems
    ),
    outputLanguage: draft.teachingBrief.output_language,
    audienceLabel: audienceLabels[draft.teachingBrief.audience_level],
    coreQuestion: draft.teachingBrief.core_question.trim(),
    codeLineCount: totalLineCount,
  };
}

export function resolveSelectedStepIndex(
  nextSteps: NonNullable<ClientDraftRecord['tutorialDraft']>['steps'],
  preferredStepId: string | null | undefined,
  fallbackIndex: number
) {
  if (nextSteps.length === 0) {
    return 0;
  }

  if (preferredStepId) {
    const preferredIndex = nextSteps.findIndex((step) => step.id === preferredStepId);
    if (preferredIndex >= 0) {
      return preferredIndex;
    }
  }

  return Math.min(fallbackIndex, nextSteps.length - 1);
}
