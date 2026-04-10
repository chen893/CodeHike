import { notFound } from 'next/navigation';
import { DraftWorkspace } from '@/components/draft-workspace';
import { getDraftDetail } from '@/lib/services/draft-queries';
import { toClientDraftRecord } from '@/lib/utils/client-data';

export default async function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = await getDraftDetail(id);

  if (!draft) notFound();

  return <DraftWorkspace draft={toClientDraftRecord(draft)} />;
}
