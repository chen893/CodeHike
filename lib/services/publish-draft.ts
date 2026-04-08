import { db } from '../db';
import { drafts, publishedTutorials } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as draftRepo from '../repositories/draft-repository';
import * as publishedRepo from '../repositories/published-tutorial-repository';
import { generateSlug, isReservedSlug } from '../utils/slug';
import { publishRequestSchema } from '../schemas/api';
import type { PublishedTutorial } from '../types/api';

export async function publishDraft(
  draftId: string,
  input?: { slug?: string }
): Promise<PublishedTutorial> {
  const parsed = publishRequestSchema.parse(input || {});

  const draft = await draftRepo.getDraftById(draftId);
  if (!draft) throw new Error('Draft not found');
  if (!draft.tutorialDraft) throw new Error('Draft has no tutorial content');
  if (draft.syncState !== 'fresh')
    throw new Error(
      'Draft is not in sync. Regenerate before publishing.'
    );
  if (!draft.validationValid)
    throw new Error(
      'Draft validation failed. Fix errors before publishing.'
    );

  const slug = parsed.slug || generateSlug(draft.tutorialDraft.meta.title);

  if (isReservedSlug(slug))
    throw new Error(`Slug "${slug}" is reserved`);

  if (await publishedRepo.isSlugTaken(slug))
    throw new Error(`Slug "${slug}" is already taken`);

  // Transaction: create published tutorial + update draft
  const published = await db.transaction(async (tx) => {
    const [publishedRow] = await tx
      .insert(publishedTutorials)
      .values({
        draftRecordId: draft.id,
        slug,
        tutorialDraftSnapshot: draft.tutorialDraft as any,
      })
      .returning();

    await tx
      .update(drafts)
      .set({
        status: 'published',
        publishedSlug: slug,
        publishedTutorialId: publishedRow.id,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, draft.id));

    return {
      id: publishedRow.id,
      draftRecordId: publishedRow.draftRecordId,
      slug: publishedRow.slug,
      tutorialDraftSnapshot: publishedRow.tutorialDraftSnapshot,
      createdAt: publishedRow.createdAt,
      publishedAt: publishedRow.publishedAt,
    } as PublishedTutorial;
  });

  return published;
}
