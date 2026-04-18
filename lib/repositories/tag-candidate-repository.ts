/**
 * Tag candidate repository — CRUD for the tag candidate queue (D-08).
 * Unknown tags suggested by AI (not in controlled vocabulary) are stored here
 * for manual review before being promoted to the approved vocabulary.
 */

import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { tagCandidates } from '../db/schema';

export async function createCandidate(data: {
  name: string;
  suggestedBy?: string;
  tutorialId?: string;
}) {
  const [row] = await db
    .insert(tagCandidates)
    .values({
      name: data.name,
      suggestedBy: data.suggestedBy ?? 'ai',
      tutorialId: data.tutorialId,
    })
    .returning();
  return row;
}

export async function listPendingCandidates() {
  return db
    .select()
    .from(tagCandidates)
    .where(eq(tagCandidates.status, 'pending'))
    .orderBy(desc(tagCandidates.createdAt));
}

export async function approveCandidate(candidateId: string): Promise<void> {
  // Verify candidate exists
  const [candidate] = await db
    .select()
    .from(tagCandidates)
    .where(eq(tagCandidates.id, candidateId));
  if (!candidate) throw new Error('Candidate not found');

  // Mark as approved
  await db
    .update(tagCandidates)
    .set({ status: 'approved' })
    .where(eq(tagCandidates.id, candidateId));
}

export async function rejectCandidate(candidateId: string): Promise<void> {
  await db
    .update(tagCandidates)
    .set({ status: 'rejected' })
    .where(eq(tagCandidates.id, candidateId));
}
