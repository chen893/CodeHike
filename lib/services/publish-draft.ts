import { db } from '../db';
import { drafts, publishedTutorials } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as draftRepo from '../repositories/draft-repository';
import * as publishedRepo from '../repositories/published-tutorial-repository';
import { generateSlug, isReservedSlug } from '../utils/slug';
import { publishRequestSchema } from '../schemas/api';
import type { PublishedTutorial } from '../types/api';
import { generateAndAssignTags } from './tag-service';
import { PublishSlugConflictError } from '../errors/error-types';

/**
 * Check whether a Postgres error is a unique constraint violation (error code 23505).
 * Works with both node-postgres and Drizzle wrapped errors.
 */
function isUniqueViolation(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Standard Postgres error code for unique_violation
    if (e.code === '23505') return true;
    // Some drivers / ORMs nest the driver error under .driverError or .cause
    if (e.driverError && isUniqueViolation(e.driverError)) return true;
    if (e.cause && isUniqueViolation(e.cause)) return true;
  }
  return false;
}

export async function publishDraft(
  draftId: string,
  input: { slug?: string } | undefined,
  userId: string
): Promise<PublishedTutorial> {
  const parsed = publishRequestSchema.parse(input || {});

  const draft = await draftRepo.getDraftById(draftId, userId);
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

  // Early-exit optimization: if the slug is already taken, fail fast
  // before entering the transaction. The authoritative guard is the
  // unique constraint violation caught below.
  if (await publishedRepo.isSlugTaken(slug))
    throw new PublishSlugConflictError(slug);

  // Transaction: create published tutorial + update draft
  // The DB unique constraint on published_tutorials.slug is the
  // authoritative guard against TOCTOU races.
  let published: PublishedTutorial;
  try {
    published = await db.transaction(async (tx) => {
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
  } catch (err: unknown) {
    // If the unique constraint on slug was violated, throw a structured
    // conflict error instead of surfacing a raw Postgres error.
    if (isUniqueViolation(err)) {
      throw new PublishSlugConflictError(slug);
    }
    throw err;
  }

  // Auto-generate tags for the published tutorial (fire-and-forget)
  const meta = draft.tutorialDraft.meta;
  generateAndAssignTags(
    published.id,
    meta.title,
    meta.description || '',
    meta.lang || '',
  ).catch((err) => {
    console.warn('[publish-draft] Auto-tagging failed (non-blocking):', err);
  });

  return published;
}
