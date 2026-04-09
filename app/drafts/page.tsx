import { AppShell } from '@/components/app-shell';
import { DraftsPage } from '@/components/drafts-page';
import * as draftRepo from '@/lib/repositories/draft-repository';
import { connection } from 'next/server';

export default async function DraftsIndexPage() {
  await connection();
  const drafts = await draftRepo.listDraftSummaries();

  return (
    <AppShell activePath="/drafts">
      <DraftsPage drafts={JSON.parse(JSON.stringify(drafts))} />
    </AppShell>
  );
}
