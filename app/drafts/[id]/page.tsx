import { notFound, redirect } from 'next/navigation';
import { DraftWorkspace } from '@/components/draft-workspace';
import { getDraftDetail } from '@/lib/services/draft-queries';
import { toClientDraftRecord } from '@/lib/utils/client-data';
import { getCurrentUser } from '@/auth';

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user?.id) {
    const { id } = await params;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/drafts/${id}`)}`);
  }
  const userId = user.id;

  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const draft = await getDraftDetail(id, userId);

  if (!draft) notFound();

  const generateParam = query.generate;
  const modelIdParam = query.modelId;
  const shouldStartGeneration =
    generateParam === '1' || generateParam === 'true';
  const generationModelId =
    typeof modelIdParam === 'string' ? modelIdParam : undefined;

  return (
    <DraftWorkspace
      draft={toClientDraftRecord(draft)}
      startGeneration={shouldStartGeneration}
      generationModelId={generationModelId}
    />
  );
}
