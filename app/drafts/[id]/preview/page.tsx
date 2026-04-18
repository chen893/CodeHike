import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { TutorialScrollyDemo } from '../../../../components/tutorial-scrolly-demo';
import { getDraftPreviewPageData } from '@/lib/services/draft-queries';
import { getCurrentUser } from '@/auth';

export default async function DraftPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/drafts/${id}/preview`)}`);
  }
  const userId = user.id;
  const preview = await getDraftPreviewPageData(id, userId);

  if (!preview) notFound();

  return (
    <main className="min-h-screen">
      <div className="sticky top-0 z-50 flex h-12 items-center border-b border-border bg-card/80 px-4 backdrop-blur-xl lg:px-8">
        <Link
          href={`/drafts/${id}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          返回编辑
        </Link>
        <span className="mx-3 h-4 w-px bg-border" />
        <span className="text-sm text-muted-foreground">预览模式</span>
      </div>
      <TutorialScrollyDemo
        steps={preview.steps}
        intro={preview.intro}
        title={preview.title}
        fileName={preview.fileName}
        chapters={preview.chapters}
        stepChapterMeta={preview.stepChapterMeta}
        previewMode
        showCompletion={false}
      />
    </main>
  );
}
