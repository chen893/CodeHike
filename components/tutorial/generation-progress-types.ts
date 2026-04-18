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

export type ProtocolVersion = 'unknown' | 'v2';

export type V2Status =
  | 'connecting'
  | 'generating-outline'
  | 'outline-received'
  | 'filling-step'
  | 'validating'
  | 'stream-complete'
  | 'reconnecting'
  | 'cancelling'
  | 'error';

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
  draftId: string;
  v2Status: V2Status;
  outline: OutlineData | null;
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: number[];
  stepTitles: StepTitles;
  progressValue: number;
  errorMessage: string | null;
  errorPhase: string | null;
  errorLabel: string | null;
  canRetry: boolean;
  canRetryFromStep: boolean;
  failedStepIndex: number | null;
  onRetry: () => void;
  onRetryFromStep: (stepIndex: number) => void;
  onCancel: () => void;
  isGenerating: boolean;
}
