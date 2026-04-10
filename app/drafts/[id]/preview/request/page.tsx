import { notFound } from 'next/navigation';
import { RemotePreviewPage } from '../../../../../components/remote-preview-page';
import { getDraftRemotePreviewPageData } from '@/lib/services/draft-queries';

export default async function DraftRemotePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const preview = await getDraftRemotePreviewPageData(id);

  if (!preview) notFound();

  return (
    <RemotePreviewPage
      fetchUrl={preview.fetchUrl}
      title={preview.title}
    />
  );
}
