import { notFound, redirect } from 'next/navigation';
import { RemotePreviewPage } from '../../../../../components/remote-preview-page';
import { getDraftRemotePreviewPageData } from '@/lib/services/draft-queries';
import { getCurrentUser } from '@/auth';

export default async function DraftRemotePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user?.id) {
    redirect(
      `/auth/signin?callbackUrl=${encodeURIComponent(`/drafts/${id}/preview/request`)}`
    );
  }
  const userId = user.id;
  const preview = await getDraftRemotePreviewPageData(id, userId);

  if (!preview) notFound();

  return (
    <RemotePreviewPage
      fetchUrl={preview.fetchUrl}
      title={preview.title}
    />
  );
}
