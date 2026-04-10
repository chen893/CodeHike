import { notFound } from 'next/navigation';
import { TutorialScrollyDemo } from '../../../../components/tutorial-scrolly-demo';
import { getDraftPreviewPageData } from '@/lib/services/draft-queries';

export default async function DraftPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const preview = await getDraftPreviewPageData(id);

  if (!preview) notFound();

  return (
    <main className="min-h-screen">
      <TutorialScrollyDemo
        steps={preview.steps}
        intro={preview.intro}
        title={preview.title}
        fileName={preview.fileName}
      />
    </main>
  );
}
