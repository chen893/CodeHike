import type { TeachingBrief } from '@/lib/schemas/index';
import { createUuid } from '@/lib/utils/uuid';

export const audienceLabels: Record<TeachingBrief['audience_level'], string> = {
  beginner: '初学者',
  intermediate: '中级',
  advanced: '高级',
};

export const languageLabels: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
};

export interface SourceItemDraft {
  id: string;
  label: string;
  language: string;
  content: string;
}

export function createSourceItemDraft(): SourceItemDraft {
  return {
    id: createUuid(),
    label: '',
    language: 'javascript',
    content: '',
  };
}

export function countLines(value: string) {
  const normalized = value.replace(/\n$/, '');
  return normalized ? normalized.split(/\r?\n/).length : 0;
}

export function summarizeLanguages(items: SourceItemDraft[]) {
  const unique = [...new Set(items.map((item) => languageLabels[item.language] || item.language))];

  if (unique.length === 0) return '未知';
  if (unique.length <= 2) return unique.join(' / ');
  return `${unique[0]} +${unique.length - 1}`;
}
