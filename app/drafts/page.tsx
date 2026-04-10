import { AppShell } from '@/components/app-shell';
import { DraftsPage } from '@/components/drafts-page';
import { listDraftSummariesForDashboard } from '@/lib/services/draft-queries';
import { toClientDraftSummaries } from '@/lib/utils/client-data';
import { connection } from 'next/server';

export default async function DraftsIndexPage() {
  await connection();
  const drafts = await listDraftSummariesForDashboard();

  return (
    <AppShell activePath="/drafts">
      <DraftsPage drafts={toClientDraftSummaries(drafts)} />
    </AppShell>
  );
}
