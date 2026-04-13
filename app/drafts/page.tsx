import { AppShell } from '@/components/app-shell';
import { DraftsPage } from '@/components/drafts-page';
import { listDraftSummariesForDashboard } from '@/lib/services/draft-queries';
import { toClientDraftSummaries } from '@/lib/utils/client-data';
import { connection } from 'next/server';
import { getCurrentUser } from '@/auth';

export default async function DraftsIndexPage() {
  await connection();
  const user = await getCurrentUser();
  if (!user?.id) {
    return (
      <AppShell activePath="/drafts" user={null}>
        <DraftsPage drafts={[]} />
      </AppShell>
    );
  }
  const drafts = await listDraftSummariesForDashboard(user.id);

  return (
    <AppShell activePath="/drafts" user={user}>
      <DraftsPage drafts={toClientDraftSummaries(drafts)} />
    </AppShell>
  );
}
