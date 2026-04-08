import { notFound } from 'next/navigation';
import { RemotePreviewPage } from '../../../../../components/remote-preview-page';
import * as draftRepo from '@/lib/repositories/draft-repository';

export default async function DraftRemotePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = await draftRepo.getDraftById(id);

  if (!draft?.tutorialDraft) notFound();

  return (
    <RemotePreviewPage
      fetchUrl={`/api/drafts/${id}/payload`}
      title={draft.tutorialDraft.meta.title}
    />
  );
}
