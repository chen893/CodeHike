import { notFound } from 'next/navigation';
import * as draftRepo from '@/lib/repositories/draft-repository';
import { DraftWorkspace } from '@/components/draft-workspace';

export default async function DraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = await draftRepo.getDraftById(id);

  if (!draft) notFound();

  return <DraftWorkspace draft={JSON.parse(JSON.stringify(draft))} />;
}
