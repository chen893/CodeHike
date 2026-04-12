import { db } from '../db';
import { drafts, publishedTutorials } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getPublishedTutorialByDraftId } from '../repositories/published-tutorial-repository';

export async function unpublishDraft(draftId: string): Promise<void> {
  // Find the published tutorial for this draft
  const published = await getPublishedTutorialByDraftId(draftId);
  if (!published) {
    throw new Error('Draft is not published');
  }

  // Transaction: delete published tutorial + update draft status
  await db.transaction(async (tx) => {
    await tx
      .delete(publishedTutorials)
      .where(eq(publishedTutorials.id, published.id));

    await tx
      .update(drafts)
      .set({
        status: 'draft',
        publishedSlug: null,
        publishedTutorialId: null,
        publishedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draftId));
  });
}
