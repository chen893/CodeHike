import { notFound } from 'next/navigation';
import { TutorialScrollyDemo } from '../../../../components/tutorial-scrolly-demo';
import { buildTutorialSteps } from '../../../../lib/tutorial-assembler';
import * as draftRepo from '@/lib/repositories/draft-repository';

export default async function DraftPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = await draftRepo.getDraftById(id);

  if (!draft?.tutorialDraft) notFound();

  const steps = await buildTutorialSteps(draft.tutorialDraft as any);

  return (
    <main className="tutorial-page">
      <TutorialScrollyDemo
        steps={steps}
        intro={draft.tutorialDraft.intro.paragraphs}
        title={draft.tutorialDraft.meta.title}
        fileName={draft.tutorialDraft.meta.fileName}
      />
    </main>
  );
}
