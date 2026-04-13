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
  if (!user?.id) {
    redirect('/api/auth/signin');
  }
  const userId = user.id;

  const { id } = await params;
  const preview = await getDraftRemotePreviewPageData(id, userId);

  if (!preview) notFound();

  return (
    <RemotePreviewPage
      fetchUrl={preview.fetchUrl}
      title={preview.title}
    />
  );
}
