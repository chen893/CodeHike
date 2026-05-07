import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth';
import { OutlineReviewWorkspace } from '@/components/drafts/outline-review-workspace';
import { getDraftDetail } from '@/lib/services/draft-queries';
import { isDraftGenerationMode } from '@/lib/types/generation-mode';
import { toClientDraftRecord } from '@/lib/utils/client-data';

export default async function DraftOutlinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/drafts/${id}/outline`)}`);
  }

  const draft = await getDraftDetail(id, user.id);
  if (!draft) notFound();

  if (draft.tutorialDraft && draft.generationState !== 'failed') {
    redirect(`/drafts/${id}`);
  }

  const query = searchParams ? await searchParams : {};
  const generateParam = query.generate;
  const modelIdParam = query.modelId;
  const generationModeParam = query.generationMode;
  const fromStepParam = query.fromStep;

  const shouldStartGeneration =
    generateParam === '1' || generateParam === 'true';

  if (shouldStartGeneration && draft.generationState === 'running') {
    redirect(`/drafts/${id}/outline`);
  }

  const generationModelId =
    typeof modelIdParam === 'string' ? modelIdParam : undefined;
  const recoveryStartStepIndex =
    typeof fromStepParam === 'string' && /^\d+$/.test(fromStepParam)
      ? Number(fromStepParam)
      : undefined;
  const generationMode =
    typeof generationModeParam === 'string' &&
    isDraftGenerationMode(generationModeParam)
      ? generationModeParam
      : 'outline_review';

  return (
    <OutlineReviewWorkspace
      draft={toClientDraftRecord(draft)}
      startGeneration={shouldStartGeneration}
      generationModelId={generationModelId}
      generationMode={generationMode}
      recoveryStartStepIndex={recoveryStartStepIndex}
    />
  );
}
