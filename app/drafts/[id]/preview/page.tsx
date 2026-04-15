import { notFound, redirect } from 'next/navigation';
import { TutorialScrollyDemo } from '../../../../components/tutorial-scrolly-demo';
import { getDraftPreviewPageData } from '@/lib/services/draft-queries';
import { getCurrentUser } from '@/auth';

export default async function DraftPreviewPage({
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
  const preview = await getDraftPreviewPageData(id, userId);

  if (!preview) notFound();

  return (
    <main className="min-h-screen">
      <TutorialScrollyDemo
        steps={preview.steps}
        intro={preview.intro}
        title={preview.title}
        fileName={preview.fileName}
        chapters={preview.chapters}
        stepChapterMeta={preview.stepChapterMeta}
      />
    </main>
  );
}
