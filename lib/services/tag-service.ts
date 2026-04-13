/**
 * Tag service — orchestration layer for tag generation and assignment.
 * Called by route handlers and publish-draft service.
 */

import { generateTags } from '../ai/tag-generator';
import * as tagRepo from '../repositories/tag-repository';
import type { TutorialTag } from '../types/api';

/**
 * Generate tags via AI and assign them to a tutorial.
 * Called after a tutorial is published.
 */
export async function generateAndAssignTags(
  tutorialId: string,
  title: string,
  description: string,
  lang: string,
): Promise<TutorialTag[]> {
  const tagNames = await generateTags(title, description, lang);

  // Resolve each tag name to a tag record (create if needed)
  const tagPromises = tagNames.map((name) => tagRepo.getOrCreateTag(name));
  const tags = await Promise.all(tagPromises);

  // Associate all tags with the tutorial
  const tagIds = tags.map((t) => t.id);
  await tagRepo.setTagsForTutorial(tutorialId, tagIds);

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

  return tags;
}
