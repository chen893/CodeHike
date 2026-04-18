'use client';

import type { GenerationContext } from '@/components/tutorial/generation-progress-types';
import { GenerationProgressView } from '@/components/tutorial/generation-progress-view';
import { useGenerationProgress } from '@/components/tutorial/use-generation-progress';

export type { GenerationContext } from '@/components/tutorial/generation-progress-types';

interface GenerationProgressProps {
  draftId: string;
  onComplete: () => void;
  onExit?: () => void;
  context: GenerationContext;
  modelId?: string;
  startNewGeneration?: boolean;
}

export function GenerationProgress({
  draftId,
  onComplete,
  onExit,
  context,
  modelId,
  startNewGeneration = false,
}: GenerationProgressProps) {
  const controller = useGenerationProgress({
    draftId,
    onComplete,
    modelId,
    startNewGeneration,
  });

  return (
    <GenerationProgressView
      draftId={draftId}
      context={context}
      controller={controller}
      onExit={onExit}
    />
  );
}
