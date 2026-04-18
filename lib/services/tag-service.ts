/**
 * Tag service — orchestration layer for tag generation and assignment.
 * Called by route handlers and publish-draft service.
 *
 * v3.11: Enforces controlled vocabulary constraint (D-07).
 * AI output is validated against vocabulary; unknown tags go to candidate queue (D-08).
 */

import { generateTags } from '../ai/tag-generator';
import * as tagRepo from '../repositories/tag-repository';
import * as tagRelationRepo from '../repositories/tag-relation-repository';
import * as candidateRepo from '../repositories/tag-candidate-repository';
import { trackTutorialTagged } from '../monitoring/analytics';
import type { TutorialTag } from '../types/api';

/**
 * Generate tags via AI and assign them to a tutorial.
 * Enforces vocabulary constraint: only vocabulary tags are assigned to tutorials.
 * Non-vocabulary tags are routed to the candidate queue for review (D-07/D-08).
 */
export async function generateAndAssignTags(
  tutorialId: string,
  title: string,
  description: string,
  lang: string,
): Promise<TutorialTag[]> {
  // Fetch vocabulary for AI constraint (D-07)
  const vocabTags = await tagRepo.getVocabularyGroupedByType();
  const vocabulary: Record<string, string[]> = {};
  for (const [type, tags] of Object.entries(vocabTags)) {
    vocabulary[type] = tags.map((t) => t.name);
  }

  const { tags: tagNames, candidates } = await generateTags(title, description, lang, vocabulary);

  // Validate tags against vocabulary (D-07 hard constraint)
  const validTagNames: string[] = [];
  for (const name of tagNames) {
    const isVocab = await tagRepo.isVocabularyTag(name);
    if (isVocab) {
      validTagNames.push(name);
    } else {
      // Route to candidate queue (D-08)
      await candidateRepo.createCandidate({
        name,
        suggestedBy: 'ai',
        tutorialId,
      });
    }
  }

  // Also route explicit candidates
  for (const candidate of candidates) {
    await candidateRepo.createCandidate({
      name: candidate,
      suggestedBy: 'ai',
      tutorialId,
    });
  }

  // Resolve valid tags to records and associate with tutorial
  const tagPromises = validTagNames.map((name) => tagRepo.getOrCreateTag(name));
  const tags = await Promise.all(tagPromises);
  const tagIds = tags.map((t) => t.id);
  await tagRepo.setTagsForTutorial(tutorialId, tagIds);

  // Fire-and-forget analytics
  trackTutorialTagged(tutorialId, tags.map((t) => t.name));

  return tags;
}

/**
 * Get all tags assigned to a tutorial.
 */
export async function getTutorialTags(
  tutorialId: string,
): Promise<TutorialTag[]> {
  return tagRepo.getTagsForTutorial(tutorialId);
}

/**
 * Manually set tags for a tutorial by tag names.
 * Used by the tag editor UI. Normalizes names before lookup.
 */
export async function setTutorialTagsByName(
  tutorialId: string,
  tagNames: string[],
): Promise<TutorialTag[]> {
  // Normalize: trim, remove empty, deduplicate
  const normalized = [...new Set(
    tagNames
      .map((n) => n.trim())
      .filter((n) => n.length > 0 && n.length <= 64),
  )];

  // Resolve each tag name to a tag record (create if needed)
  const tagPromises = normalized.map((name) => tagRepo.getOrCreateTag(name));
  const tags = await Promise.all(tagPromises);

  // Associate all tags with the tutorial
  const tagIds = tags.map((t) => t.id);
  await tagRepo.setTagsForTutorial(tutorialId, tagIds);

  // Fire-and-forget analytics
  trackTutorialTagged(tutorialId, tags.map((t) => t.name));

  return tags;
}

/**
 * Get tag detail for the tag detail page: tag info + related tags (D-15).
 * Tutorial list is fetched separately via explore-service with tag filter.
 */
export async function getTagDetail(slug: string): Promise<{
  tag: TutorialTag;
  relatedTags: (TutorialTag & { strength: number })[];
} | null> {
  const tag = await tagRepo.getTagBySlug(slug);
  if (!tag) return null;

  const relatedTags = await tagRelationRepo.getRelatedTags(tag.id, 10);

  return { tag, relatedTags };
}
