import { TopNav } from '@/components/top-nav';
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
      <>
        <TopNav activePath="/drafts" user={null} />
        <div className="pt-14">
          <DraftsPage drafts={[]} />
        </div>
      </>
    );
  }
  const drafts = await listDraftSummariesForDashboard(user.id);

  return (
    <>
      <TopNav activePath="/drafts" user={user} />
      <div className="pt-14">
        <DraftsPage drafts={toClientDraftSummaries(drafts)} />
      </div>
    </>
  );
}
