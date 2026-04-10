import type { TutorialDraft } from '@/lib/schemas/tutorial-draft';

export interface OutlineStep {
  id: string;
  title: string;
  teachingGoal: string;
  conceptIntroduced: string;
  estimatedLocChange: number;
}

export interface OutlineData {
  meta: { title: string; description: string };
  steps: OutlineStep[];
}

export type ProtocolVersion = 'unknown' | 'v1' | 'v2';

export type V2Status =
  | 'connecting'
  | 'generating-outline'
  | 'outline-received'
  | 'filling-step'
  | 'validating'
  | 'stream-complete'
  | 'error';

export type LegacyStatus = 'connecting' | 'generating' | 'stream-complete' | string;

export interface GenerationContext {
  topic: string;
  sourceSummary: string;
  sourceCount: number;
  sourceLanguageSummary: string;
  outputLanguage: string;
  audienceLabel: string;
  coreQuestion: string;
  codeLineCount: number;
}

export type StepTitles = Record<number, string>;

export interface GenerationProgressViewModel {
  showV2: boolean;
  v1Status: LegacyStatus;
  v2Status: V2Status;
  fullText: string;
  parsedDraft: Partial<TutorialDraft> | null;
  outline: OutlineData | null;
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: number[];
  stepTitles: StepTitles;
  progressValue: number;
  errorMessage: string | null;
  errorPhase: string | null;
  canRetry: boolean;
  onRetry: () => void;
}
