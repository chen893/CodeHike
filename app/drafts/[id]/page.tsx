import { notFound, redirect } from 'next/navigation';
import { DraftWorkspace } from '@/components/draft-workspace';
import { getDraftDetail } from '@/lib/services/draft-queries';
import { toClientDraftRecord } from '@/lib/utils/client-data';
import { getCurrentUser } from '@/auth';

export default async function DraftPage({
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
  const draft = await getDraftDetail(id, userId);

  if (!draft) notFound();

  return <DraftWorkspace draft={toClientDraftRecord(draft)} />;
}
