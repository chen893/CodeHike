'use client';

import type { GenerationContext } from '@/components/tutorial/generation-progress-types';
import { GenerationProgressView } from '@/components/tutorial/generation-progress-view';
import { useGenerationProgress } from '@/components/tutorial/use-generation-progress';

export type { GenerationContext } from '@/components/tutorial/generation-progress-types';

interface GenerationProgressProps {
  draftId: string;
  onComplete: () => void;
  context: GenerationContext;
  modelId?: string;
}

export function GenerationProgress({
  draftId,
  onComplete,
  context,
  modelId,
}: GenerationProgressProps) {
  const controller = useGenerationProgress({ draftId, onComplete, modelId });

  return (
    <GenerationProgressView
      draftId={draftId}
      context={context}
      controller={controller}
    />
  );
}
